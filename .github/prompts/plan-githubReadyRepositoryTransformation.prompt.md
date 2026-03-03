# Plan: GitHub-Ready Repository Transformation

Your repository has strong foundations but needs strategic cleanup across four dimensions: security (already addressed), GitHub presentation, folder architecture, and git hygiene. The four-agent audit revealed **11 committed files blocking publication**, substantial folder organization debt, and **50+ MB of .next/ build cache in git history**. This plan transforms gravyclaw into a professional, contributor-friendly open-source project through three progressive tiers: critical cleanup (30 min), readiness polish (90 min), and structural excellence (3+ hours). Immediate priority removes unwanted artifacts and adds governance docs; deeper tiers reorganize the 22-file flat [src/tools](src/tools) directory into 6 domains, consolidate dual UIs to [src/web](src/web), and establish [config](config)/[scripts](scripts)/[docs](docs) hierarchies. All changes preserve functionality while dramatically improving discoverability and maintainability.

## Steps

### **Tier 1: Critical Cleanup (30 minutes) — BLOCKS PUBLICATION**

1. **Remove 11 committed files from git tracking**
   - Execute: `git rm --cached .playwright-mcp/*.png BACKEND_INTEGRATION_REPORT.md DASHBOARD_PROGRESS.md UI_IMPROVEMENTS_SUMMARY.md WEBSOCKET_FIX_COMPLETION.md add_numbers.py check_tools.ts debug_agent.ts read_db.ts factorial.c improved-ui-final.png`
   - Update [.gitignore](.gitignore) to add: `.playwright-mcp/`, `*.png` (under artifacts section), individual script names
   - Commit: `git commit -m "Remove development artifacts and progress notes"`

2. **Clean .next/ build cache from git history**
   - Check size: `git ls-tree -r main --long | grep '.next' | wc -l` (should show ~50 files)
   - Remove from history: `git filter-branch --tree-filter "rm -rf src/web/.next" --prune-empty HEAD`
   - Verify with: `git log --all --full-history -- "src/web/.next/"`
   - Note: [.gitignore](.gitignore) already excludes `.next/` (line 29), so future builds won't commit

3. **Remove WhatsApp auth directory locally** (already gitignored, just cleanup)
   - Navigate to project root, delete `baileys_auth_info/` folder
   - Will regenerate on next WhatsApp connection
   - Verify not tracked: `git check-ignore -v baileys_auth_info/`

### **Tier 2: GitHub Readiness (90 minutes) — PUBLICATION REQUIREMENTS**

4. **Create governance documentation**
   - Create [CONTRIBUTING.md](CONTRIBUTING.md): contribution guidelines, dev setup, PR process, code standards (TypeScript, testing requirements), commit message format
   - Create [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): community standards (recommend adapting Contributor Covenant)
   - Create [SECURITY.md](SECURITY.md): vulnerability reporting process, supported versions, security features (air-gapped mode, encrypted secrets, allowlisting)
   - Reference existing docs: point to [docs/AIRGAP.md](docs/AIRGAP.md), [docs/ENCRYPTED_SECRETS.md](docs/ENCRYPTED_SECRETS.md)

5. **Update package.json metadata**
   - In [package.json](package.json), add missing fields:
     - `"repository": {"type": "git", "url": "https://github.com/noorulahamed/gravityclaw.git"}`
     - `"homepage": "https://github.com/noorulahamed/gravityclaw#readme"`
     - `"bugs": {"url": "https://github.com/noorulahamed/gravityclaw/issues"}`
     - `"keywords": ["ai-agent", "personal-assistant", "telegram-bot", "whatsapp", "mcp", "automation", "multi-agent", "typescript", "llm"]`
     - `"author": "Noorul Ahamed"`
     - `"engines": {"node": ">=20.0.0", "npm": ">=10.0.0"}`

6. **Enhance README.md**
   - Add Requirements section before Quick Start (Node 20+, API keys needed)
   - Add Project Status badge/section: `⚠️ Early Development - APIs subject to change`
   - Add Support section: link to Issues, Discussions, docs/
   - Add Contributing section: link to [CONTRIBUTING.md](CONTRIBUTING.md)
   - Add Security section: link to [SECURITY.md](SECURITY.md)

7. **Create GitHub issue/PR templates**
   - Create [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md): structured bug reporting
   - Create [.github/ISSUE_TEMPLATE/feature_request.md](.github/ISSUE_TEMPLATE/feature_request.md): feature proposal template
   - Create [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md): PR checklist (tests added, docs updated, CI passes)

### **Tier 3: Folder Restructuring (3+ hours) — MAINTAINABILITY EXCELLENCE**

8. **Consolidate root-level debris**
   - Create directories: `mkdir -p scripts/debug docs/progress docs/assets`
   - Move files: progress reports → [docs/progress](docs/progress), debug scripts → [scripts/debug](scripts/debug), UI screenshot → [docs/assets](docs/assets)
   - Update any references in documentation

9. **Remove vanilla JS UI, standardize on Next.js**
   - Delete entire [public](public) directory (keep only [public/canvas.html](public/canvas.html) if canvas feature uses it)
   - Verify [src/web](src/web) Next.js app is complete and functional
   - Update [Dockerfile](Dockerfile) to ensure it builds from `src/web/`, not `public/`
   - Update [README.md](README.md) UI instructions to reference Next.js exclusively
   - Note: [src/server.ts](src/server.ts) might serve static files; update to proxy Next.js dev server or serve Next.js build output

10. **Reorganize src/tools/ into domain folders**
    - Create subdirectories: [src/tools/core](src/tools/core), [src/tools/voice](src/tools/voice), [src/tools/memory](src/tools/memory), [src/tools/system](src/tools/system), [src/tools/ui](src/tools/ui), [src/tools/automation](src/tools/automation)
    - Move files by domain:
      - `core/`: [admin.ts](src/tools/admin.ts), [communication.ts](src/tools/communication.ts), [swarm.ts](src/tools/swarm.ts)
      - `voice/`: [voice.ts](src/tools/voice.ts), [wake-word.ts](src/tools/wake-word.ts), [talk-mode.ts](src/tools/talk-mode.ts), [tts.ts](src/tools/tts.ts), [voice-settings.ts](src/tools/voice-settings.ts), [elevenlabs.ts](src/tools/elevenlabs.ts)
      - `memory/`: [memory.ts](src/tools/memory.ts), [markdown-memory.ts](src/tools/markdown-memory.ts), [supabase-memory.ts](src/tools/supabase-memory.ts), [graph.ts](src/tools/graph.ts), [search.ts](src/tools/search.ts)
      - `system/`: [shell.ts](src/tools/shell.ts), [files.ts](src/tools/files.ts), [datetime.ts](src/tools/datetime.ts), [attachments.ts](src/tools/attachments.ts)
      - `ui/`: [dashboard.ts](src/tools/dashboard.ts), [mobile.ts](src/tools/mobile.ts)
      - `automation/`: [browser.ts](src/tools/browser.ts)
    - Create index.ts in each subdirectory exporting all tools
    - Update [src/tools/index.ts](src/tools/index.ts) to re-export from subdirectories
    - Update all import statements across codebase (search for `from './tools/` or `from '../tools/`)

11. **Create centralized config/ directory**
    - Create [config](config) directory at root
    - Move [tsconfig.json](tsconfig.json) → [config/tsconfig.json](config/tsconfig.json), create symlink at root: `mklink tsconfig.json config\tsconfig.json` (or copy with note)
    - Move [vitest.config.ts](vitest.config.ts) → [config/vitest.config.ts](config/vitest.config.ts)
    - Move [mcp-servers.json](mcp-servers.json) → [config/mcp-servers.json](config/mcp-servers.json)
    - Update [package.json](package.json) scripts to reference new paths: `"typecheck": "tsc --noEmit --project config/tsconfig.json"`
    - Update [src/config.ts](src/config.ts) to load MCP config from new location

12. **Create src/types/ and src/utils/ directories**
    - Create [src/types](src/types) folder with [index.ts](src/types/index.ts)
    - Extract shared interfaces from [src/tools](src/tools) files into [src/types/tools.ts](src/types/tools.ts)
    - Extract types from [src/channels](src/channels) into [src/types/channels.ts](src/types/channels.ts)
    - Create [src/utils](src/utils) folder for shared utilities (if utility functions exist)
    - Update imports to use centralized types

13. **Disambiguate plugins system**
    - Remove empty [plugins](plugins) directory at root
    - Keep [src/plugins](src/plugins) as single source of truth
    - Clarify in [README.md](README.md) relationship between plugins (external tools) and skills (internal capabilities)
    - Update [src/plugins/README.md](src/plugins/README.md) with plugin development guide

### **Tier 4: Long-Term Optimizations (optional)**

14. **Reorganize test structure**
    - Create [tests](tests) directory at root with [unit](tests/unit), [integration](tests/integration), [e2e](tests/e2e), [fixtures](tests/fixtures) subdirectories
    - Move tests from [src/__tests__](src/__tests__) to mirror src/ structure in tests/unit/
    - Update [vitest.config.ts](config/vitest.config.ts) include paths
    - Consider keeping [src/__tests__/manual](src/__tests__/manual) co-located for developer convenience

15. **Add GitHub Actions enhancements**
    - Extend [.github/workflows/ci.yml](.github/workflows/ci.yml) with: code coverage reporting, security scanning (npm audit), dependency updates (Dependabot), automatic releases
    - Add status badges to [README.md](README.md)

16. **Force-push cleaned history to GitHub**
    - After all file removals and git history cleaning: `git push origin main --force-with-lease`
    - Warn any collaborators about history rewrite
    - Verify on GitHub that unwanted files are gone

## Verification

After each tier, run these checks:

**Post Tier 1:**
```bash
# Verify removed files no longer tracked
git ls-files | grep -E "(playwright-mcp|PROGRESS|add_numbers|check_tools|debug_agent|improved-ui)" 
# Should return nothing

# Check .next/ removed from history
git log --all --full-history -- "src/web/.next/" | wc -l
# Should be 0

# Verify .gitignore working
echo "test" > .playwright-mcp/test.png
git status | grep "playwright-mcp"
# Should show nothing (ignored)
```

**Post Tier 2:**
```bash
# Verify governance docs exist
ls CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md
# Should list all three

# Verify package.json metadata
grep -E "(repository|homepage|bugs|keywords|author)" package.json
# Should show all fields populated

# Validate markdown formatting
npx markdownlint-cli2 "*.md" "docs/**/*.md"
```

**Post Tier 3:**
```bash
# Verify tools reorganization
find src/tools -type f -name "*.ts" | head -3
# Should show subdirectory paths like src/tools/core/admin.ts

# Verify imports still work
npm run typecheck
# Should pass with no errors

# Run test suite
npm run test:run
# Should pass (may need import updates)

# Verify public/ removed
ls public 2>/dev/null && echo "Still exists" || echo "Removed successfully"

# Check Next.js still builds
cd src/web && npm run build
# Should complete successfully
```

**Post Tier 4 (if completed):**
```bash
# Verify GitHub repo clean
git log --oneline --graph --all | head -20
# Review history looks clean

# Check CI passes
# Visit https://github.com/noorulahamed/gravityclaw/actions
# All checks should be green
```

## Decisions

- **UI Framework**: Chose Next.js over vanilla JS public/ for modern DX, SSR capabilities, and ecosystem maturity (user confirmed)
- **Token Security**: Assuming already revoked per user confirmation; skipped remediation steps (user confirmed)
- **Gitignore Strategy**: Keep comprehensive 182-line .gitignore generated by agent; already covers all tech stack needs
- **Plugin Disambiguation**: Keep `src/plugins/` only, remove empty root `plugins/`; document skills vs plugins distinction
- **Config Location**: Centralize in `config/` for discoverability; use symlinks where tools expect root location (tsconfig.json)
- **Test Organization**: Recommend moving to root-level `tests/` for consistency, but can keep in `src/__tests__/` if preferred
- **Git History Cleanup**: Use `git filter-branch` for .next/ removal (older, universally available) vs `git filter-repo` (faster, requires install)
- **Force Push Timing**: Execute after Tier 3 completion to minimize history rewrites; warn collaborators first
