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
                     walker.on('directories', (parentDir: string, dirArray: { name: string }[], nextDir: () => void) => {
                // Filter out any subdirectory that should be excluded
                const keptDirs = dirArray.filter(dirInfo => {
                    const absoluteDirPath = upath.resolve(parentDir, dirInfo.name);
                    const relativeDirPath = upath.relative(this.srcDir, absoluteDirPath);
                    // We'll decide to KEEP it only if it passes include/exclude rules
                    return this.shouldDescendIntoDirectory(relativeDirPath);
                });

                // mutate dirArray in-place so walker will only descend into keptDirs
                dirArray.length = 0;
                dirArray.push(...keptDirs);

                nextDir();
            });
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
    private shouldDescendIntoDirectory(relativeDirPath: string): boolean {
    // Normalize to folder-style path with trailing slash so filters like "node_modules/**" match cleanly
    const normalized = relativeDirPath ? relativeDirPath.replace(/\\/g, "/") + "/" : "";

    const passesAnd = this.filenameFiltersAnd.every(filter => filter.includes(normalized));
    const passesOr =
        this.filenameFiltersOr.length === 0 ||
        this.filenameFiltersOr.some(filter => filter.includes(normalized));

    const keep = passesAnd && passesOr;

    if (!keep) {
        this.log.debug(`Prune directory (skip walking into): ${relativeDirPath || "."}`);
    }

    return keep;
}

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