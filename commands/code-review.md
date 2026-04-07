---
name: code-review
description: Review code for quality, security, and maintainability. Use after implementing features or before commits.
origin: ECC
---

# Code Review Command

This command invokes the **code-reviewer** agent to perform comprehensive code reviews.

## What This Command Does

1. **Gather context** — Run `git diff --staged` and `git diff` to see changes
2. **Understand scope** — Identify affected files and their connections
3. **Apply checklist** — Work through security, quality, and performance checks
4. **Report findings** — Organize by severity with fixes

## When to Use

Use `/code-review` when:

- After implementing a feature
- Before creating a commit
- After AI-generated code changes
- During PR review process

## Review Checklist

### Security (CRITICAL)
- Hardcoded credentials or secrets
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues

### Code Quality (HIGH)
- Large functions (>50 lines)
- Deep nesting (>4 levels)
- Missing error handling
- Missing tests

### Performance (MEDIUM)
- N+1 query patterns
- Unnecessary re-renders
- Missing caching

### Best Practices (LOW)
- Missing documentation
- Poor naming conventions
- Magic numbers

## Output Format

```
## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 2     | warn   |
| MEDIUM   | 3     | info   |
| LOW      | 1     | note   |

Verdict: WARNING — 2 HIGH issues should be resolved before merge.
```

## Example Usage

```
User: /code-review

Agent (code-reviewer):
# Code Review: Rate Limiting Implementation

## Changes Analyzed
- src/tools/system/rate-limit.ts (new file)
- src/tools/index.ts (modified)

## Findings

### [HIGH] Missing error handling
File: src/tools/system/rate-limit.ts:15
Issue: No handling for empty identifier
Fix: Add validation at start of checkLimit method

### [MEDIUM] Missing type exports
File: src/tools/system/rate-limit.ts:5
Issue: RateLimitConfig interface not exported
Fix: Add export keyword

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 1     | warn   |
| MEDIUM   | 1     | info   |
| LOW      | 0     | pass   |

Verdict: WARNING — 1 HIGH issue should be resolved.
```

## Integration with Other Commands

- Use `/plan` before implementation
- Use `/tdd` for test-driven development
- Use `/security-review` for focused security analysis
