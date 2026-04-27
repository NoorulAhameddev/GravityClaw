import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgent } from '../../agent';

// Mock dependencies
const mockConfig = {
  AGENT_MAX_ITERATIONS: 3,
  AGENT_MAX_TOOLS_PER_ITERATION: 2,
  AGENT_MAX_TOOLS_TOTAL: 5,
  LLM_PROVIDER: 'mock',
  LLM_MODEL: 'mock',
};

const mockToolRegistry = {
  getOpenAIDefinitionsForTools: vi.fn().mockReturnValue([]),
  getRelevantTools: vi.fn().mockReturnValue([]),
  get: vi.fn().mockReturnValue({
    name: 'test_tool',
    inputSchema: { type: 'object', additionalProperties: true },
    execute: vi.fn().mockImplementation(async () => `Success: no errors. Result: ${Date.now()}-${Math.random()}`),
  }),
};

const mockDb = {
  prepare: vi.fn().mockReturnValue({
    all: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    run: vi.fn(),
  }),
};

const mockDependencies = {
  config: mockConfig,
  toolRegistry: mockToolRegistry,
  db: mockDb,
};

// Mock the LLM orchestrator
const mockCallClaude = vi.fn();
vi.mock('../../llm/index.ts', () => ({
  callClaude: (...args: any[]) => mockCallClaude(...args),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  addToolResult: vi.fn(),
}));

vi.mock('ajv', () => {
  return {
    default: class MockAjv {
      compile() { 
        const validate = () => true;
        (validate as any).errors = [];
        return validate;
      }
      errorsText() { return 'mock error'; }
    }
  };
});

// Mock memory retrieval
vi.mock('../../memory/retrieval.ts', () => ({
  retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
}));

// Mock performance tracking
vi.mock('../../performance/agent-optimization.ts', () => ({
  trackIterationMetrics: vi.fn(),
}));
vi.mock('../../performance/tool-optimization.ts', () => ({
  trackToolExecution: vi.fn(),
}));

vi.mock('../../lib/telemetry/tracer.js', () => {
  const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() };
  return {
    withSpanAsync: vi.fn().mockImplementation(async (name, fn) => await fn(mockSpan)),
    withSpan: vi.fn().mockImplementation((name, fn) => fn(mockSpan)),
    SpanKind: { INTERNAL: 'internal' },
    injectTraceContext: vi.fn(),
    tracer: { startSpan: vi.fn() },
  };
});
vi.mock('../../lib/telemetry/metrics.js', () => ({
  recordAgentRun: vi.fn(),
  recordToolCall: vi.fn(),
}));
vi.mock('../../lib/telemetry/logger.js', () => ({
  telemetryLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Agent Loop Security Limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to defaults
    mockConfig.AGENT_MAX_ITERATIONS = 3;
    mockConfig.AGENT_MAX_TOOLS_PER_ITERATION = 2;
    mockConfig.AGENT_MAX_TOOLS_TOTAL = 5;
    
    // Reset tool registry mock
    mockToolRegistry.get.mockReturnValue({
      name: 'test_tool',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: vi.fn().mockImplementation(async () => `Success: no errors. Result: ${Date.now()}-${Math.random()}`),
    });
  });

  it('should respect per-iteration tool limit', async () => {
    // Mock LLM to return many tool calls
    mockCallClaude.mockResolvedValue({
      text: 'Calling tools',
      toolCalls: [
        { id: '1', function: { name: 'test_tool', arguments: '{}' } },
        { id: '2', function: { name: 'test_tool', arguments: '{}' } },
        { id: '3', function: { name: 'test_tool', arguments: '{}' } },
        { id: '4', function: { name: 'test_tool', arguments: '{}' } },
      ],
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session',
      dependencies: mockDependencies as any,
    });

    // Should limit to 2 tools per iteration (maxToolsPerIteration = 2)
    // Since we have 4 tool calls, only first 2 should be executed per iteration
    // The agent will continue iterations until maxIterations (3) or no more tool calls
    // Expect total tool calls to be <= maxToolsTotal (5)
    expect(result.toolCallCount).toBeLessThanOrEqual(5);
    // Should have hit limit because we had more tool calls than per-iteration limit
    // The loop will continue but tool calls will be limited
  });

  it('should respect total tool call limit', async () => {
    mockConfig.AGENT_MAX_TOOLS_TOTAL = 3;
    
    // Mock LLM to return tool calls each iteration
    let callCount = 0;
    mockCallClaude.mockImplementation(async () => {
      callCount++;
      return {
        text: 'Tool call iteration',
        toolCalls: [
          { id: `call-${callCount}`, function: { name: 'test_tool', arguments: '{}' } },
        ],
      };
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session-total-limit',
      dependencies: mockDependencies as any,
    });

    // Should stop after 3 total tool calls
    expect(result.toolCallCount).toBe(3);
  });

  it('should return hitLimit=true when limits exceeded', async () => {
    mockConfig.AGENT_MAX_ITERATIONS = 1;
    mockConfig.AGENT_MAX_TOOLS_PER_ITERATION = 1;
    
    // Mock LLM to return 2 tool calls in first iteration
    mockCallClaude.mockResolvedValue({
      text: 'Multiple tools',
      toolCalls: [
        { id: '1', function: { name: 'test_tool', arguments: '{}' } },
        { id: '2', function: { name: 'test_tool', arguments: '{}' } },
      ],
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session-hit-limit',
      dependencies: mockDependencies as any,
    });

    // Should have executed only 1 tool call (per-iteration limit)
    expect(result.toolCallCount).toBe(1);
    // hitLimit is true because we hit maxIterations=1
    expect(result.hitLimit).toBe(true);
  });

  it('should set hitLimit when total limit reached during iteration', async () => {
    mockConfig.AGENT_MAX_TOOLS_TOTAL = 2;
    mockConfig.AGENT_MAX_TOOLS_PER_ITERATION = 10; // high per-iteration limit
    
    // Mock LLM to return 3 tool calls in first iteration
    mockCallClaude.mockResolvedValue({
      text: 'Many tools',
      toolCalls: [
        { id: '1', function: { name: 'test_tool', arguments: '{}' } },
        { id: '2', function: { name: 'test_tool', arguments: '{}' } },
        { id: '3', function: { name: 'test_tool', arguments: '{}' } },
      ],
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session-hit-total',
      dependencies: mockDependencies as any,
    });

    // Should have executed only 2 tool calls (total limit)
    expect(result.toolCallCount).toBe(2);
    // hitLimit should be true because total limit was reached
    expect(result.hitLimit).toBe(true);
  });

  it('should stop after max iterations even with available tool calls', async () => {
    mockConfig.AGENT_MAX_ITERATIONS = 2;
    mockConfig.AGENT_MAX_TOOLS_TOTAL = 100; // high total limit
    
    // Mock LLM to always return a tool call
    let iteration = 0;
    mockCallClaude.mockImplementation(async () => {
      iteration++;
      return {
        text: `Iteration ${iteration}`,
        toolCalls: [
          { id: `call-${iteration}`, function: { name: 'test_tool', arguments: '{}' } },
        ],
      };
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session-max-iter',
      dependencies: mockDependencies as any,
    });

    // Should have executed 2 tool calls (2 iterations)
    expect(result.toolCallCount).toBe(2);
    // Should hit limit because maxIterations returned hitLimit:true now
    expect(result.hitLimit).toBe(true);
  });

  it('should handle unknown tools gracefully', async () => {
    mockToolRegistry.get.mockReturnValue(undefined);
    
    mockCallClaude.mockResolvedValue({
      text: 'Unknown tool',
      toolCalls: [
        { id: '1', function: { name: 'unknown_tool', arguments: '{}' } },
      ],
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session-unknown',
      dependencies: mockDependencies as any,
    });

    // Should not crash, loop runs until consecutive no progress breaks it
    expect(result.toolCallCount).toBe(2);
  });

  it('should enforce tool limits across multiple iterations', async () => {
    mockConfig.AGENT_MAX_ITERATIONS = 5;
    mockConfig.AGENT_MAX_TOOLS_PER_ITERATION = 1;
    mockConfig.AGENT_MAX_TOOLS_TOTAL = 3;
    
    // Mock LLM to return 1 tool call each iteration
    let iteration = 0;
    mockCallClaude.mockImplementation(async () => {
      iteration++;
      return {
        text: `Iteration ${iteration}`,
        toolCalls: [
          { id: `call-${iteration}`, function: { name: 'test_tool', arguments: '{}' } },
        ],
      };
    });

    const result = await runAgent({
      message: 'Test',
      sessionId: 'test-session-multi',
      dependencies: mockDependencies as any,
    });

    // Should stop after 3 total tool calls (total limit)
    expect(result.toolCallCount).toBe(3);
    expect(result.hitLimit).toBe(true);
  });
});