/**
 * Example: Complete Observability Integration
 * 
 * This file demonstrates how to use all observability modules together
 * in a realistic scenario: Processing a user message through the agent.
 */

import { createLogger, LogContext } from "./logger.ts";
import {
    startCorrelationContext,
    endCorrelationContext,
    getCurrentCorrelationId,
    addCorrelationProperty,
} from "./correlation.ts";
import {
    startSpan,
    endSpan,
    endSpanWithError,
    addSpanEvent,
    addSpanAttribute,
} from "./tracing.ts";
import {
    recordHistogram,
    incrementCounter,
    metrics_,
} from "./metrics.ts";

const log = createLogger("example");

/**
 * Example 1: Simple function with tracing and metrics
 */
export async function exampleSimpleOperation(userId: string): Promise<string> {
    const correlationId = getCurrentCorrelationId();
    const span = startSpan("example.simple_operation", { userId });
    const startTime = Date.now();
    
    try {
        log.info("Starting simple operation", {
            correlationId,
            userId,
        } as LogContext);
        
        // Simulate work
        await new Promise(r => setTimeout(r, 100));
        
        const result = `Processed for user: ${userId}`;
        const latency = Date.now() - startTime;
        
        log.info("Simple operation completed", {
            correlationId,
            userId,
            latency,
        } as LogContext);
        
        recordHistogram("example_operation_latency_ms", latency);
        endSpan(span);
        
        return result;
    } catch (error) {
        const latency = Date.now() - startTime;
        log.error("Simple operation failed", error, {
            correlationId,
            userId,
            latency,
        } as LogContext);
        
        endSpanWithError(error as Error, undefined, span);
        throw error;
    }
}

/**
 * Example 2: Complete message processing flow
 */
export async function exampleMessageProcessing(
    userId: string,
    message: string,
    platform: string
): Promise<void> {
    // 1. Start correlation context for entire request
    const { id: correlationId } = startCorrelationContext(undefined, {
        userId,
        platform,
        messageLength: String(message.length),
    });
    
    // 2. Start main span
    const mainSpan = startSpan("message.processing", {
        userId,
        platform,
        messageLength: message.length,
    });
    const mainStartTime = Date.now();
    
    try {
        log.info("Processing message", {
            correlationId,
            userId,
            platform,
            messageLength: message.length,
        } as LogContext);
        
        // 3. Add metadata
        addCorrelationProperty("messageId", `msg-${Date.now()}`);
        addSpanAttribute("messagePreview", message.substring(0, 50));
        
        // 4. Validate message
        const validationSpan = startSpan("message.validation");
        const isValid = await validateMessage(message);
        endSpan(validationSpan);
        
        if (!isValid) {
            log.warn("Invalid message", {
                correlationId,
                userId,
                message: message.substring(0, 50),
            } as LogContext);
            incrementCounter("invalid_messages_total");
            return;
        }
        
        // 5. Store message
        const storeSpan = startSpan("message.store", { userId });
        const storeStartTime = Date.now();
        
        try {
            await storeMessage(userId, message, platform);
            const storeLatency = Date.now() - storeStartTime;
            
            log.debug("Message stored", {
                correlationId,
                userId,
                latency: storeLatency,
            } as LogContext);
            
            metrics_.recordDatabaseOperation("insert_message", storeLatency, true);
            addSpanEvent("message_stored", { platform });
            endSpan(storeSpan);
        } catch (error) {
            const storeLatency = Date.now() - storeStartTime;
            log.error("Failed to store message", error, {
                correlationId,
                userId,
                latency: storeLatency,
            } as LogContext);
            
            metrics_.recordDatabaseOperation("insert_message", storeLatency, false);
            endSpanWithError(error as Error, undefined, storeSpan);
            incrementCounter("message_store_errors_total");
        }
        
        // 6. Process through agent
        const agentSpan = startSpan("agent.run", { userId });
        const agentStartTime = Date.now();
        
        try {
            log.info("Forwarding to agent", {
                correlationId,
                userId,
                messageLength: message.length,
            } as LogContext);
            
            // In real code: const result = await runAgent(...)
            const result = await simulateAgentProcessing(message);
            const agentLatency = Date.now() - agentStartTime;
            
            log.info("Agent processing complete", {
                correlationId,
                userId,
                latency: agentLatency,
                resultLength: result.length,
            } as LogContext);
            
            recordHistogram("agent_processing_latency_ms", agentLatency);
            incrementCounter("messages_processed_total");
            metrics_.recordMessageProcessing(agentLatency, true, platform);
            addSpanEvent("processing_complete", { toolCalls: 3 });
            endSpan(agentSpan);
        } catch (error) {
            const agentLatency = Date.now() - agentStartTime;
            log.error("Agent processing failed", error, {
                correlationId,
                userId,
                latency: agentLatency,
            } as LogContext);
            
            metrics_.recordMessageProcessing(agentLatency, false, platform);
            endSpanWithError(error as Error, undefined, agentSpan);
            incrementCounter("message_processing_errors_total");
        }
        
        // 7. Send response
        const responseSpan = startSpan("message.response", { userId });
        const responseStartTime = Date.now();
        
        try {
            // In real code: await sendChannelMessage(userId, result, platform)
            await sendResponse(userId, "Processed successfully", platform);
            const responseLatency = Date.now() - responseStartTime;
            
            log.debug("Response sent", {
                correlationId,
                userId,
                latency: responseLatency,
            } as LogContext);
            
            metrics_.recordDatabaseOperation("send_message", responseLatency, true);
            endSpan(responseSpan);
        } catch (error) {
            const responseLatency = Date.now() - responseStartTime;
            log.error("Failed to send response", error, {
                correlationId,
                userId,
                latency: responseLatency,
            } as LogContext);
            
            metrics_.recordDatabaseOperation("send_message", responseLatency, false);
            endSpanWithError(error as Error, undefined, responseSpan);
        }
        
        // 8. Complete
        const totalLatency = Date.now() - mainStartTime;
        log.info("Message processing complete", {
            correlationId,
            userId,
            platform,
            totalLatency,
        } as LogContext);
        
        recordHistogram("message_total_latency_ms", totalLatency, { platform });
        endSpan(mainSpan);
    } catch (error) {
        const totalLatency = Date.now() - mainStartTime;
        log.error("Message processing failed", error, {
            correlationId,
            userId,
            totalLatency,
        } as LogContext);
        
        endSpanWithError(error as Error, undefined, mainSpan);
        incrementCounter("message_processing_failures_total");
    } finally {
        // Always end correlation context
        endCorrelationContext();
    }
}

/**
 * Example 3: Error handling with full context
 */
export async function exampleErrorHandling(): Promise<void> {
    const correlationId = getCurrentCorrelationId();
    const span = startSpan("error_handling_demo");
    
    try {
        // Simulate error
        throw new Error("Example error for demonstration");
    } catch (error) {
        // Log with full context
        log.error("Caught error", error, {
            correlationId,
            module: "example",
            operation: "errorHandling",
        } as LogContext);
        
        // End span with error status
        endSpanWithError(error as Error, "Demonstration error", span);
        
        // Record metric
        incrementCounter("demo_errors_total");
    }
}

/**
 * Example 4: Using metric helpers
 */
export async function exampleMetricsRecording(): Promise<void> {
    const startTime = Date.now();
    
    try {
        // Simulate tool execution
        await new Promise(r => setTimeout(r, 150));
        
        const latency = Date.now() - startTime;
        
        // Record using helper
        metrics_.recordToolExecution("search", latency, true);
        
        // Or record manually
        recordHistogram("custom_operation_latency_ms", latency, {
            operation: "search",
            success: "true",
        });
    } catch (error) {
        const latency = Date.now() - startTime;
        metrics_.recordToolExecution("search", latency, false, (error as Error).message);
        throw error;
    }
}

/**
 * Example 5: Context propagation through async chain
 */
export async function exampleAsyncPropagation(): Promise<void> {
    const correlationId = getCurrentCorrelationId();
    
    log.debug("Starting async chain", {
        correlationId,
        step: "initial",
    } as LogContext);
    
    // Correlation ID automatically available in all async operations
    const result1 = await exampleSimpleOperation("user-123");
    
    log.debug("After first operation", {
        correlationId,
        step: "after_op1",
        result: result1.substring(0, 50),
    } as LogContext);
    
    // Still available here
    const result2 = await exampleSimpleOperation("user-456");
    
    log.debug("After second operation", {
        correlationId,
        step: "after_op2",
        result: result2.substring(0, 50),
    } as LogContext);
}

/**
 * Example 6: WebSocket message with correlation
 */
export function exampleWebSocketMessage(message: any): any {
    const correlationId = getCurrentCorrelationId();
    
    // Add correlation ID to outgoing message
    return {
        ...message,
        correlationId,
        timestamp: new Date().toISOString(),
    };
}

// ------- Helper Functions -------

async function validateMessage(message: string): Promise<boolean> {
    // Simulate validation
    await new Promise(r => setTimeout(r, 10));
    return message.length > 0 && message.length < 10000;
}

async function storeMessage(userId: string, message: string, platform: string): Promise<void> {
    // Simulate database operation
    await new Promise(r => setTimeout(r, 30));
    // In real code: db.prepare(...).run(userId, message, platform)
}

async function simulateAgentProcessing(message: string): Promise<string> {
    // Simulate agent processing
    await new Promise(r => setTimeout(r, 200));
    return `Processed: "${message.substring(0, 30)}..."`;
}

async function sendResponse(userId: string, response: string, platform: string): Promise<void> {
    // Simulate sending message
    await new Promise(r => setTimeout(r, 50));
    // In real code: channel.sendMessage(userId, response)
}

// ------- Usage Example -------

export async function runCompleteExample(): Promise<void> {
    console.log("=== Gravity Claw Observability Example ===\n");
    
    // Scenario: User sends message on Telegram
    const { id: correlationId } = startCorrelationContext(undefined, {
        source: "example",
        scenario: "telegram_message",
    });
    
    try {
        await exampleMessageProcessing(
            "user-123",
            "Hello, what's the weather like?",
            "telegram"
        );
        
        console.log(`\n✅ Example completed with correlation ID: ${correlationId}`);
        console.log("📊 Try these endpoints:");
        console.log("  - GET /api/health");
        console.log("  - GET /metrics");
        console.log("  - GET /api/metrics");
        console.log(`  - GET /api/traces/${correlationId}`);
    } finally {
        endCorrelationContext();
    }
}

// Uncomment to run:
// await runCompleteExample();
