@echo off
REM Test script for zipper functionality
REM 
REM Usage: run-test.cmd [scenario_number]
REM 
REM Scenarios:
REM   1 - Test PLUG-2643: Exclude src folder (empty file extension)
REM   2 - Test file pattern override: Exclude src, include **/*helper.java
REM   3 - Test performance: Exclude node_modules (empty file extension)
REM   4 - Test specific pattern: Exclude node_modules, include **/*.config
REM   5 - Custom test (edit this file to set parameters)

echo ========================================
echo Building TypeScript...
echo ========================================
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

echo.
echo ========================================
echo Running Test
echo ========================================
echo.

set TEST_DIR=C:\Users\RiyajS\Downloads\patternTest

if "%1"=="" (
    echo Please specify a scenario number (1-5)
    echo.
    echo Scenarios:
    echo   1 - Exclude src folder (empty file extension)
    echo   2 - Exclude src, include **/*helper.java
    echo   3 - Exclude node_modules (empty file extension)
    echo   4 - Exclude node_modules, include **/*.config
    echo   5 - Custom test
    echo.
    echo Usage: run-test.cmd [scenario_number]
    exit /b 1
)

if "%1"=="1" (
    echo Scenario 1: Exclude src folder, no file pattern
    echo Expected: src/ skipped completely, no file logs
    node test-zipper.js "%TEST_DIR%" "src" ""
)

if "%1"=="2" (
    echo Scenario 2: Exclude src, include **/*helper.java
    echo Expected: src/helper.java included, src/subdirectory/ not traversed
    node test-zipper.js "%TEST_DIR%" "src" "**/*helper.java"
)

if "%1"=="3" (
    echo Scenario 3: Exclude node_modules, no file pattern
    echo Expected: node_modules/ skipped completely (PERFORMANCE TEST)
    node test-zipper.js "%TEST_DIR%" "node_modules" ""
)

if "%1"=="4" (
    echo Scenario 4: Exclude node_modules, include **/*.config
    echo Expected: node_modules/*.config included, subdirectories not traversed
    node test-zipper.js "%TEST_DIR%" "node_modules" "**/*.config"
)

if "%1"=="5" (
    echo Scenario 5: Custom test
    echo Edit run-test.cmd to set custom parameters
    REM Edit these parameters:
    set CUSTOM_DIR=C:\Users\RiyajS\Downloads\patternTest
    set CUSTOM_FOLDER_EXCLUSION=src,test
    set CUSTOM_FILE_EXTENSION=**/*.java
    node test-zipper.js "%CUSTOM_DIR%" "%CUSTOM_FOLDER_EXCLUSION%" "%CUSTOM_FILE_EXTENSION%"
)

echo.
echo ========================================
echo Test Complete
echo ========================================
echo Check test-output.zip for results

