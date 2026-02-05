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

    private filePathsByName: Map<string, string[]> = new Map();

    // Flag to enable/disable deduplication (disabled by default for backward compatibility)
    private enableDeduplication: boolean = false;

    constructor(private readonly log: Logger,
        private readonly filenameFiltersAnd: FilePathFilter[] = [],
        private readonly filenameFiltersOr: FilePathFilter[] = [],
        enableDeduplication: boolean = false) {
        this.enableDeduplication = enableDeduplication;
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
        // Reset file tracking for deduplication
        this.filePathsByName.clear();
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
                        const keptDirs = dirArray.filter(dirInfo => {
                            const name = dirInfo.name;

                            if (name === '.' || name === '..') {
                                this.log?.debug?.(`Skip: ${name} (directory)`);
                                return false;
                            }
                            const absoluteDirPath = upath.resolve(parentDir, name);
                            try {
                                if (fs.lstatSync(absoluteDirPath).isSymbolicLink()) {
                                    this.log?.debug?.(`Skip: ${absoluteDirPath} (symlink directory)`);
                                    return false;
                                }
                            } catch (err) {
                                this.log.warning(`lstat failed for ${absoluteDirPath}: ${err.message}`);
                            }
                            const relativeDirPath = upath.relative(this.srcDir, absoluteDirPath);
                            return this.shouldDescendIntoDirectory(relativeDirPath);
                        });
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
        let normalized = relativeDirPath.replace(/\\/g, "/");
        if (normalized && !normalized.endsWith("/")) {
            normalized += "/";
        }
        const dirName = normalized.split('/').filter(Boolean).pop();

        const isExcludedByName = this.filenameFiltersAnd.some(filter =>
            filter.getExcludePatterns().some(pattern => {
                const excludedDir = pattern.replace('/**', '').replace('/', '');
                return excludedDir === dirName;
            })
        );

        const directoryPassesFilter = this.filenameFiltersAnd.every(filter =>
            filter.includes(normalized)
        );
        const hasSpecificFileInclusionsInDirectory = this.filenameFiltersAnd.some(filter =>
            this.filterHasSpecificInclusionsInDirectory(filter, normalized)
        );

        if (isExcludedByName) {
            const displayPath = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
            const depth = displayPath.split('/').filter(Boolean).length;

            const hasSpecificFilePatterns = this.filenameFiltersAnd.some(filter => {
                const includePatterns = filter.getIncludePatterns();
                return includePatterns.some(pattern => {
                    return pattern !== '**' && pattern.length > 0;
                });
            });

            if (!hasSpecificFilePatterns) {
        
                if (depth === 1) {
                    this.log.debug(`Skip: ${displayPath || "."} (directory)`);
                } else {
                    this.log.debug(`Skip: ${displayPath} (nested directory)`);
                }
                return false;
            }

            if (depth === 1) {
                this.log.debug(`Skip: ${displayPath || "."} (directory)`);
            } else {
                this.log.debug(`Skip: ${displayPath} (nested directory)`);
            }
            
        }

        const keep = directoryPassesFilter || hasSpecificFileInclusionsInDirectory;

        return keep;
    }

    
    private filterHasSpecificInclusionsInDirectory(filter: FilePathFilter, normalizedDirPath: string): boolean {
        const includePatterns = filter.getIncludePatterns();
        const excludePatterns = filter.getExcludePatterns();
        const isDirectoryExcluded = excludePatterns.some(excludePattern => {
            return normalizedDirPath.startsWith(excludePattern.replace('/**', '/'));
        });
        return includePatterns.some((pattern: string) => {
           
            if (pattern.startsWith(normalizedDirPath) && pattern.length > normalizedDirPath.length) {
                return true;
            }

            if (pattern.includes('**')) {
                if (isDirectoryExcluded) {
                   
                    const patternPrefix = pattern.substring(0, pattern.indexOf('**'));

                    if (patternPrefix && normalizedDirPath.startsWith(patternPrefix)) {
                        return true;
                    }

                    const patternAfterGlob = pattern.substring(pattern.indexOf('**') + 2);
                    if (patternAfterGlob.startsWith('/')) {
                        const pathAfterGlob = patternAfterGlob.substring(1);
                        const dirNameWithoutSlash = normalizedDirPath.endsWith('/')
                            ? normalizedDirPath.slice(0, -1)
                            : normalizedDirPath;
                        if (pathAfterGlob.startsWith(dirNameWithoutSlash + '/') || pathAfterGlob === dirNameWithoutSlash) {
                            return true;
                        }
                    }
                    const afterGlob = pattern.substring(pattern.indexOf('**') + 2);
                    const isSpecificPattern = afterGlob &&
                                             afterGlob !== '/*' &&
                                             afterGlob !== '/**' &&
                                             afterGlob.length > 0;

                    if (isSpecificPattern) {
                        const isRootLevelDir = !normalizedDirPath.includes('/') ||
                                              (normalizedDirPath.match(/\//g) || []).length === 1;

                        if (isRootLevelDir) {
                            return true;
                        }
                    }
                    return false;
                } else {
                    
                    return true;
                }
            }

            return false;
        });
    }

    
    private shouldAddFileBasedOnLocation(filename: string, relativeFilePath: string, absoluteFilePath: string): boolean {
        if (!this.enableDeduplication) {
            return true;
        }

        if (!this.filePathsByName.has(filename)) {
            this.filePathsByName.set(filename, []);
        }

        const existingPaths = this.filePathsByName.get(filename)!;

        const currentDepth = (relativeFilePath.match(/\//g) || []).length;

        for (const existingPath of existingPaths) {
            const existingDepth = (existingPath.match(/\//g) || []).length;

            if (existingDepth < currentDepth) {
                this.log.debug(`Skip: ${absoluteFilePath} (duplicate file, preferring shallower location)`);
                return false;
            } else if (existingDepth > currentDepth) {
                continue;
            }
        }
        existingPaths.push(relativeFilePath);

        return true;
    }

    private addFileToArchive = (parentDir: string, fileStats: any, discoverNextFile: () => void) => {
        const absoluteFilePath = upath.resolve(parentDir, fileStats.name);
        const relativeFilePath = upath.relative(this.srcDir, absoluteFilePath).replace(/\\/g, '/');

        // relativeFilePath is normalized to contain forward slashes independent of the current OS. Examples:
        //      page.cs                             - if page.cs is at the project's root dir
        //      services/internal/myservice.js      - if myservice.js is in a nested dir

        const Allows =
        this.filenameFiltersAnd.every(filter => filter.includes(relativeFilePath)) && (!this.filenameFiltersOr.length || this.filenameFiltersOr.some(filter => filter.includes(relativeFilePath)));
        if (Allows) {
            if (this.shouldAddFileBasedOnLocation(fileStats.name, relativeFilePath, absoluteFilePath)) {
                this.log.debug(` Add: ${absoluteFilePath}`);

                const relativeDirInArchive = upath.relative(this.srcDir, parentDir);
                this.archiver.file(absoluteFilePath, {
                    name: fileStats.name,
                    prefix: relativeDirInArchive
                });
            }
        }

        discoverNextFile();
    };
}