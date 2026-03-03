# Quick Reference: .gitignore Updates for Gravyclaw

## 🎯 What Changed

Your `.gitignore` has been upgraded from **24 basic patterns** to **140+ comprehensive patterns** with 11 organized sections.

---

## ⚡ Quick Start

The new `.gitignore` is already deployed. To clean up committed files:

### 1️⃣ **CRITICAL: Remove `.next/` from history** 
```powershell
# This removes ~50+ Next.js build files that shouldn't be in git
git filter-branch --tree-filter "rm -rf src/web/.next" --prune-empty HEAD
git push origin --force-with-lease
```

### 2️⃣ **Verify it worked**
```powershell
git check-ignore -v src/web/.next/app-build-manifest.json
# If shows a rule, it's correctly ignored
```

### 3️⃣ **Rebuild Next.js locally**
```powershell
cd src/web
npm run build
```

---

## 📋 What's Ignored Now

### ✅ Secrets & Environment
- `.env`, `.env.local`, `.env.*.local`
- `secrets.enc.json`, `credentials.json`
- `baileys_auth_info/` (WhatsApp auth)

### ✅ Build Artifacts
- `dist/`, `build/` (TypeScript output)
- `.next/` (Next.js build cache) ⚠️ **Was committed!**
- `coverage/` (Test reports)
- `*.tsbuildinfo` (TypeScript incremental builds)

### ✅ Dependencies
- `node_modules/`
- `package-lock.json` (lock file sync issues)
- `pnpm-lock.yaml`, `yarn.lock`

### ✅ Databases & Data
- `gravity.db*` (SQLite + WAL files)
- `memory-files/` (Application cache)
- Device/credential files from Baileys

### ✅ Logs & IDE
- `logs/`, `*.log` (Runtime logs)
- `.vscode/`, `.idea/` (IDE configs)
- `.playwright/`, test artifacts

---

## 💾 Database Files

| File | Pattern | Status |
|------|---------|--------|
| gravity.db | gravity.db* | ✅ Ignored |
| gravity.db-shm | *.db-shm | ✅ Ignored |
| gravity.db-wal | *.db-wal | ✅ Ignored |
| Any .sqlite | *.sqlite* | ✅ Ignored |

---

## 🔐 Sensitive Files

| Type | Patterns | Status |
|------|----------|--------|
| Environment vars | .env* | ✅ Ignored |
| Secrets | secrets.*.json | ✅ Ignored |
| WhatsApp auth | baileys_auth_info/ | ✅ Ignored |
| Credentials | creds.json | ✅ Ignored |

---

## 📦 Package Managers Covered

- **npm**: package-lock.json, npm-debug.log
- **yarn**: yarn.lock, yarn-debug.log  
- **pnpm**: pnpm-lock.yaml, .pnpm-debug.log
- **lerna**: lerna-debug.log

---

## 🏗️ Build Systems Covered

| Framework | Patterns |
|-----------|----------|
| **TypeScript** | dist/, .tsc/, *.tsbuildinfo |
| **Next.js** | .next/, next-env.d.ts, out/ |
| **Vitest** | coverage/, .vitest*/ |
| **Playwright** | .playwright/, test-results/ |

---

## 🆚 Comparison With Old .gitignore

| Category | Old | New |
|----------|-----|-----|
| Sections | 2 | 11 |
| Patterns | 24 | 140+ |
| Next.js coverage | ❌ Missing | ✅ Complete |
| Lock files | ❌ Missing | ✅ All variants |
| Coverage reports | ❌ Missing | ✅ Included |
| Secret variants | Minimal | ✅ Comprehensive |
| Documented | ❌ No | ✅ Full comments |

---

## 🐛 Critical Issues Addressed

| Issue | Impact | Fix |
|-------|--------|-----|
| `.next/` committed | ~50+ files in repo | Filter history |
| `package-lock.json` committed | Sync conflicts | Decide: keep or remove |
| Minimal comments | Hard to maintain | Now fully documented |
| Missing Next.js rules | Build artifacts leak | Added .next/, out/, next-env.d.ts |
| Missing coverage | Test reports committed | Added coverage/ |

---

## ✅ Verification Commands

```powershell
# Check what files would be ignored
git clean -ndx

# Verify specific file is ignored
git check-ignore -v src/web/.next/app-build-manifest.json
git check-ignore -v .env.local
git check-ignore -v logs/debug.log

# Count tracked files (baseline metric)
git ls-files | Measure-Object -Line

# Estimate size saved
git rev-list --all --objects | `
  Select-String "\.next/|coverage/" | `
  Measure-Object -Line
```

---

## 🔧 For Team Members

Share these key points:

1. **New .gitignore deployed**: Run `git pull` to get it
2. **No action needed**: Already applied to your working directory
3. **Clean your uncommitted work**: 
   ```powershell
   git clean -fdx  # Remove all untracked/ignored files
   ```
4. **Rebuild after pull**:
   ```powershell
   npm install
   cd src/web && npm install && npm run build
   ```

---

## 📄 Related Documents

- **GITIGNORE_ANALYSIS_REPORT.md** - Detailed analysis (you are reading a summary)
- **GITIGNORE_TEMPLATE.md** - Raw template (copy if needed)
- **.gitignore** - Active file (this is what git uses)

---

## 🚨 Important: Next.js Build Artifacts

Your `.next/` directory contains generated files that will be different on each machine:

```
src/web/.next/
├── cache/
│   ├── webpack/
│   │   ├── client-development/ ← DIFFERENT EVERY BUILD
│   │   ├── server-development/ ← DIFFERENT EVERY BUILD
├── static/
│   ├── chunks/                ← GENERATED BUNDLES
├── server/
│   ├── pages-manifest.json    ← GENERATED
```

**These MUST NOT be in git.** Use the provided command in Step 1️⃣ above to remove them.

---

## ❓ FAQ

**Q: Should I keep package-lock.json?**  
A: YES for this project (production Node.js app). Ensures reproducible builds.

**Q: What are .db-shm and .db-wal files?**  
A: SQLite journal files for Write-Ahead Logging. They're temporary and recreated, so ignore them.

**Q: Can I remove the .cache/ rule?**  
A: Yes if you're not using any build tool caching. But it's safe to keep.

**Q: Why are there IDE exceptions like `!.vscode/extensions.json`?**  
A: The `!` allows you to commit shared team settings (like recommended extensions) while ignoring personal settings.

**Q: What about .env.example?**  
A: ✅ Already committed (good!). It shows team members what variables they need.

---

## 🎯 Next Steps

- [ ] Run the `.next/` removal command if you haven't already
- [ ] Communicate changes to team
- [ ] Review temporary files (check_tools.ts, etc.) and move/delete
- [ ] Consider setting up pre-commit hooks to prevent future secret commits
- [ ] Archive or delete debug scripts

---

**Report generated**: 2026-03-03  
**Tech stack**: Node.js 20, TypeScript, Next.js, SQLite, Vitest  
**Files analyzed**: 182 lines of .gitignore patterns
