/**
 * Telemetry Module
 * 
 * OpenTelemetry integration for Gravity Claw with:
 * - Distributed tracing across API → Agent → Tools → Workers → LLM → DB
 * - Metrics collection (request count, error rate, latency)
 * - SigNoz-compatible OTLP exporters
 * - Structured logging with trace context
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { createLogger } from "../../logger.js";

const log = createLogger("telemetry");

let sdk: NodeSDK | null = null;
let isInitialized = false;
let isEnabled = false;

export interface TelemetryConfig {
    serviceName?: string;
    serviceVersion?: string;
    otlpEndpoint?: string;
    enabled?: boolean;
}

export async function initializeTelemetry(config?: TelemetryConfig): Promise<void> {
    if (isInitialized) {
        log.warn("Telemetry already initialized");
        return;
    }

    const enabled = config?.enabled ?? false;
    const otlpEndpoint = config?.otlpEndpoint ?? "";

    if (!enabled) {
        log.info("Telemetry disabled");
        isEnabled = false;
        return;
    }

    isEnabled = true;

    const serviceName = config?.serviceName ?? "gravyclaw";
    const serviceVersion = config?.serviceVersion ?? "0.1.0";

    const resource = new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: serviceVersion,
    });

    let traceExporter;

    if (otlpEndpoint) {
        log.info(`Initializing OpenTelemetry (endpoint: ${otlpEndpoint})`);
        traceExporter = new OTLPTraceExporter({
            url: `${otlpEndpoint}/v1/traces`,
        });
    } else {
        log.info("Initializing OpenTelemetry with Console exporter (local fallback)");
        const { ConsoleSpanExporter } = await import("@opentelemetry/sdk-trace-node");
        traceExporter = new ConsoleSpanExporter();
    }

    // Import samplers
    const { ParentBasedSampler, TraceIdRatioBasedSampler } = await import("@opentelemetry/sdk-trace-node");
    
    const sampler = new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(0.1), // 10% sampling for root spans
    });

    sdk = new NodeSDK({
        resource,
        traceExporter,
        sampler,
        instrumentations: [
            getNodeAutoInstrumentations({
                "@opentelemetry/instrumentation-fs": { enabled: false },
                "@opentelemetry/instrumentation-net": { enabled: false },
            }),
        ],
    });

    try {
        sdk.start();
        isInitialized = true;
        log.info("OpenTelemetry initialized successfully");
    } catch (error) {
        log.error("Failed to start OpenTelemetry", error);
    }
}

export async function shutdownTelemetry(): Promise<void> {
    if (sdk) {
        await sdk.shutdown();
        isInitialized = false;
        log.info("OpenTelemetry shutdown complete");
    }
}

export function isTelemetryEnabled(): boolean {
    return isEnabled;
}