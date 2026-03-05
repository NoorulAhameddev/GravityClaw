import { config } from "../config.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("correlation");

/**
 * Correlation ID format: corr-{timestamp}-{random}
 * Used to trace requests across multiple services and async operations
 */
export interface CorrelationContext {
    id: string;
    startTime: number;
    userProperties?: Map<string, string> | undefined;
}

const activeContextStack: string[] = [];
const contextMap = new Map<string, CorrelationContext>();

/**
 * Generate a new correlation ID
 * Format: corr-{timestamp}-{random}
 */
export function generateCorrelationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `corr-${timestamp}-${random}`;
}

/**
 * Start a new correlation context
 */
export function startCorrelationContext(
    correlationId: string = generateCorrelationId(),
    metadata?: Record<string, string>
): CorrelationContext {
    const context: CorrelationContext = {
        id: correlationId,
        startTime: Date.now(),
        userProperties: metadata ? new Map(Object.entries(metadata)) : undefined,
    };
    
    contextMap.set(correlationId, context);
    activeContextStack.push(correlationId);
    
    log.debug(`Started correlation context: ${correlationId}`);
    
    return context;
}

/**
 * Get current correlation context
 */
export function getCurrentCorrelationId(): string | undefined {
    return activeContextStack[activeContextStack.length - 1];
}

/**
 * Get current correlation context details
 */
export function getCurrentCorrelationContext(): CorrelationContext | undefined {
    const id = getCurrentCorrelationId();
    return id ? contextMap.get(id) : undefined;
}

/**
 * Set correlation context  (for propagation)
 */
export function setCurrentCorrelationId(correlationId: string): void {
    if (!contextMap.has(correlationId)) {
        startCorrelationContext(correlationId);
    } else {
        activeContextStack.push(correlationId);
    }
}

/**
 * End current correlation context
 */
export function endCorrelationContext(): CorrelationContext | undefined {
    const id = activeContextStack.pop();
    if (!id) return undefined;
    
    const context = contextMap.get(id);
    
    if (context) {
        const duration = Date.now() - context.startTime;
        log.debug(`Ended correlation context: ${id} (duration: ${duration}ms)`);
    }
    
    // Clean up old contexts (keep only last 1000)
    if (contextMap.size > 1000) {
        const entries = Array.from(contextMap.entries())
            .sort((a, b) => (a[1] as CorrelationContext).startTime - (b[1] as CorrelationContext).startTime)
            .slice(0, contextMap.size - 500);
        
        contextMap.clear();
        entries.forEach(([id, ctx]: [string, CorrelationContext]) => contextMap.set(id, ctx));
    }
    
    return context;
}

/**
 * Add custom properties to current correlation context
 */
export function addCorrelationProperty(key: string, value: string): void {
    const context = getCurrentCorrelationContext();
    if (context) {
        if (!context.userProperties) {
            context.userProperties = new Map();
        }
        context.userProperties.set(key, value);
    }
}

/**
 * Get correlation ID header for HTTP requests
 * (e.g., "X-Correlation-ID")
 */
export function getCorrelationHeader(): { name: string; value: string } | null {
    const id = getCurrentCorrelationId();
    if (!id) return null;
    
    return {
        name: config.CORRELATION_ID_HEADER || "X-Correlation-ID",
        value: id,
    };
}

/**
 * Propagate correlation ID through WebSocket frame
 */
export function addCorrelationToMessage(message: Record<string, unknown>): Record<string, unknown> {
    const id = getCurrentCorrelationId();
    if (id) {
        message[config.CORRELATION_ID_HEADER || "correlationId"] = id;
    }
    return message;
}

/**
 * Extract correlation ID from incoming message
 */
export function extractCorrelationFromMessage(message: Record<string, unknown>): string | undefined {
    const headerName = config.CORRELATION_ID_HEADER || "X-Correlation-ID";
    return (message[headerName] as string) || 
           (message["correlationId"] as string) || 
           undefined;
}

/**
 * Wrap an async function with correlation context
 */
export function withCorrelationContext<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    correlationId?: string
): T {
    return (async (...args: any[]) => {
        const id = correlationId || generateCorrelationId();
        startCorrelationContext(id);
        try {
            return await fn(...args);
        } finally {
            endCorrelationContext();
        }
    }) as T;
}

/**
 * Wrap a synchronous function with correlation context
 */
export function withCorrelationContextSync<T extends (...args: any[]) => any>(
    fn: T,
    correlationId?: string
): T {
    return ((...args: any[]) => {
        const id = correlationId || generateCorrelationId();
        startCorrelationContext(id);
        try {
            return fn(...args);
        } finally {
            endCorrelationContext();
        }
    }) as T;
}

/**
 * Get all active correlations (for debugging/monitoring)
 */
export function getActiveCorrelations(): Array<{ id: string; duration: number; properties?: Record<string, string> | undefined }> {
    return Array.from(contextMap.values()).map((ctx: CorrelationContext) => ({
        id: ctx.id,
        duration: Date.now() - ctx.startTime,
        properties: ctx.userProperties ? Object.fromEntries(ctx.userProperties) : undefined,
    }));
}
