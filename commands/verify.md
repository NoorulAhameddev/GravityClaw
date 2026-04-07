---
name: verify
description: Run verification loops to validate implementation against criteria. USE after implementing features to verify correctness.
origin: ECC
---

# Verify Command

This command runs verification loops to validate implementation against defined criteria.

## What This Command Does

1. **Load checkpoint** — Retrieve saved verification state
2. **Run criteria** — Execute verification checks against implementation
3. **Report results** — Show pass/fail for each criterion
4. **Update checkpoint** — Save verification state

## When to Use

Use `/verify` when:

- After implementing features with criteria
- During development to check progress
- Before commits to ensure correctness

## Verification Loop Pattern

```typescript
interface VerificationCriterion {
  name: string;
  check: () => Promise<boolean>;
  failureMessage: string;
}

async function verify(criteria: VerificationCriterion[]): Promise<void> {
  const results = await Promise.all(criteria.map(c => c.check()));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`Verification: ${passed}/${total} criteria passed`);
  
  if (passed < total) {
    const failed = criteria.filter((c, i) => !results[i]);
    failed.forEach(c => console.error(`  ✗ ${c.name}: ${c.failureMessage}`));
  }
}
```

## Example Usage

```
User: /verify

Agent:
# Verification: User Authentication

## Checkpoint Loaded
- Implementation phase: Phase 2

## Running Criteria...

✓ [Criterion 1] User can register with email
✗ [Criterion 2] User can login with valid credentials
  - Error: Token not returned in response
✗ [Criterion 3] Invalid credentials are rejected
  - Error: 401 not returned

## Results: 1/3 passed

Failed criteria:
1. Login returns token
2. Invalid credentials return 401
```

## Related Commands

- `/checkpoint` - Save verification state
- `/plan` - Plan implementation with criteria
