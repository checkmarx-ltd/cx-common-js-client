/**
 * Local test script for zipper functionality
 * 
 * Usage:
 *   node test-zipper.js <sourceDir> <folderExclusion> <fileExtension>
 * 
 * Examples:
 *   node test-zipper.js C:/Users/RiyajS/Downloads/patternTest "src" ""
 *   node test-zipper.js C:/Users/RiyajS/Downloads/patternTest "src" "**/*helper.java"
 *   node test-zipper.js C:/Users/RiyajS/Downloads/patternTest "node_modules" ""
 */

const Zipper = require('./dist/services/zipper').default;
const FilePathFilter = require('./dist/services/filePathFilter').FilePathFilter;
const Logger = require('./dist/services/logger').Logger;
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const sourceDir = args[0] || 'C:/Users/RiyajS/Downloads/patternTest';
const folderExclusion = args[1] || '';
const fileExtension = args[2] || '';

console.log('='.repeat(80));
console.log('ZIPPER TEST');
console.log('='.repeat(80));
console.log(`Source Directory:  ${sourceDir}`);
console.log(`Folder Exclusion:  ${folderExclusion || '(none)'}`);
console.log(`File Extension:    ${fileExtension || '(none - all files)'}`);
console.log('='.repeat(80));
console.log('');

// Create logger with debug enabled
const logger = new Logger();
logger.setMinLogLevel('debug');

// Create filter
const filter = new FilePathFilter(fileExtension, folderExclusion);

// Create zipper
const zipper = new Zipper(logger, [filter]);

// Output file
const outputZip = path.join(__dirname, 'test-output.zip');

console.log(`Creating ZIP file: ${outputZip}`);
console.log('');

// Run the zipper
zipper.zipDirectory(sourceDir, outputZip)
    .then(result => {
        console.log('');
        console.log('='.repeat(80));
        console.log('RESULT');
        console.log('='.repeat(80));
        console.log(`Total files added: ${result.fileCount}`);
        console.log(`ZIP file created:  ${outputZip}`);
        console.log('='.repeat(80));
    })
    .catch(err => {
        console.error('');
        console.error('='.repeat(80));
        console.error('ERROR');
        console.error('='.repeat(80));
        console.error(err);
        console.error('='.repeat(80));
        process.exit(1);
    });

