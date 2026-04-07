import { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, AlertCircle, Wrench, Users } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { cn } from '../lib/utils';

interface Group {
    platform: string;
    groupId: string;
    enabledToolCount: number;
    disabledToolCount: number;
}

interface ToolResponse {
    type: string;
    error?: string;
    result?: string;
}

export default function Admin() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isInitialLoad = useRef(true);

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const { sendMessage, messages } = useWebSocket(wsUrl);

    const loadGroups = useCallback(() => {
        setLoading(true);
        setError(null);
        sendMessage({
            type: 'tool_call',
            id: `admin-${Date.now()}`,
            tool: 'listGroupsForUser',
            args: {}
        } as unknown as Parameters<typeof sendMessage>[0]);
    }, [sendMessage]);

    useEffect(() => {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadGroups();
        }
    }, [loadGroups]);

    useEffect(() => {
        const latestMsg = messages[messages.length - 1];
        if (!latestMsg || latestMsg.type !== 'tool_response') return;
        
        const response = latestMsg as unknown as ToolResponse;
        
        if (response.error) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setError(response.error);
            setLoading(false);
            return;
        }
        
        try {
            const result = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
            if (result?.success && result?.data?.groups) {
                setGroups(result.data.groups);
                setError(null);
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, [messages]);

    const platformIcon = (p: string) => {
        if (p?.toLowerCase().includes('telegram')) return '📱';
        if (p?.toLowerCase().includes('whatsapp')) return '💬';
        if (p?.toLowerCase().includes('discord')) return '🎮';
        return '🔌';
    };

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck size={20} className="text-red-400" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold">Admin Panel</h1>
                            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 rounded-full">Restricted</span>
                        </div>
                        <button onClick={loadGroups} disabled={loading}
                            className="px-4 py-2 bg-surface2 hover:bg-border border border-border rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                            {loading ? 'Loading…' : '↺ Refresh'}
                        </button>
                    </div>
                    <p className="text-sm text-muted">Manage platform group permissions, tool access controls, and agent authorization policies.</p>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { label: 'Groups', value: groups.length, icon: Users, color: 'text-accent' },
                    { label: 'Total Enabled Tools', value: groups.reduce((a, g) => a + g.enabledToolCount, 0), icon: Wrench, color: 'text-green-400' },
                    { label: 'Total Disabled', value: groups.reduce((a, g) => a + g.disabledToolCount, 0), icon: Wrench, color: 'text-red-400' },
                ].map(s => (
                    <div key={s.label} className="p-4 rounded-xl bg-surface border border-border flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg bg-surface2', s.color)}><s.icon size={18} /></div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{s.label}</div>
                            <div className="text-2xl font-bold">{s.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🔐</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Platform Groups</h2>
                    <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{groups.length}</span>
                </div>

                {loading && groups.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-muted">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />Loading…
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-red-400">
                        <AlertCircle size={24} />
                        <div className="text-center">{error}</div>
                        <p className="text-xs text-muted">This panel requires an active WebSocket connection and tool access.</p>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="py-16 text-center text-muted">
                        <ShieldCheck size={32} className="mx-auto mb-2 opacity-30" />
                        <div>No groups found</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {groups.map((g, idx) => (
                            <div key={idx} className="p-5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-all">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-2xl">{platformIcon(g.platform)}</span>
                                    <div className="min-w-0">
                                        <div className="font-bold capitalize">{g.platform}</div>
                                        <code className="text-[10px] font-mono text-muted truncate block">{g.groupId}</code>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/10 text-center">
                                        <div className="text-xl font-bold text-green-400">{g.enabledToolCount}</div>
                                        <div className="text-[10px] text-green-400/70 font-medium">Enabled</div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                                        <div className="text-xl font-bold text-red-400">{g.disabledToolCount}</div>
                                        <div className="text-[10px] text-red-400/70 font-medium">Disabled</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
