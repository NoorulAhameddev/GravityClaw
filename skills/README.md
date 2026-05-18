# GravityClaw Skills

This directory contains Superpowers-inspired skills that guide development workflow.

## Available Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| [brainstorming](brainstorming/) | Design refinement | Before writing any code |
| [writing-plans](writing-plans/) | Implementation planning | After design approved |
| [test-driven-development](test-driven-development/) | TDD enforcement | Writing any code |
| [subagent-driven-development](subagent-driven-development/) | Subagent coordination | Complex multi-file tasks |
| [code-review](code-review/) | PR quality gate | Before commit |

## Superpowers Integration

These skills implement the Superpowers methodology (94% PR rejection rate, TDD-first, subagent-driven):

1. **brainstorming** → Design before code, ask why not just what
2. **writing-plans** → Break into 2-5 minute tasks
3. **test-driven-development** → RED-GREEN-REFACTOR cycle
4. **subagent-driven-development** → Two-stage review (agent + self)
5. **code-review** → Quality gates before human review

## Usage

These skills are automatically available to Claude Code in this project. They activate based on context (see each skill's "When to Activate" section).

For more on Superpowers: https://github.com/obra/superpowers