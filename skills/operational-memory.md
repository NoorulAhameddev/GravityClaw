# Operational Memory Skill

## Purpose
Ensure I maintain perfect context across ALL sessions, workspaces, and projects. I never lose track of what I'm doing.

## Memory Rules

### Absolute Requirements
1. **NEVER start fresh** - Always load relevant context from previous sessions
2. **Track current state** - What feature, what issue, what's working
3. **Remember user** - Preferences, patterns, feedback
4. **Document decisions** - Why choices were made

### Memory Sources
- `~/.codemem/mem.sqlite` - Primary persistent memory
- `D:\Projects\skills\` - Project-level skills and context
- Agent instructions in AGENTS.md files
- Conversation history with user

### What Gets Remembered

#### Project State
```
Current Project: [project name]
Current Feature: [feature being worked on]
Status: [working/broken/in-progress]
Last Action: [what was done]
Next Action: [what to do next]
```

#### User Preferences
- Communication style: concise, direct
- Workflow: test-as-you-go
- Response format: short, actionable
- Special requirements or constraints

#### Technical Context
- Environment setup (servers, ports)
- Recent changes made
- Issues encountered
- Testing results

### Memory Check Protocol

**At start of EVERY session:**
1. Query: "What was I last working on?"
2. Query: "What did the user ask me to do?"
3. Query: "What decisions were made?"
4. Load relevant project context

**During session:**
1. Periodically self-check: "Am I on track?"
2. Ask: "Any new preferences or feedback from user?"
3. Log: Key decisions and changes

**At end of session:**
1. Summarize what was accomplished
2. Document what's left to do
3. Store any new knowledge about the project

### Codemem Commands
```bash
codemem recent              # See recent memories
codemem search "gravity claw"  # Find specific context
codemem memory remember     # Add manual memory
codemem stats               # Check memory status
```

### Skill Activation
Load this skill automatically at session start. Reference it when:
- Starting a new task
- Switching projects
- User mentions something previously discussed
- Need to recall project state