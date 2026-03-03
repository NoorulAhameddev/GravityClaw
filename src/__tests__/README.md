# Gravity Claw Tests

This directory contains the test suite for Gravity Claw using Vitest.

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Structure

- `llm.test.ts` - Tests for LLM history management and conversation flow
- `agent.test.ts` - Tests for agent system, configuration, and tool registry

## Writing Tests

Tests use Vitest with the following patterns:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it('should do something', () => {
    expect(actual).toBe(expected);
  });
});
```

## Test Coverage

Target coverage: >80% for business logic

Current test files:
- ✅ LLM history management
- ✅ Agent configuration and tool registry
- ⏳ Tool implementations (datetime, shell)
- ⏳ Channel integrations (Telegram, WhatsApp, WebChat)
- ⏳ Full agent runs (requires mocking)

## Notes

- Database tests use a test session ID and clean up after each test
- Integration tests with real API calls should be in a separate suite
- Tool registry tests manually register tools since `index.ts` doesn't run during tests
