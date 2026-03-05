# Skills Guide

**Create and manage prompt-based knowledge assets for your agent**

---

## Overview

Skills in GravityClaw are markdown files containing specialized knowledge, tools, and executable code blocks. Unlike plugins (which are runtime modules), skills are lightweight, prompt-based assets that enhance the agent's capabilities without requiring code deployment.

### Skills vs Plugins

| Feature | Skills | Plugins |
|---------|--------|---------|
| **Format** | Markdown files | JavaScript/TypeScript modules |
| **Scope** | Knowledge + Code templates | Full runtime extensions |
| **Loading** | Runtime, on-demand | Startup or runtime |
| **Execution** | Via interpreter (Python, shell, etc.) | Native JavaScript/TypeScript |
| **Use Case** | Specialized domain knowledge | Core functionality extensions |

---

## Skill File Format

Skills are markdown files with YAML frontmatter followed by content and optional code blocks.

### Basic Structure

```markdown
---
name: skill_name
description: What this skill does
enabled: true
tools:
  - name: tool_name
    description: Tool description
    parameters:
      - name: param_name
        type: string
        required: true
        description: Parameter description
---

# Skill Title

Skill documentation and guidance.

## Tool: tool_name

Tool-specific documentation.

\`\`\`python
# Executable code with ${parameter} interpolation
import json

param_value = "${param_name}"
result = do_something(param_value)

print(json.stringify({"success": True, "result": result}))
\`\`\`
```

### Frontmatter Schema

```yaml
name: string              # Unique skill identifier (required)
description: string       # Brief skill description (required)
enabled: boolean          # Whether skill is active (default: true)
tags: string[]           # Optional tags for categorization
version: string          # Optional version number
author: string           # Optional author name
tools:                   # Tool definitions (optional)
  - name: string         # Tool name (unique within skill)
    description: string  # Tool description for LLM
    parameters:          # Tool parameters
      - name: string     # Parameter name
        type: string     # Parameter type (string, number, boolean, object, array)
        required: boolean # Whether parameter is required
        description: string # Parameter description
        default: any     # Optional default value
```

---

## Creating Skills

### Example 1: Calculator Skill

```markdown
---
name: calculator
description: Advanced mathematical calculations
enabled: true
tools:
  - name: calculate_expression
    description: Evaluate a mathematical expression
    parameters:
      - name: expression
        type: string
        required: true
        description: Mathematical expression to evaluate (e.g., "sqrt(16) + 2**3")
---

# Calculator Skill

Advanced mathematical operations using Python's math library.

## Tool: calculate_expression

Evaluates mathematical expressions safely.

\`\`\`python
import math
import json

expression = "${expression}"

try:
    result = eval(expression, {"__builtins__": {}}, {
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "pi": math.pi,
        "e": math.e,
    })
    print(json.dumps({"success": True, "result": result}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
\`\`\`
```

### Example 2: Weather Skill

```markdown
---
name: weather
description: Get weather information
enabled: true
tools:
  - name: get_weather
    description: Get current weather for a location
    parameters:
      - name: location
        type: string
        required: true
        description: City name or coordinates
      - name: units
        type: string
        required: false
        default: metric
        description: Temperature units (metric, imperial, kelvin)
---

# Weather Skill

Fetch weather data from external API.

## Tool: get_weather

Gets current weather conditions.

\`\`\`bash
#!/bin/bash
location="${location}"
units="${units}"

# Call weather API
curl -s "https://api.weather.example.com/current?q=$location&units=$units" | jq '{
  "success": true,
  "location": .name,
  "temperature": .main.temp,
  "conditions": .weather[0].description
}'
\`\`\`
```

### Example 3: Knowledge-Only Skill

Skills don't require tools—they can just provide guidance:

```markdown
---
name: typescript_best_practices
description: TypeScript coding standards and best practices
enabled: true
tags: [coding, typescript, standards]
---

# TypeScript Best Practices

## Type Safety

Always use strict type checking:
- Enable `strict: true` in tsconfig.json
- Avoid `any` type—use `unknown` for truly unknown types
- Use type guards for runtime type narrowing

## Naming Conventions

- `PascalCase` for types, interfaces, and classes
- `camelCase` for variables, functions, and methods
- `SCREAMING_SNAKE_CASE` for constants
- Prefix interfaces with `I` only when necessary

## Error Handling

Prefer explicit error handling:
\`\`\`typescript
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return { success: false, error: "Division by zero" };
  return { success: true, value: a / b };
}
\`\`\`

## Async Patterns

Always handle promise rejections:
\`\`\`typescript
async function fetchData(): Promise<Data> {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    logger.error("Fetch failed", error);
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}
\`\`\`
```

---

## Managing Skills

### Loading Skills

```typescript
// Via tool
{
  "name_or_path": "calculator"  // Load from skills directory
}

// Or absolute path
{
  "name_or_path": "/path/to/my_skill.md"
}
```

**Result**:
```json
{
  "success": true,
  "skill": {
    "name": "calculator",
    "description": "Advanced mathematical calculations",
    "tools": [
      {
        "name": "calculate_expression",
        "description": "Evaluate a mathematical expression",
        "parameters": 1
      }
    ],
    "toolCount": 1,
    "hasCodeBlocks": true
  }
}
```

### Listing Skills

```typescript
// Via tool API
skill_list()
```

**Returns**:
```json
{
  "success": true,
  "count": 2,
  "skills": [
    {
      "name": "calculator",
      "enabled": true,
      "toolCount": 1,
      "tools": ["calculate_expression"],
      "hasCode": true
    },
    {
      "name": "weather",
      "enabled": true,
      "toolCount": 1,
      "tools": ["get_weather"],
      "hasCode": true
    }
  ]
}
```

### Disabling Skills

```typescript
disable_skill({ skill_name: "calculator" })
```

### Reloading Skills

After modifying skill files:

```typescript
reload_skills()
```

---

## Code Blocks in Skills

### Supported Languages

Skills can include executable code in:
- **Python** - For data processing, calculations, ML
- **Bash/Shell** - For system commands, API calls
- **JavaScript/Node.js** - For JS-specific operations
- **SQL** - For database queries

### Parameter Interpolation

Use `${parameter_name}` syntax in code blocks:

```python
user_input = "${query}"
limit = int("${limit}")

results = search_database(user_input, limit)
print(json.dumps(results))
```

**Important**: Parameters are string-substituted before execution, so validate and sanitize inputs!

### Output Format

Code blocks should output JSON to stdout:

```python
print(json.dumps({
  "success": True,
  "data": result,
  "message": "Operation completed"
}))
```

Or for errors:

```python
print(json.dumps({
  "success": False,
  "error": "Error message here"
}))
```

### Execution Environment

- Code runs in isolated subprocess
- No access to agent's internal state
- Timeout enforced (default: 30s)
- stdout/stderr captured

---

## Best Practices

### Design Principles

1. **Single Responsibility**: Each skill should focus on one domain
2. **Clear Documentation**: Explain what the skill does and how to use it
3. **Safe Code**: Validate inputs, handle errors, no dangerous operations
4. **Deterministic**: Same inputs should produce same outputs
5. **Fast Execution**: Keep tool execution time reasonable (<5s ideally)

### Security

✅ **Do**:
- Validate and sanitize all inputs
- Use safe eval contexts (restricted builtins)
- Handle errors gracefully
- Log suspicious inputs
- Set execution timeouts

❌ **Don't**:
- Execute arbitrary user code directly
- Access sensitive file paths
- Make unrestricted network calls
- Use unsafe functions (exec, eval without sandboxing)
- Store secrets in skill files

### Performance

- Cache expensive operations
- Limit output size
- Use efficient algorithms
- Consider async operations for I/O
- Set reasonable timeouts

### Documentation

- Provide clear tool descriptions for LLM
- Include usage examples
- Document parameter format and constraints
- Explain error conditions
- Add troubleshooting tips

---

## Advanced Patterns

### Multi-Tool Skills

A single skill can provide multiple related tools:

```yaml
tools:
  - name: user_create
    description: Create a new user
    parameters: [...]
  - name: user_get
    description: Get user by ID
    parameters: [...]
  - name: user_update
    description: Update user information
    parameters: [...]
  - name: user_delete
    description: Delete a user
    parameters: [...]
```

### Stateful Skills

Use SQLite or file storage for state:

```python
import sqlite3
import json

db = sqlite3.connect("/path/to/skill-state.db")

action = "${action}"
data = "${data}"

if action == "store":
    db.execute("INSERT INTO state (key, value) VALUES (?, ?)", 
               ("mykey", data))
    db.commit()
    print(json.dumps({"success": True}))
elif action == "retrieve":
    row = db.execute("SELECT value FROM state WHERE key = ?", 
                     ("mykey",)).fetchone()
    print(json.dumps({"success": True, "value": row[0] if row else None}))
```

### Chained Tools

Tools can call other tools:

```markdown
## Tool: analyze_and_visualize

1. Calls `analyze_data` tool
2. Takes analysis results
3. Calls `create_chart` tool
4. Returns both analysis and chart

\`\`\`python
import json
import subprocess

# Call analyze_data tool
analysis = subprocess.run(
    ["gravityclaw-tool", "analyze_data", "--input", "${data}"],
    capture_output=True, text=True
)
analysis_result = json.loads(analysis.stdout)

# Generate visualization
# ...

print(json.dumps({
  "success": True,
  "analysis": analysis_result,
  "chart_url": chart_url
}))
\`\`\`
```

---

## Skill Discovery

### Skill Directory Structure

```
skills/
├── .skills-state.json          # Skills manager state
├── example-calculator.md        # Example skill
├── example-weather.md           # Example skill
├── my-custom-skill.md          # Your skills
└── domains/                    # Organize by domain
    ├── data-science/
    │   ├── pandas-analysis.md
    │   └── ml-predictions.md
    ├── devops/
    │   ├── docker-ops.md
    │   └── kubernetes-mgmt.md
    └── business/
        ├── reporting.md
        └── analytics.md
```

### Auto-loading

Skills in `skills/` directory are auto-discovered on startup. Organize with subdirectories as needed—the skills manager recursively scans for `.md` files.

---

## Troubleshooting

### Skill Won't Load

**Problem**: Skill file fails to load

**Solutions**:
1. Check YAML frontmatter syntax (use YAML validator)
2. Ensure required fields (`name`, `description`) are present
3. Verify file is `.md` extension
4. Check file permissions (readable)
5. Review log output: `LOG_LEVEL=debug npm start`

### Tool Not Available

**Problem**: Tool from skill doesn't appear in tool list

**Solutions**:
1. Verify skill is enabled (`enabled: true`)
2. Reload skills: `reload_skills()` tool
3. Check tool name doesn't conflict with built-in tool
4. Verify code block language is specified

### Code Execution Fails

**Problem**: Code block fails to execute

**Solutions**:
1. Test code independently (copy/paste, run manually)
2. Check parameter interpolation syntax
3. Verify required interpreter is installed (python, bash, etc.)
4. Check execution timeout (increase if needed)
5. Review stderr output for error details
6. Add error handling to code block

### Parameter Interpolation Issues

**Problem**: Parameters not substituting correctly

**Solutions**:
1. Use exact parameter name from frontmatter
2. Wrap in quotes if value might contain spaces
3. Escape special characters if needed
4. Use type validation in code:
   ```python
   param = "${param_name}"
   if not param:
       print(json.dumps({"success": False, "error": "Missing parameter"}))
       exit(1)
   ```

---

## Examples Repository

More skill examples:

- **Data Processing**: CSV parsing, JSON transformation
- **API Integration**: REST API wrappers, webhook handlers
- **DevOps**: Docker commands, log analysis
- **Business**: Report generation, data export
- **AI/ML**: Model inference, data preprocessing

---

## Skill Publishing

### Sharing Skills

Package skills for sharing:

```bash
# Create skill package
tar czf my-skill-pack.tar.gz skills/my-domain/

# Share via GitHub, GitLab, etc.
git add skills/my-skill.md
git commit -m "Add my-skill"
git push
```

### Skill Marketplace (Future)

Planned features:
- Central skill repository
- Version management
- Dependency resolution
- Automatic updates
- Quality ratings

---

## See Also

- [Plugins README](../src/plugins/README.md) - For runtime extensions
- [Tools Reference](TOOLS_REFERENCE.md) - Built-in tool catalog
- [Architecture](ARCHITECTURE.md) - System design
- [API Reference](API.md) - Skill management APIs
