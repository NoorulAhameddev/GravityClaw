# test-driven-development — TDD Enforcement Skill

## Purpose
Enforce RED-GREEN-REFACTOR cycle for all code changes.

## When to Activate
- Writing any new code
- Fixing bugs
- Adding features

## TDD Cycle

### RED Phase (Write Failing Test First)
1. Write a test that describes the expected behavior
2. Run test - it MUST fail
3. Only proceed when test fails for the right reason

### GREEN Phase (Write Minimal Code)
1. Write the minimum code to make test pass
2. No optimization, no extra features
3. Get to green as fast as possible

### REFACTOR Phase (Improve Code)
1. Now improve code quality
2. Remove duplication
3. Improve naming
4. Ensure tests still pass
5. Commit before and after refactor

## Test Requirements
- Test must be in `src/__tests__/`
- Use Vitest (already configured)
- Tests must be runnable: `npm run test:run`
- Each feature needs at least one test

## Anti-Patterns to Avoid
- Writing code before tests
- Writing tests that always pass
- Skipping tests for "simple" changes
- Large refactors without committing
- Not running full test suite before committing

## Workflow
```
1. Understand requirement
2. Write test → RED
3. Write code → GREEN
4. Refactor → REFACTOR
5. Run full suite
6. Commit
```

## Output
When complete, you should have:
- ✅ Test written before code
- ✅ All tests passing (green)
- ✅ Code refactored and clean
- ✅ Full test suite passes
- ✅ Commit with meaningful message