export interface AgentSyncOptions {
    vaultRoot: string;
    openCode?: { dbPath: string };
    claude?: { projectsRoot: string };
    codex?: { root: string };
    now?: string;
}

export interface AgentSyncResult {
    success: boolean;
    importedCount: number;
    latestEvent?: { source: string; timestamp?: string };
    error?: string;
}

export function syncAgentSourcesToVault(options: AgentSyncOptions): AgentSyncResult;
