---
name: learn
description: Extract successful patterns from current session into reusable skills. USE after completing successful workflows.
origin: ECC
---

# Learn Command

This command extracts patterns from successful agent interactions and saves them as reusable skills.

## What This Command Does

1. **Analyze session** — Review recent successful interactions
2. **Identify patterns** — Find reusable solutions and approaches
3. **Create skill** — Document the pattern as a skill file
4. **Save** — Store in skills directory for future use

## When to Use

Use `/learn` when:

- You solve a complex problem successfully
- You discover a useful pattern or approach
- You create a reusable solution
- After completing significant features

## Pattern Extraction Process

### Step 1: Session Analysis
- Review recent tool calls and results
- Identify what worked well
- Find reusable approaches

### Step 2: Pattern Documentation
- Write the problem/solution clearly
- Document the approach and reasoning
- Provide concrete examples

### Step 3: Skill Creation
```markdown
---
name: pattern-name
description: Brief description of what this pattern solves
---

# Pattern Name

## Problem
[Description of the problem this pattern solves]

## Solution
[How to solve it]

## Example
[Concrete code example]

## When to Use
[When this pattern is appropriate]
```

## Example Usage

```
User: /learn

Agent:
# Pattern Extraction

Analyzing recent session...
Found: Successful rate limiting implementation

Pattern: Rate Limiting with Sliding Window

Extracted Pattern:
- Problem: Need to limit API requests per user
- Solution: Sliding window algorithm with in-memory store
- Context: Used for Telegram bot rate limits

Creating skill: skills/rate-limiting-pattern/SKILL.md

✓ Pattern saved to skills/rate-limiting-pattern/SKILL.md
```

## Integration with Continuous Learning

The learn command works with:
- `skills/continuous-learning/` - Full continuous learning system
- `skills/strategic-compact/` - Context optimization
- `skills/verification-loop/` - Checkpoint-based verification

## Related Commands

- `/evolve` - Cluster multiple patterns into skills
- `/continuous-learning` - Full learning system
