---
name: tdd
description: Test-driven development workflow. Write tests first, implement code, verify all tests pass. USE for all new features and bug fixes.
origin: ECC
---

# TDD Command

This command invokes the **tdd-guide** agent to implement features using test-driven development.

## What This Command Does

1. **Write Tests First** - Create failing tests that define expected behavior
2. **Implement Code** - Write minimal code to make tests pass
3. **Refactor** - Improve code while keeping tests green
4. **Verify** - Ensure all tests pass and coverage meets targets

## When to Use

Use `/tdd` when:

- Implementing new features
- Fixing bugs (write failing test first)
- Refactoring existing code
- Adding new API endpoints
- Creating new tools or agents

## TDD Workflow

### Red-Green-Refactor Cycle

```
1. RED    - Write failing test
2. GREEN  - Write minimal code to pass
3. REFACTOR - Clean up code
4. REPEAT - Next test
```

### Test Structure

```typescript
// 1. Describe what you're testing
describe('ToolRegistry', () => {
  // 2. Describe the behavior
  describe('registerTool', () => {
    // 3. Test one behavior at a time
    it('should add tool to registry', () => {
      const registry = new ToolRegistry();
      const tool = { name: 'test', execute: async () => 'ok' };
      
      registry.registerTool(tool);
      
      expect(registry.getTool('test')).toBeDefined();
    });
  });
});
```

## Example Usage

```
User: /tdd Add a rate limiting tool

Agent (tdd-guide):
# TDD: Rate Limiting Tool

## Step 1: Write Failing Test

Creating test file: src/__tests__/rate-limit.test.ts

```typescript
describe('RateLimiter', () => {
  describe('checkLimit', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 });
      const result = await limiter.checkLimit('user1');
      expect(result.allowed).toBe(true);
    });

    it('should block requests over limit', async () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
      await limiter.checkLimit('user1'); // 1st request
      await limiter.checkLimit('user1'); // 2nd request
      const result = await limiter.checkLimit('user1'); // 3rd request
      
      expect(result.allowed).toBe(false);
    });
  });
});
```

Running tests... FAILED (expected - no implementation yet)

## Step 2: Write Minimal Implementation

Creating: src/tools/system/rate-limit.ts

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests = new Map<string, number[]>();

  constructor(private config: RateLimitConfig) {}

  async checkLimit(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    const recentRequests = requests.filter(time => now - time < this.config.windowMs);
    
    if (recentRequests.length >= this.config.maxRequests) {
      return { allowed: false, remaining: 0 };
    }
    
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    
    return { 
      allowed: true, 
      remaining: this.config.maxRequests - recentRequests.length 
    };
  }
}
```

Running tests... PASSED ✓

## Step 3: Refactor

- Add edge case handling (empty identifier)
- Add cleanup of old entries periodically
- Add TypeScript types

## Integration

Register tool in src/tools/index.ts:

```typescript
import { RateLimiter } from './system/rate-limit.ts';

export function registerCoreTools(registry: ToolRegistry) {
  registry.registerTool({
    name: 'rate-limit-check',
    description: 'Check if request is within rate limit',
    inputSchema: { type: 'object', properties: { identifier: { type: 'string' } } },
    async execute(input) {
      const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000 });
      const result = await limiter.checkLimit(input.identifier);
      return JSON.stringify(result);
    }
  });
}
```

## Test Coverage Requirements

- Minimum 80% coverage for new code
- Test edge cases: empty, null, undefined values
- Test error conditions
- Test integration points

## Integration with Other Commands

- Use `/plan` before `/tdd` to plan implementation
- Use `/code-review` after implementation
- Use `/test-coverage` to check coverage
