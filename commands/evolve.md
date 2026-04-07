---
name: evolve
description: Cluster multiple instincts/patterns into cohesive skills. USE when you have related patterns that should be combined.
origin: ECC
---

# Evolve Command

This command clusters related patterns (instincts) into cohesive skills.

## What This Command Does

1. **Analyze instincts** — Find related patterns in the instincts database
2. **Cluster** — Group related patterns together
3. **Synthesize** — Create unified skill from clustered patterns
4. **Validate** — Ensure skill is coherent and useful

## When to Use

Use `/evolve` when:

- You have multiple related instincts/patterns
- Patterns should be combined into a skill
- You want to create comprehensive skills from碎片

## Evolution Process

### Step 1: Pattern Collection
```
- Collect all matching instincts/patterns
- Analyze relationships between them
- Identify core concepts
```

### Step 2: Clustering
```
- Group by topic/concept
- Identify shared context
- Find unifying themes
```

### Step 3: Skill Synthesis
```markdown
---
name: evolved-skill
description: Comprehensive skill from clustered patterns
---

# Evolved Skill

## Core Concepts
[Unified understanding]

## Patterns
- Pattern 1: [summary]
- Pattern 2: [summary]

## Synthesis
[How the patterns work together]

## Usage
[How to apply this skill]
```

## Example Usage

```
User: /evolve rate limiting

Agent:
# Evolving Skill: Rate Limiting

Found 3 related instincts:
1. Sliding window algorithm
2. Token bucket pattern
3. Redis-based distributed rate limiting

Clustering patterns...
Synthesizing into unified skill...

Created: skills/rate-limiting/SKILL.md

## Skill Structure
- Core algorithms (sliding window, token bucket)
- Implementation patterns
- Distributed rate limiting with Redis
- Best practices and pitfalls

✓ Evolved skill created
```

## Related Commands

- `/learn` - Extract patterns from sessions
- `/prune` - Remove expired instincts
- `/continuous-learning` - Full learning system
