---
name: e2e
description: Generate and run end-to-end tests using Playwright. USE for testing complete user workflows.
origin: ECC
---

# E2E Command

This command invokes the **e2e-runner** agent to create and run end-to-end tests.

## What This Command Does

1. **Identify user flows** — Map complete workflows to test
2. **Generate tests** — Create Playwright tests for flows
3. **Run tests** — Execute against target environment
4. **Report results** — Show pass/fail with screenshots

## When to Use

Use `/e2e` when:

- Testing complete user journeys
- Verifying integrations between components
- Testing multi-step workflows
- Before releases

## E2E Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'user@example.com');
    await page.fill('[data-testid=password]', 'password123');
    await page.click('[data-testid=login-button]');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid=user-name]')).toBeVisible();
  });
});
```

## Example Usage

```
User: /e2e Test the user onboarding flow

Agent (e2e-runner):
# E2E: User Onboarding Flow

## Flows Identified
1. New user registration
2. Email verification
3. Profile completion
4. First market creation

Creating test: tests/onboarding.spec.ts

Running tests...
✓ should register new user
✓ should verify email
✓ should complete profile
✓ should create first market

## Results
| Test | Status | Duration |
|------|--------|----------|
| Register | PASS | 1.2s |
| Verify Email | PASS | 0.8s |
| Complete Profile | PASS | 2.1s |
| Create Market | PASS | 1.5s |

4/4 tests passed
```

## Best Practices

1. **Use data-testid** — Stable selectors, not CSS classes
2. **One flow per test** — Don't test multiple flows together
3. **Clean up** — Delete test data after tests
4. **Screenshot on failure** — Capture state when tests fail

## Integration with Other Commands

- Use `/tdd` for unit tests
- Use `/code-review` to review test code
- Use `/plan` to plan test coverage
