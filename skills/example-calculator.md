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
  - name: solve_equation
    description: Solve a mathematical equation
    parameters:
      - name: equation
        type: string
        required: true
        description: Equation to solve (e.g., "x**2 - 4 = 0")
---

# Calculator Skill

Advanced mathematical operations using Python's math and sympy libraries.

## Tool: calculate_expression

Evaluates mathematical expressions safely.

```python
import math
import json

expression = "${expression}"

try:
    # Safe evaluation with math functions
    result = eval(expression, {"__builtins__": {}}, {
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "log": math.log,
        "exp": math.exp,
        "pi": math.pi,
        "e": math.e,
        "abs": abs,
        "round": round,
        "pow": pow,
    })
    print(json.dumps({"success": True, "result": result}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
```

## Tool: solve_equation

Solves equations using symbolic mathematics.

```python
import sympy as sp
import json

equation_str = "${equation}"

try:
    x = sp.Symbol('x')
    # Parse equation (assumes form "expr = 0")
    if '=' in equation_str:
        left, right = equation_str.split('=')
        eq = sp.sympify(left.strip()) - sp.sympify(right.strip())
    else:
        eq = sp.sympify(equation_str)
    
    solutions = sp.solve(eq, x)
    print(json.dumps({"success": True, "solutions": [str(s) for s in solutions]}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
```

## Example Usage

- "Calculate sqrt(144) + 2**8"
- "Solve the equation x**2 - 9 = 0"
