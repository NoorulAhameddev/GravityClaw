import { useEffect, useState } from 'react';
import { GitBranch, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface Workflow {
    goal: string;
    session_id: string;
    status: 'running' | 'completed' | 'failed' | 'pending' | string;
    progress: number;
    created_at: string;
    completed_at: string | null;
}

function fmtDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Workflows() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await api('/api/workflows');
                setWorkflows(res.data || []);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to fetch workflows');
            } finally { setLoading(false); }
        };
        fetch();
        const i = setInterval(fetch, 10000);
        return () => clearInterval(i);
    }, []);

    const running = workflows.filter(w => w.status === 'running').length;
    const completed = workflows.filter(w => w.status === 'completed').length;
    const failed = workflows.filter(w => w.status === 'failed').length;

    const statusConfig = (s: string) => {
        if (s === 'completed') return { cls: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle };
        if (s === 'running') return { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Clock };
        if (s === 'failed') return { cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle };
        return { cls: 'bg-surface2 text-muted border-border', icon: Clock };
    };

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <GitBranch size={20} className="text-accent" />
                </div>
                <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Workflows</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent rounded-full">Sub-Agent</span>
                    </div>
                    <p className="text-sm text-muted">Multi-step goal-oriented workflows executed by specialized sub-agents with progress tracking and result aggregation.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total', value: workflows.length, icon: GitBranch, color: 'text-accent' },
                    { label: 'Running', value: running, icon: Clock, color: 'text-blue-400' },
                    { label: 'Completed', value: completed, icon: CheckCircle, color: 'text-green-400' },
                    { label: 'Failed', value: failed, icon: XCircle, color: 'text-red-400' },
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

            {/* Cards */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🔀</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">All Workflows</h2>
                    <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{workflows.length}</span>
                </div>

                {loading && workflows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-muted">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />Loading…
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-red-400"><AlertCircle size={24} />{error}</div>
                ) : workflows.length === 0 ? (
                    <div className="py-16 text-center text-muted">
                        <GitBranch size={32} className="mx-auto mb-2 opacity-30" />
                        <div>No workflows yet</div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {workflows.map((w, idx) => {
                            const pct = Math.round((w.progress || 0) * 100);
                            const { cls, icon: StatusIcon } = statusConfig(w.status);
                            return (
                                <div key={idx} className="p-5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-all">
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold truncate mb-1" title={w.goal}>{w.goal}</div>
                                            <code className="text-xs font-mono text-muted">{w.session_id}</code>
                                        </div>
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1 flex-shrink-0', cls)}>
                                            <StatusIcon size={10} />{w.status}
                                        </span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[11px] text-muted">
                                            <span>Progress</span>
                                            <span className="font-mono">{pct}%</span>
                                        </div>
                                        <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-accent to-accent/60 rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-3 text-[10px] text-muted">
                                        <div>Started: {fmtDate(w.created_at)}</div>
                                        {w.completed_at && <div>Completed: {fmtDate(w.completed_at)}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
