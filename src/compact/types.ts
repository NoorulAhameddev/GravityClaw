export interface CompactionConfig {
    contextThreshold: number;
    keepRecentExchanges: number;
    autoprune: boolean;
    minMessageCount: number;
    maxOutputTokens: number;
}



export interface CompactionResult {
    summaryMessages: Array<{
        role: string;
        content: string;
    }>;
    preCompactTokenCount: number;
    postCompactTokenCount: number;
    compactor: string;
}

export interface CompactSummary {
    timestamp: string;
    messageCount: number;
    tokenCount: number;
    summary: string;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
    contextThreshold: 80,
    keepRecentExchanges: 5,
    autoprune: true,
    minMessageCount: 20,
    maxOutputTokens: 20000,
};