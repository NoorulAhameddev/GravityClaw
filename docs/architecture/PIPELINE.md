# Pipeline Architecture

The GravityClaw pipeline provides a highly modular and extensible framework for processing incoming user requests. Located in `src/pipeline/`, it replaces the older monolithic execution loops with discrete, testable stages.

## Overview

When a message is received from any channel, it is routed to the `Orchestrator`, which manages the state transition between various pipeline stages.

The core stages are:
1. **Input Validation (`inputValidator.ts`)**: Ensures the payload conforms to the expected schema and sanitizes inputs to prevent injection attacks.
2. **Context Building (`contextBuilder.ts`)**: Injects long-term memory, short-term session history, and skill configurations into the prompt context.
3. **Tool Selection (`toolPicker.ts`)**: Determines which tools are applicable for the current user and context based on RBAC permissions.
4. **LLM Execution (`llmCaller.ts`)**: Interfaces with the AI provider (OpenAI, Anthropic, etc.) to stream responses and handle tool calls.
5. **Tool Execution (`toolExecutor.ts`)**: Dispatches requested tool calls to the `ToolRegistry` and loops back to the `LLMCaller` if further reasoning is required.
6. **Output Validation (`outputValidator.ts`)**: Applies policies to the generated output to ensure no sensitive information or unapproved commands are leaked.
7. **Memory Persistence (`memoryWriter.ts`)**: Asynchronously saves the interaction to the SQLite history and knowledge graph.

## Benefits

- **Testability**: Each module can be unit-tested in isolation without mocking the entire agent loop.
- **Observability**: Metrics and traces can be injected around each distinct stage, making performance bottlenecks easy to identify.
- **Flexibility**: The pipeline design makes it easy to introduce new stages (e.g., a "Moderation" stage before Input Validation) or replace existing ones (e.g., using a vector database for Context Building).

## Adding a New Stage

To add a new stage to the pipeline:
1. Implement the stage function in `src/pipeline/`. It should adhere to the `PipelineStage` type defined in `src/pipeline/types.ts`.
2. Register the stage in the `Orchestrator`'s execution flow in `src/pipeline/orchestrator.ts`.
3. Add appropriate logging and error handling.
