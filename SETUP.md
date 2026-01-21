# pnpm + Next.js Setup Guide for Windows PowerShell

## Step 1: Context Checks

Run these commands to check what's already installed:

```powershell
node -v
npm -v
corepack --version
pnpm -v
```

**Expected Output:**
- `node -v`: Should show version (e.g., `v20.x.x` or `v18.x.x`)
- `npm -v`: Should show version (e.g., `10.x.x` or `9.x.x`)
- `corepack --version`: Should show version (e.g., `0.19.0`) OR error if not available
- `pnpm -v`: May show version OR error "pnpm: command not found" / "pnpm: The term 'pnpm' is not recognized"

**If output differs:**
- If `node -v` fails: Install Node.js from https://nodejs.org/ (LTS version recommended)
- If `npm -v` fails: Reinstall Node.js (npm comes bundled)
- If `corepack --version` fails: Continue to Step 2
- If `pnpm -v` shows a version: Skip to Step 4

---

## Step 2: Install Corepack (if missing)

If `corepack --version` failed in Step 1, run:

```powershell
npm install -g corepack
```

**Expected Output:**
- Should show installation progress and end with something like:
  ```
  + corepack@0.19.0
  added 1 package in 2s
  ```

**If output differs:**
- If you see permission errors: Run PowerShell as Administrator and retry
- If you see "npm: command not found": Install Node.js first

---

## Step 3: Enable Corepack and Install pnpm

Run these commands in order:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

**Expected Output:**
- `corepack enable`: Should complete silently or show a brief success message
- `corepack prepare pnpm@latest --activate`: Should show:
  ```
  Preparing pnpm@latest for instant activation...
  ```

**Important:** After running these commands, **CLOSE and REOPEN your terminal tab** in Cursor to refresh PATH.

**If output differs:**
- If you see "corepack: command not found": Go back to Step 2
- If you see permission errors: Run PowerShell as Administrator

---

## Step 3b: Verify pnpm Installation

After reopening your terminal tab, run:

```powershell
pnpm -v
```

**Expected Output:**
- Should show pnpm version (e.g., `9.0.0` or `8.x.x`)

**If output differs:**
- If still "pnpm: command not found": Continue to Step 3c (Fallback)

---

## Step 3c: Fallback - Install pnpm via npm

If `pnpm -v` still fails after reopening terminal, use npm fallback:

```powershell
npm install -g pnpm
```

**Expected Output:**
- Should show installation progress and end with:
  ```
  + pnpm@9.0.0
  added 1 package in 3s
  ```

**Important:** After this command, **CLOSE and REOPEN your terminal tab** again.

Then verify:
```powershell
pnpm -v
```

**Expected Output:**
- Should show pnpm version

**If output differs:**
- If still failing: See "Common Failure Modes" section below

---

## Step 4: Navigate to Project Directory

Ensure you're in the correct directory:

```powershell
cd c:\Users\Bobby\trend100\trend100
pwd
```

**Expected Output:**
- `pwd` should show: `C:\Users\Bobby\trend100\trend100`

---

## Step 5: Scaffold Next.js Project

Since `package.json` doesn't exist, create Next.js in-place:

```powershell
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**Expected Output:**
- Should prompt: "Need to install the following packages: create-next-app@latest. Ok to proceed? (y)"
- Type `y` and press Enter
- Should show installation progress
- May ask about conflicting files (README.md, .gitignore) - choose to overwrite or skip as needed
- Should complete with: "Success! Created a new Next.js app..."

**If output differs:**
- If you see "pnpm: command not found": Go back to Step 3c
- If you see permission errors: Check folder permissions
- If it asks about overwriting files: Choose `y` for README.md and .gitignore (or `n` to keep existing)

---

## Step 6: Install Dependencies

```powershell
pnpm install
```

**Expected Output:**
- Should show progress bars and end with:
  ```
  Packages: +XXX
  +XXX packages installed
  ```

**If output differs:**
- If you see "package.json not found": Ensure Step 5 completed successfully
- If you see network errors: Check internet connection

---

## Step 7: Start Development Server

```powershell
pnpm dev
```

**Expected Output:**
- Should show:
  ```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in Xs
  ```
- Browser should auto-open to http://localhost:3000

**If output differs:**
- If port 3000 is in use: Next.js will automatically use 3001, 3002, etc.
- If you see "command not found": Ensure pnpm is in PATH (reopen terminal)

---

## Common Failure Modes

### PATH Not Refreshed
**Symptom:** `pnpm -v` works in one terminal but not another  
**Solution:** Close and reopen the terminal tab in Cursor after installing pnpm

### Execution Policy Error
**Symptom:** "cannot be loaded because running scripts is disabled on this system"  
**Solution:** Run PowerShell as Administrator, then:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Wrong Directory
**Symptom:** Commands fail with "package.json not found"  
**Solution:** Verify you're in `c:\Users\Bobby\trend100\trend100`:
```powershell
pwd
ls package.json
```

### Corepack Not Available
**Symptom:** `corepack --version` fails even after `npm install -g corepack`  
**Solution:** Use npm fallback (Step 3c) or update Node.js to a version that includes Corepack (Node 16.10+)

### Port Already in Use
**Symptom:** "Port 3000 is already in use"  
**Solution:** Next.js will auto-increment to 3001, 3002, etc. Or kill the process:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Quick Reference: All Commands in Order

```powershell
# 1. Check versions
node -v
npm -v
corepack --version
pnpm -v

# 2. Install corepack (if needed)
npm install -g corepack

# 3. Enable pnpm
corepack enable
corepack prepare pnpm@latest --activate
# CLOSE AND REOPEN TERMINAL TAB

# 3b. Verify
pnpm -v

# 3c. Fallback (if needed)
npm install -g pnpm
# CLOSE AND REOPEN TERMINAL TAB
pnpm -v

# 4. Navigate
cd c:\Users\Bobby\trend100\trend100

# 5. Scaffold Next.js
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"

# 6. Install dependencies
pnpm install

# 7. Start dev server
pnpm dev
```
