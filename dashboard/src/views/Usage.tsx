import { useEffect, useState } from 'react';
import { Zap, DollarSign, Hash, Clock, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface UsagePeriod {
    requests: number;
    tokens: number;
    cost: number | null;
}

interface UsageData {
    byPeriod: {
        today: UsagePeriod;
        week: UsagePeriod;
        allTime: UsagePeriod;
    };
    models: Record<string, { calls: number; tokens: number; cost: number }>;
    avgLatency?: number;
}

function fmt$(n: number | null | undefined) {
    return `$${(n || 0).toFixed(4)}`;
}

export default function Usage() {
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await api('/api/usage');
                setUsage(res);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to load usage');
            } finally { setLoading(false); }
        };
        fetch();
        const i = setInterval(fetch, 30000);
        return () => clearInterval(i);
    }, []);

    if (loading && !usage) return (
        <div className="p-8 flex items-center justify-center h-64 text-muted">
            <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                Loading usage data…
            </div>
        </div>
    );

    if (error) return (
        <div className="p-8 flex flex-col items-center justify-center h-64 text-red-400 gap-2">
            <AlertCircle size={24} /> {error}
        </div>
    );

    const b = usage?.byPeriod;
    const models = Object.entries(usage?.models || {});

    const periods = [
        { label: 'Today', data: b?.today },
        { label: 'This Week', data: b?.week },
        { label: 'All Time', data: b?.allTime },
    ];

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Zap size={20} className="text-accent" />
                </div>
                <div className="space-y-1">
                    <h1 className="text-xl font-bold">Usage & Analytics</h1>
                    <p className="text-sm text-muted">Token consumption, API costs, and latency metrics across all models and time periods.</p>
                </div>
            </div>

            {/* Period Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {periods.map(({ label, data }) => (
                    <div key={label} className="p-5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-colors relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent to-accent/30" />
                        <div className="pl-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">{label}</div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs text-muted"><Zap size={11} />Requests</div>
                                    <div className="font-bold text-sm">{(data?.requests || 0).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs text-muted"><Hash size={11} />Tokens</div>
                                    <div className="font-bold text-sm">{(data?.tokens || 0).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                                    <div className="flex items-center gap-1.5 text-xs text-muted"><DollarSign size={11} />Cost</div>
                                    <div className="font-bold text-sm text-accent">{fmt$(data?.cost)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Avg Latency */}
            {usage?.avgLatency != null && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-border">
                    <div className="p-2 rounded-lg bg-surface2 text-yellow-400"><Clock size={18} /></div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Average Latency</div>
                        <div className="text-xl font-bold">{Math.round(usage.avgLatency)}ms</div>
                    </div>
                </div>
            )}

            {/* Models Table */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Model Breakdown</h2>
                    <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{models.length}</span>
                </div>

                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface2/50 text-[11px] uppercase tracking-wider text-muted">
                                {['Model', 'Calls', 'Tokens', 'Cost'].map(h => (
                                    <th key={h} className={cn('px-4 py-3 font-bold', h !== 'Model' && 'text-right')}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {models.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No model data yet</td></tr>
                            ) : models.sort(([, a], [, b]) => b.calls - a.calls).map(([model, s]) => (
                                <tr key={model} className="hover:bg-surface2/30 transition-colors">
                                    <td className="px-4 py-3"><code className="text-xs font-mono text-accent">{model}</code></td>
                                    <td className="px-4 py-3 text-right font-semibold">{s.calls.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-muted">{s.tokens.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-green-400">{fmt$(s.cost)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
