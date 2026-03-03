# Archive Directory

This directory contains historical development artifacts, analysis reports, and working notes that are not part of the active codebase but may be useful for reference.

## Contents

### Development Analysis
- Previously generated gitignore analysis and implementation reports (moved to `docs/progress/`)
- Security exposure assessments
- Development progress snapshots

### Usage

Files in this directory are:
- ✅ Excluded from version control (see `.gitignore`)
- 📝 Preserved for reference during active development
- 🗑️ Safe to delete if storage is needed

### Archiving Guidelines

When adding to `.archive/`:
1. Create a subdirectory with a descriptive name
2. Include a brief README explaining the contents
3. Add to `.gitignore` if not already covered
4. Document why the file was archived

Example structure:
```
.archive/
├── README.md (this file)
├── old-schemas/
│   ├── README.md
│   └── *.json
└── working-notes/
    ├── README.md
    └── *.md
```

### Notes

- This directory is NOT committed to version control
- It's useful for keeping the working directory clean while preserving history
- Consider cleaning up archival items periodically

---

**Last Updated:** March 3, 2026
