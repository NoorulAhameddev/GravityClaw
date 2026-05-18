# code-review — PR Quality Gate Skill

## Purpose
Review changes thoroughly before committing - catch issues before human sees them.

## When to Activate
- Before any commit
- After completing a feature
- Before presenting to human

## Review Checklist

### Code Quality
- [ ] No TODO comments left behind
- [ ] No console.log statements
- [ ] No commented-out code
- [ ] Variables properly named
- [ ] Functions under 50 lines
- [ ] No magic numbers

### Testing
- [ ] Tests pass (`npm run test:run`)
- [ ] New features have tests
- [ ] Edge cases covered

### Types
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] No `any` types unless necessary
- [ ] Proper interfaces defined

### Security
- [ ] No credentials in code
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] SQL injection prevented

### Patterns
- [ ] Follows project conventions
- [ ] Consistent with surrounding code
- [ ] No duplicate code

## Review Process
1. Run `git diff` to see all changes
2. Run `npm run typecheck`
3. Run `npm run test:run`
4. Check each file against checklist
5. Fix any issues found

## Anti-Patterns to Avoid
- Skipping review for "small" changes
- Not running full test suite
- Leaving known issues for later
- Rushing to commit

## Output
When complete, you should have:
- ✅ All checks pass
- ✅ Code clean and ready
- ✅ Ready for human review
- ✅ Commit message follows conventions