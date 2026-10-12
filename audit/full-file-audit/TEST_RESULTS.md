# Automated and Manual Verification Test Results

**Repository:** [GravityClaw](https://github.com/NoorulAhameddev/GravityClaw)  
**Audit Directory:** `audit/full-file-audit/`  
**Execution Environment:** Windows 11 Pro, Node.js v22.23.2, npm v10.8.2  
**Date:** 2026-10-12  

---

## 1. Test Execution Summary Matrix

| Verification Check | Exact Command Line | Exit Code | Result | Key Details |
|---|---|---|---|---|
| **TypeScript Type Checking** | `npm run typecheck` | `0` | **PASS** | `tsc --noEmit` completed with 0 errors. |
| **Unit & Integration Tests** | `npm run test:run` | `0` | **PASS** | 70 test files passed, 1219 individual tests passed (25.69s). |
| **Production Build** | `npm run build` | `0` | **PASS** | esbuild bundled `dist/index.js` (998.2kb) in 68ms. |
| **Static Code Linting** | `npm run lint` | `0` | **PASS** | ESLint verified `src/**/*.ts` with 0 errors. |
| **Dependency Vulnerability Scan**| `npm audit` | `1` | **FAIL (CRITICAL)** | 87 vulnerabilities discovered (7 Critical, 22 High, 56 Moderate, 2 Low). |
| **Code Formatting Check** | `npm run format:check` | `1` | **FAIL** | Prettier reported formatting violations across 166 files. |

---

## 2. Detailed Command Results

### 2.1 TypeScript Type Checking (`npm run typecheck`)
- **Command:** `npm run typecheck` (`tsc --noEmit`)
- **Exit Code:** `0`
- **Output:**
  ```text
  > gravityclaw@0.1.0 typecheck
  > tsc --noEmit
  ```
- **Analysis:** TypeScript compiler verified all imports and types across `src/` against `tsconfig.json` (ES2022 target, strict mode enabled). No compile-time type errors exist.

---

### 2.2 Vitest Automated Test Suite (`npm run test:run`)
- **Command:** `npx vitest run --config config/vitest.config.ts`
- **Exit Code:** `0`
- **Output Summary:**
  ```text
  Test Files  70 passed (70)
       Tests  1219 passed (1219)
    Start at  11:27:01
    Duration  25.69s (transform 2.05s, setup 3.65s, collect 3.48s, tests 13.91s, environment 0ms, prepare 2.60s)
  ```
- **Test File Coverage Breakdown (Sample):**
  - `src/__tests__/agent.test.ts` — Agentic loop and tool invocation limit tests (PASSED)
  - `src/__tests__/auth.test.ts` — Authentication middleware mock tests (PASSED)
  - `src/__tests__/tools/files.test.ts` — File tool safety tests (PASSED)
  - `src/__tests__/tools/shell.test.ts` — Shell execution boundary tests (PASSED)
  - `src/__tests__/memory/graph.test.ts` — In-process knowledge graph tests (PASSED)
  - `src/__tests__/llm/orchestrator.test.ts` — Orchestrator session resolution tests (PASSED)
- **Critical Finding Regarding Test Suite:**
  While 1219 tests passed, test assertions rely heavily on unit-level mocks that isolate components from their actual integration failure points:
  1. `src/tools/sandbox.ts` has **zero tests** in `src/__tests__/`, masking the fatal `PATH: ''` bug.
  2. The test suite does not exercise WebSocket cross-session hijacking or multi-tenant session isolation in `src/channels/webchat.ts`.
  3. LLM provider adapters for Anthropic and Google are tested using mocked responses rather than actual API schema validation.

---

### 2.3 Production Build Verification (`npm run build`)
- **Command:** `npm run build`
- **Exit Code:** `0`
- **Output:**
  ```text
  > gravityclaw@0.1.0 build
  > esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --format=esm --external:better-sqlite3 --external:sharp --external:playwright
  
    dist/index.js  998.2kb
  ⚡ Done in 68ms
  ```
- **Analysis:** Build bundling completes without errors for Node 20 runtime target. Native bindings (`better-sqlite3`, `sharp`, `playwright`) are correctly marked as external.

---

### 2.4 Code Style & Linting (`npm run lint`)
- **Command:** `npm run lint` (`eslint "src/**/*.ts" --config eslint.config.js`)
- **Exit Code:** `0`
- **Output:** Clean exit with 0 linting violations.

---

### 2.5 Dependency Supply Chain Security Scan (`npm audit`)
- **Command:** `npm audit --json`
- **Exit Code:** `1`
- **Summary:** **87 vulnerabilities** identified in project dependency graph.
- **Severity Breakdown:**
  - **Critical:** 7
  - **High:** 22
  - **Moderate:** 56
  - **Low:** 2
- **Notable High & Critical CVEs:**
  1. **`tar` (<=6.2.1, Critical / High)**: Arbitrary file overwrite and symlink path traversal (GHSA-87cm-7x2q-7945, GHSA-r628-82hm-mfvp).
  2. **`protobufjs` (<7.2.5, Critical)**: Prototype pollution leading to potential remote code execution via unsafe protobuf decoding (GHSA-h755-8qp9-cq85).
  3. **`proxy-addr` (<=2.0.7, Critical / High)**: Incorrect trust handling of IPv4-mapped IPv6 loopback addresses, allowing IP address spoofing and localhost bypass behind reverse proxies (GHSA-2p57-rm9w-gvfv).
  4. **`ws` (<=8.17.0, High)**: Uninitialized buffer memory exposure and DoS via large frame allocation (GHSA-3h5v-q93c-6h6q).
  5. **`vite` (<=5.4.5, High)**: Server-side file traversal in Vite dev server (GHSA-64vr-g452-qvp3).
  6. **`path-to-regexp` (<0.1.10 / <1.9.0, High)**: Regular expression Denial of Service (ReDoS) in Express route matching (GHSA-9wv6-86v2-598j).

---

### 2.6 Code Formatting Verification (`npm run format:check`)
- **Command:** `npm run format:check`
- **Exit Code:** `1`
- **Output Summary:**
  Prettier reported formatting mismatches across **166 files**, including files in `dashboard/`, `lib/`, `rules/`, and modified files in `src/`. CI lacks automated formatting enforcement or pre-commit hooks to guarantee code formatting consistency.
