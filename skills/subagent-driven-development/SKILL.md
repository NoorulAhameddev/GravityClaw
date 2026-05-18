# subagent-driven-development — Subagent Coordination Skill

## Purpose
Properly coordinate subagents for complex tasks using two-stage review.

## When to Activate
- Large refactoring tasks
- Multi-file changes
- Complex features requiring parallel work
- Code review needed

## Subagent Protocol

### Stage 1: Agent Work
Spawn Agent with:
- Clear description of what to do
- Specific files to modify
- Constraints and boundaries
- Expected output format

### Stage 2: Self Review
Before returning to human:
- Review all changes
- Check for:
  - Syntax errors
  - Type errors (run `npm run typecheck`)
  - Test failures (run `npm run test:run`)
  - Missing exports
  - Inconsistent patterns
- Fix any issues found

### Stage 3: Human Review
Present changes to human:
- Summary of what changed
- Key decisions made
- Any concerns or questions
- Request explicit approval

## Agent Spawn Template
```
Agent: [type]
Description: [what to accomplish]
Prompt:
- [specific task]
- [file paths]
- [constraints]
- [expected output]
```

## Anti-Patterns to Avoid
- Spawning agents without clear scope
- Skipping self-review stage
- Presenting unverified changes to human
- Accepting changes without understanding
- Not running typecheck/tests before review

## Quality Gates
Before human review, confirm:
- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes
- [ ] No console errors
- [ ] Changes match original requirements

## Output
When complete, you should have:
- ✅ Agent spawned with clear scope
- ✅ Self-review completed and issues fixed
- ✅ Changes verified with typecheck + tests
- ✅ Human approval obtained
- ✅ Changes committed