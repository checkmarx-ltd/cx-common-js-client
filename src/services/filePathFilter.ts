import * as micromatch from "micromatch";

// Allows to include/exclude files based on a filter pattern.
// The behavior is intended to be as close as possible to the Common Client. Therefore the behavior is different
// from the previous (PowerShell) versions of this plugin.
// E.g. where PowerShell plugin uses `*.java`, the current plugin should use `**/*.java`
export class FilePathFilter {
    private readonly PATTERN_SEPARATOR = ',';
    private readonly EXCLUSION_INDICATOR = '!';

    private static readonly fileMatcherOptions: micromatch.Options = {
        dot: true,      // Match dotfiles.
        nonegate: true, // We handle negation internally.
        // Disable extended functionality that we don't expect in a pattern.
        nobrace: true,
        noext: true
    };

    private include: string[] = [];
    private exclude: string[] = [];

    constructor(filterPattern: string, excludedFolders: string) {
        this.parseFilterPattern(filterPattern);
        this.parseExcludedFolders(excludedFolders);
    }

    /**
     * Indicates if a given path passes through the current filter.
     */
    includes(path: string): boolean {
        const matchesAnyInclusionPattern = micromatch.any(path, this.include, FilePathFilter.fileMatcherOptions);
        const matchesAnyExclusionPattern = micromatch.any(path, this.exclude, FilePathFilter.fileMatcherOptions);
        return matchesAnyInclusionPattern && !matchesAnyExclusionPattern;
    }

    hasInclude(): boolean {
        return Boolean(this.include.length)
    }

    /**
     * Check if a directory path should be completely excluded from traversal.
     * This is used for performance optimization to skip entire directories.
     * Returns true if the directory matches an exclusion pattern that would exclude ALL its contents.
     */
isDirectoryExcluded(dirPath: string): boolean {
        // Check if this directory path matches any exclusion pattern
        // We append /** to test if all contents would be excluded
        const dirPattern = dirPath + '/**';
        return micromatch.any(dirPattern, this.exclude, FilePathFilter.fileMatcherOptions);
    }

    private parseFilterPattern(filterPattern: string) {
        // Distribute the patterns from the input string into inclusion or exclusion arrays.
        filterPattern.split(this.PATTERN_SEPARATOR)
            .map(pattern => pattern.trim())
            .forEach(pattern => {
                if (pattern.startsWith(this.EXCLUSION_INDICATOR)) {
                    const excluded = pattern.substring(this.EXCLUSION_INDICATOR.length).trim();
                    if (excluded.length) {
                        this.exclude.push(excluded);
                    }
                } else if (pattern.length) {
                    this.include.push(pattern);
                }
            });

        // If there are no including patterns, assume that we want to include all files by default.
        if (!this.include.length) {
            const INCLUDE_ALL = '**';
            // Otherwise no files will be included at all.
            this.include.push(INCLUDE_ALL);
        }
    }

    private parseExcludedFolders(excludedFolders: string) {
        const foldersAsFilterPatterns = excludedFolders.split(this.PATTERN_SEPARATOR)
            .map(pattern => pattern.trim())
            .filter(pattern => pattern)
              // The folder should be excluded when found at any depth.
            .map(pattern => `**/${pattern}/**`);

        this.exclude.push(...foldersAsFilterPatterns);
    }
}