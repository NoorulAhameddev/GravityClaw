# writing-plans — Implementation Planning Skill

## Purpose
Create detailed, actionable implementation plans before writing code.

## When to Activate
- After brainstorming design is approved
- Before entering plan mode
- When breaking down features into tasks

## Planning Requirements

### Task Granularity
Break work into tasks that take **2-5 minutes each**. No task should take longer than 5 minutes.

### Plan Structure
```markdown
## Implementation Plan: [Feature Name]

### Phase 1: [Phase Name]
- [ ] Task 1: [Description] (~2min)
- [ ] Task 2: [Description] (~3min)
- [ ] Task 3: [Description] (~5min)

### Phase 2: [Phase Name]
...
```

### Task Naming Convention
Use verbs: "Add", "Fix", "Create", "Update", "Remove", "Refactor"
Be specific: "Add user authentication endpoint" not "Auth"

## Anti-Patterns to Avoid
- Tasks taking 30+ minutes (too large)
- Vague task descriptions
- Skipping test tasks
- Not including cleanup/refactor tasks
- Planning without understanding the codebase

## Output
When complete, you should have:
- ✅ Phase breakdown with clear boundaries
- ✅ Each task is 2-5 minutes
- ✅ Test tasks included in each phase
- ✅ Dependencies identified between tasks
- ✅ Ready for plan mode execution