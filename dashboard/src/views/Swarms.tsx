import { useEffect, useState } from 'react';
import { Users, AlertCircle, Network } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface Swarm {
    id: number | string;
    parent_session_id: string;
    child_session_id: string;
    role: string;
    status: string;
    created_at: string;
}

function fmtDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Swarms() {
    const [swarms, setSwarms] = useState<Swarm[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await api('/api/swarms');
                setSwarms(res.data || []);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to fetch swarms');
            } finally { setLoading(false); }
        };
        fetch();
        const i = setInterval(fetch, 10000);
        return () => clearInterval(i);
    }, []);

    const statusColor = (s: string) => {
        if (s === 'active' || s === 'running') return 'bg-green-500/10 text-green-400 border-green-500/20';
        if (s === 'completed' || s === 'done') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        return 'bg-surface2 text-muted border-border';
    };

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">🐝</div>
                <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Agent Swarms</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent rounded-full">Sub-Agent</span>
                    </div>
                    <p className="text-sm text-muted">Coordinated multi-agent networks working in parallel on complex tasks with parent-child session hierarchies.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {['Multi-Agent', 'Parallel Execution', 'Role Assignment', 'Result Aggregation'].map((cap, i) => (
                            <span key={cap} className={cn('px-2 py-0.5 text-[10px] rounded font-medium border',
                                i < 2 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-surface2 text-muted border-border'
                            )}>{cap}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { label: 'Total Swarms', value: swarms.length, icon: Network, color: 'text-accent' },
                    { label: 'Active', value: swarms.filter(s => s.status === 'active' || s.status === 'running').length, icon: Users, color: 'text-green-400' },
                    { label: 'Completed', value: swarms.filter(s => s.status === 'completed' || s.status === 'done').length, icon: Users, color: 'text-blue-400' },
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

            {/* Table */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🐝</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Active Swarms</h2>
                    <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{swarms.length}</span>
                </div>

                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface2/50 text-[11px] uppercase tracking-wider text-muted">
                                {['ID', 'Parent Session', 'Child Session', 'Role', 'Status', 'Created'].map(h => (
                                    <th key={h} className="px-4 py-3 font-bold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && swarms.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />Loading…
                                    </div>
                                </td></tr>
                            ) : error ? (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-red-400">
                                    <div className="flex flex-col items-center gap-2"><AlertCircle size={22} />{error}</div>
                                </td></tr>
                            ) : swarms.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">
                                    <div className="flex flex-col items-center gap-2 opacity-40">
                                        <span className="text-3xl">🐝</span>No swarms active
                                    </div>
                                </td></tr>
                            ) : swarms.map(s => (
                                <tr key={s.id} className="hover:bg-surface2/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <code className="text-[11px] font-mono text-muted">{String(s.id).substring(0, 8)}…</code>
                                    </td>
                                    <td className="px-4 py-3"><code className="text-xs font-mono text-accent">{s.parent_session_id}</code></td>
                                    <td className="px-4 py-3"><code className="text-xs font-mono text-muted">{s.child_session_id}</code></td>
                                    <td className="px-4 py-3 text-xs font-medium">{s.role}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border', statusColor(s.status))}>
                                            {s.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted">{fmtDate(s.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
