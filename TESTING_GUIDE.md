# 🧪 Local Testing Guide for Zipper Changes

## Quick Start

### 1. Build the Project
```cmd
npm run build
```

### 2. Run Tests

#### **Windows:**
```cmd
run-test.cmd 1    # Test scenario 1
run-test.cmd 2    # Test scenario 2
run-test.cmd 3    # Test scenario 3
```

#### **Manual Test:**
```cmd
node test-zipper.js <sourceDir> <folderExclusion> <fileExtension>
```

---

## 📋 Test Scenarios

### **Scenario 1: PLUG-2643 Performance Fix**
**Command:**
```cmd
run-test.cmd 1
```

**Parameters:**
- `INPUT_FOLDEREXCLUSION=src`
- `INPUT_FILEEXTENSION=` (empty)

**Expected Output:**
```
##vso[task.debug]Skip: src (directory)
##vso[task.debug] Add: C:/Users/.../package.json
##vso[task.debug] Add: C:/Users/.../control/helper.java
```

**✅ Success Criteria:**
- `src/` directory logged as skipped ONCE
- NO individual file logs from `src/` (no `src/helper.java`, `src/main.js`, etc.)
- Files from other directories are included

---

### **Scenario 2: File Pattern Override**
**Command:**
```cmd
run-test.cmd 2
```

**Parameters:**
- `INPUT_FOLDEREXCLUSION=src`
- `INPUT_FILEEXTENSION=**/*helper.java`

**Expected Output:**
```
##vso[task.debug]Skip: src (directory)
##vso[task.debug] Add: C:/Users/.../src/helper.java
##vso[task.debug] Add: C:/Users/.../control/helper.java
```

**✅ Success Criteria:**
- `src/` directory logged as skipped
- `src/helper.java` is INCLUDED (file pattern override)
- `src/main.js` is NOT logged (excluded)
- `src/subdirectory/` is NOT traversed (performance)

---

### **Scenario 3: Performance Test (Large Directory)**
**Command:**
```cmd
run-test.cmd 3
```

**Parameters:**
- `INPUT_FOLDEREXCLUSION=node_modules`
- `INPUT_FILEEXTENSION=` (empty)

**Expected Output:**
```
##vso[task.debug]Skip: node_modules (directory)
```

**✅ Success Criteria:**
- `node_modules/` logged as skipped ONCE
- NO traversal into `node_modules/` subdirectories
- Completes in < 1 second (not 40+ minutes!)

---

### **Scenario 4: Specific Pattern with Exclusion**
**Command:**
```cmd
run-test.cmd 4
```

**Parameters:**
- `INPUT_FOLDEREXCLUSION=node_modules`
- `INPUT_FILEEXTENSION=**/*.config`

**Expected Output:**
```
##vso[task.debug]Skip: node_modules (directory)
##vso[task.debug] Add: C:/Users/.../node_modules/package.config
```

**✅ Success Criteria:**
- `node_modules/` logged as skipped
- `node_modules/*.config` files at root level are included
- Subdirectories like `node_modules/package1/` are NOT traversed

---

## 🔧 Custom Testing

### **Edit Parameters:**
Edit `run-test.cmd` scenario 5 or use direct command:

```cmd
node test-zipper.js "C:\path\to\source" "src,test,temp" "**/*.java,**/*.js"
```

### **Parameters:**
1. **Source Directory:** Path to test directory
2. **Folder Exclusion:** Comma-separated folder names (e.g., `src,test,node_modules`)
3. **File Extension:** File patterns (e.g., `**/*.java,**/*helper.js`)

---

## 📊 Verify Results

### **Check ZIP Contents:**
```cmd
# Extract and view
tar -tf test-output.zip

# Or use 7-Zip, WinRAR, etc.
```

### **Check Logs:**
Look for these patterns in console output:
- `Skip: <folder> (directory)` - Folder excluded
- `Add: <file>` - File included
- `Skip: <file>` - File excluded

---

## 🐛 Troubleshooting

### **Build Errors:**
```cmd
npm install
npm run build
```

### **Module Not Found:**
Make sure you run `npm run build` first!

### **Test Directory Not Found:**
Edit `run-test.cmd` and change `TEST_DIR` variable to your test directory path.

---

## ✅ What to Verify

### **Performance:**
- [ ] Excluded folders complete in < 1 second
- [ ] No traversal into excluded subdirectories
- [ ] Log file is small (not 100k+ lines)

### **Functionality:**
- [ ] File patterns override folder exclusions for root-level files
- [ ] Subdirectories of excluded folders are not traversed
- [ ] Non-excluded folders work normally

### **Logging:**
- [ ] Excluded folders logged once as `Skip: <folder> (directory)`
- [ ] No individual file logs from excluded folders (when no pattern)
- [ ] Clean, readable output

---

## 📝 Example Test Directory Structure

Create this structure for testing:
```
patternTest/
├── package.json
├── src/
│   ├── helper.java          ← Should be included with pattern
│   ├── main.js              ← Should be excluded
│   └── subdirectory/
│       └── helper.java      ← Should NOT be traversed
├── node_modules/
│   ├── package1/            ← Should NOT be traversed
│   └── package2/            ← Should NOT be traversed
├── control/
│   └── helper.java          ← Should be included
└── test/
    └── test.java
```

