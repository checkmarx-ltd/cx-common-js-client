import * as fs from 'fs';
import * as path from "path";
import archiver, { Archiver, ArchiverError, ProgressData } from 'archiver';
import { Logger } from "./logger";
import { walk } from "walk";
import { FilePathFilter } from "./filePathFilter";
import { ZipResult } from "../dto/zipResult";
import * as upath from 'upath';

export default class Zipper {
    private archiver!: Archiver;

    private srcDir: string = '';

    private totalAddedFiles = 0;

    constructor(private readonly log: Logger,
        private readonly filenameFiltersAnd: FilePathFilter[] = [],
        private readonly filenameFiltersOr: FilePathFilter[] = []) {
    }

    private addSingleFileToZip(srcFile: string) {
        const index: number = srcFile.lastIndexOf(path.sep);
        const fileName: string = srcFile.substring(index + 1);
        if (this.filenameFiltersAnd.every(filter => filter.includes(fileName)) || this.filenameFiltersOr.some(filter => filter.includes(fileName))) {
            this.log.debug(` Add: ${srcFile}`);
            this.archiver.file(srcFile, {
                name: fileName,
                prefix: ''
            });
        } else {
            this.log.debug(`Skip: ${srcFile}`);
        }
    }

    zipDirectory(srcDir: string, targetPath: string, fingerprintsFile?: string): Promise<ZipResult> {
        this.totalAddedFiles = 0;
        this.srcDir = srcDir;        
        return new Promise<ZipResult>((resolve, reject) => {
            this.archiver = this.createArchiver(reject);
            const zipOutput = this.createOutputStream(targetPath, resolve);
            this.archiver.pipe(zipOutput);

            if (fingerprintsFile) {
                this.addSingleFileToZip(fingerprintsFile);
            }                     
               
                if (fs.lstatSync(srcDir).isDirectory()) {            
                    this.log.debug('Discovering files in source directory.');
                    // followLinks is set to true to conform to Common Client behavior.
                    const walker = walk(this.srcDir, { followLinks: true });
                    
                    // Performance optimization: Skip excluded directories entirely
                    walker.on('directories', this.skipExcludedDirectories);
                    
                    walker.on('file', this.addFileToArchive);
                    walker.on('end', () => {
                        this.log.debug('Finished discovering files in source directory.');
                        this.archiver.finalize();
                    });
                } else {
                    this.addSingleFileToZip(srcDir);
                        this.archiver.finalize();
                }  
        });
    }

    private createArchiver(reject: any) {
        const result = archiver('zip', { zlib: { level: 9 } });

        result.on('warning', (err: ArchiverError) => {
            this.log.warning(`Archiver: ${err.message}`);
        });

        result.on('error', (err: ArchiverError) => {
            reject(err);
        });

        result.on('progress', (data: ProgressData) => {
            this.totalAddedFiles = data.entries.processed;
        });
        return result;
    }

    private createOutputStream(targetPath: string, resolve: (value: ZipResult) => void) {
        const result = fs.createWriteStream(targetPath);
        result.on('close', () => {
            const zipResult: ZipResult = {
                fileCount: this.totalAddedFiles
            };

            this.log.info(`Acrhive creation completed. Total bytes written: ${this.archiver.pointer()}, files: ${this.totalAddedFiles}.`);
            resolve(zipResult);
        });
        return result;
    }

    private skipExcludedDirectories = (parentDir: string, dirs: any[], discoverNextDir: () => void) => {
        // Filter directories in-place by checking each against the filters
        for (let i = dirs.length - 1; i >= 0; i--) {
            const dirStats = dirs[i];
            const absoluteDirPath = upath.resolve(parentDir, dirStats.name);
            const relativeDirPath = upath.relative(this.srcDir, absoluteDirPath);
            
            // Check if this directory is explicitly excluded by checking if the directory path
            // itself matches an exclusion pattern (like **/node_modules/** or **/bin/**)
            let isExcluded = false;
            
            // Check all AND filters - if ANY filter explicitly excludes this directory, skip it
            for (const filter of this.filenameFiltersAnd) {
                if (filter.isDirectoryExcluded(relativeDirPath)) {
                    isExcluded = true;
                    break;
                }
            }
            
            // If not excluded by AND filters, check OR filters
            if (!isExcluded && this.filenameFiltersOr.length > 0) {
                // For OR filters, skip directory only if ALL OR filters would exclude it
                const excludedByAllOrFilters = this.filenameFiltersOr.every(filter => 
                    filter.isDirectoryExcluded(relativeDirPath)
                );
                if (excludedByAllOrFilters) {
                    isExcluded = true;
                }
            }
            
            if (isExcluded) {
                this.log.debug(`Skip directory: ${absoluteDirPath}`);
                dirs.splice(i, 1);  // Remove this directory from traversal
            }
        }
        
        discoverNextDir();
    };

    private addFileToArchive = (parentDir: string, fileStats: any, discoverNextFile: () => void) => {
        const absoluteFilePath = upath.resolve(parentDir, fileStats.name);
        const relativeFilePath = upath.relative(this.srcDir, absoluteFilePath);

        // relativeFilePath is normalized to contain forward slashes independent of the current OS. Examples:
        //      page.cs                             - if page.cs is at the project's root dir
        //      services/internal/myservice.js      - if myservice.js is in a nested dir
        if (this.filenameFiltersAnd.every(filter => filter.includes(relativeFilePath)) && (!this.filenameFiltersOr.length || this.filenameFiltersOr.some(filter => filter.includes(relativeFilePath)))) {
            this.log.debug(` Add: ${absoluteFilePath}`);

            const relativeDirInArchive = upath.relative(this.srcDir, parentDir);
            this.archiver.file(absoluteFilePath, {
                name: fileStats.name,
                prefix: relativeDirInArchive
            });
        } else {
            this.log.debug(`Skip: ${absoluteFilePath}`);
        }

        discoverNextFile();
    };
}