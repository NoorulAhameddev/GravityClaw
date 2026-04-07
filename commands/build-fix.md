---
name: build-fix
description: Analyze and fix build errors, type errors, and compilation issues. USE immediately when build fails.
origin: ECC
---

# Build Fix Command

This command invokes the **build-error-resolver** agent to analyze and fix build issues.

## What This Command Does

1. **Analyze errors** — Parse build output for actual errors (ignore warnings)
2. **Identify root cause** — Find the source of each error
3. **Apply fixes** — Make minimal changes to resolve issues
4. **Verify** — Run build again to confirm fixes

## When to Use

Use `/build-fix` when:

- Build fails with TypeScript errors
- Build fails with ESLint errors
- Import resolution failures
- Module not found errors

## How It Works

### Step 1: Error Analysis

```
1. Run: npm run typecheck
2. Parse output for actual errors (skip warnings)
3. Group errors by file and type
4. Identify root cause vs symptom
```

### Step 2: Error Categories

| Error Type | Common Causes | Fix Approach |
|------------|---------------|--------------|
| TS2304 | Missing import, typo | Add import or fix name |
| TS2345 | Type mismatch | Add type assertion or fix types |
| TS2339 | Property doesn't exist | Check null/undefined |
| TS2769 | Type inference failed | Add explicit type |
| Module not found | Missing dependency | npm install |
| Cannot find module | Wrong path | Fix import path |

### Step 3: Fix Strategy

1. **Fix root cause first** — Don't just silence errors
2. **One error at a time** — Fix and verify
3. **Run typecheck** — After each fix
4. **Don't break working code** — Minimal changes

## Example Usage

```
User: /build-fix

Agent (build-error-resolver):
# Build Error Resolution

Running: npm run typecheck

Output:
src/tools/system/rate-limit.ts:15:23 - error TS2304: Cannot find name 'request' 
src/tools/index.ts:42:10 - error TS2345: Type 'string | undefined' is not assignable to type 'string'

## Error 1: TS2304 in rate-limit.ts
File: src/tools/system/rate-limit.ts:15
Error: Cannot find name 'request'

Context:
```typescript
async checkLimit(identifier: string): Promise<{ allowed: boolean }> {
  const request = this.requests.get(identifier);  // <- 'request' not defined
```

Root Cause: Variable renamed but old name still used
Fix: Change to 'requests' (plural)

## Error 2: TS2345 in index.ts
File: src/tools/index.ts:42
Error: Type 'string | undefined' is not assignable to type 'string'

Root Cause: config.apiKey could be undefined
Fix: Add null check or use default

Applying fixes...
Running: npm run typecheck

✓ All errors resolved
```

## Common Fixes for Gravity Claw

### Import Errors
```typescript
// Wrong: import { foo } from "./bar.ts"
// Correct: import { foo } from "./bar.js"  (use .js for type re-exports)
```

### Type Errors
```typescript
// Wrong: const value: string = config.optionalValue
// Correct: const value: string = config.optionalValue ?? "default"
```

### Module Errors
```typescript
// Check: config/tsconfig.json paths and baseUrl
// Ensure: npm install for new dependencies
```

## Integration with Other Commands

- Use `/code-review` after fixing build errors
- Use `/tdd` to add tests while fixing
- Use `/plan` for complex fixes that require planning
