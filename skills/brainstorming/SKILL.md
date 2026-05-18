# brainstorming — Design Refinement Skill

## Purpose
Before writing any code, engage in structured design discussion with the human partner to refine and validate the approach.

## When to Activate
- User asks to build something new (feature, endpoint, component)
- User describes a problem to solve
- User wants to add a new integration or capability
- Any task that requires design decisions

## What to Do

### Phase 1: Discovery (Ask Questions)
Don't assume you understand the problem. Ask:
- What are you really trying to accomplish?
- Who are the users and what's their workflow?
- What does success look like?
- What are the constraints (performance, scale, timing)?
- What's the simplest version that delivers value?

### Phase 2: Present in Chunks
Don't dump a complete spec. Present in digestible pieces:
- Core requirement → confirm understanding
- Key design decisions → get buy-in  
- Data/model structure → validate
- API/interface → agree on contract
- Edge cases → identify gaps

### Phase 3: Document Decisions
Create a design document (`docs/design/[feature-name].md`) with:
- Problem statement
- Proposed solution
- Alternatives considered (and why rejected)
- Key decisions made
- Open questions
- Next steps

## Interaction Pattern

```
You: "I want to add user authentication"
Agent: 
1. "Help me understand - is this for API authentication, 
   session management, or both?"
2. "What identity provider are you using (none/self-hosted/etc)?"
3. "Show me the current user model and I'll sketch 
   the auth flow"
```

## Key Principles
- **No code until design is approved** — Save energy for implementation
- **Ask why, not just what** — Understand the problem behind the request
- **Challenge assumptions** — "Are you sure that's the right approach?"
- **Simple first** — YAGNI: avoid over-engineering

## Anti-Patterns to Avoid
- jumping straight to code without discussion
- assuming you understand the full context
- designing for imagined future requirements
- not challenging unclear requirements

## Output
When complete, you should have:
- ✅ Clear problem statement (1-2 sentences)
- ✅ Design document in `docs/design/`
- ✅ Human approval on core approach
- ✅ Identified edge cases
- ✅ Ready for planning phase