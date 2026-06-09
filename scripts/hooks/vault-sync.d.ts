export interface VaultSyncOptions {
    workspaceRoot: string;
    vaultRoot: string;
    now?: string;
}

export interface VaultSyncResult {
    success: boolean;
    archiveCreated: boolean;
    dailyUpdated: boolean;
    contextUpdated: boolean;
    error?: string;
}

export function syncLatestSessionToVault(options: VaultSyncOptions): VaultSyncResult;
