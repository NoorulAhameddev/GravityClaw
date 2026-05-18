import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Zap, Clock, DollarSign, Hash, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface AnalyticsData {
    requests: { total: number; byHour: number[]; byDay: number[] };
    tokens: { total: number; byModel: Record<string, number> };
    cost: { total: number; byModel: Record<string, number> };
    latency: { avg: number; p50: number; p95: number; p99: number };
    errors: { total: number; byType: Record<string, number> };
    sessions: { active: number; total: number; avgDuration: number };
}

export default function Analytics() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                setLoading(true);
                const res = await api(`/api/analytics?period=${period}`);
                setData(res);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to load analytics');
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, [period]);

    const metrics = [
        { label: 'Total Requests', value: data?.requests.total ?? 0, icon: Zap, color: 'text-blue-400', trend: '+12%' },
        { label: 'Total Tokens', value: data?.tokens.total ?? 0, icon: Hash, color: 'text-purple-400', trend: '+8%' },
        { label: 'Total Cost', value: `$${((data?.cost.total ?? 0)).toFixed(2)}`, icon: DollarSign, color: 'text-green-400', trend: '-3%' },
        { label: 'Avg Latency', value: `${Math.round(data?.latency.avg ?? 0)}ms`, icon: Clock, color: 'text-yellow-400', trend: '-5%' },
    ];

    const modelBreakdown = Object.entries(data?.tokens.byModel ?? {}).sort(([, a], [, b]) => b - a);

    if (loading && !data) {
        return (
            <div className="p-8 flex items-center justify-center h-64 text-muted">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Loading analytics…
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 space-y-6">
                <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <BarChart3 size={20} className="text-accent" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-xl font-bold">Analytics</h1>
                        <p className="text-sm text-muted">Comprehensive usage analytics, performance metrics, and trend analysis.</p>
                    </div>
                </div>
                <div className="flex flex-col items-center justify-center py-16 text-red-400 gap-2">
                    <AlertCircle size={24} /> {error}
                    <button onClick={() => setPeriod(period)} className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <BarChart3 size={20} className="text-accent" />
                </div>
                <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold">Analytics</h1>
                            <p className="text-sm text-muted">Comprehensive usage analytics, performance metrics, and trend analysis.</p>
                        </div>
                        <div className="flex gap-2">
                            {(['24h', '7d', '30d'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                                        period === p ? 'bg-accent text-white' : 'bg-surface2 text-muted hover:text-text'
                                    )}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map(m => (
                    <div key={m.label} className="p-5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className={cn('p-2 rounded-lg bg-surface2', m.color)}>
                                <m.icon size={18} />
                            </div>
                            <div className={cn('flex items-center gap-1 text-xs font-medium', m.trend.startsWith('+') ? 'text-green-400' : 'text-red-400')}>
                                {m.trend.startsWith('+') ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {m.trend}
                            </div>
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{m.label}</div>
                        <div className="text-2xl font-bold mt-1">{typeof m.value === 'number' ? m.value.toLocaleString() : m.value}</div>
                    </div>
                ))}
            </div>

            {/* Latency Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-surface border border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-4">Latency Distribution</h3>
                    <div className="space-y-3">
                        {[
                            { label: 'Average', value: data?.latency.avg ?? 0, color: 'bg-blue-500' },
                            { label: 'P50', value: data?.latency.p50 ?? 0, color: 'bg-green-500' },
                            { label: 'P95', value: data?.latency.p95 ?? 0, color: 'bg-yellow-500' },
                            { label: 'P99', value: data?.latency.p99 ?? 0, color: 'bg-red-500' },
                        ].map(m => {
                            const max = Math.max(data?.latency.p99 ?? 100, 1);
                            const pct = (m.value / max) * 100;
                            return (
                                <div key={m.label}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-muted">{m.label}</span>
                                        <span className="font-semibold">{Math.round(m.value)}ms</span>
                                    </div>
                                    <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                                        <div className={cn('h-full rounded-full transition-all', m.color)} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-5 rounded-xl bg-surface border border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-4">Session Stats</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 rounded-lg bg-surface2">
                            <div className="text-2xl font-bold text-accent">{data?.sessions.active ?? 0}</div>
                            <div className="text-[10px] text-muted uppercase">Active</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-surface2">
                            <div className="text-2xl font-bold text-green-400">{data?.sessions.total ?? 0}</div>
                            <div className="text-[10px] text-muted uppercase">Total</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-surface2">
                            <div className="text-2xl font-bold text-blue-400">{Math.round(data?.sessions.avgDuration ?? 0)}m</div>
                            <div className="text-[10px] text-muted uppercase">Avg Duration</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Model Breakdown */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Model Usage Breakdown</h2>
                </div>
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface2/50 text-[11px] uppercase tracking-wider text-muted">
                                {['Model', 'Tokens', 'Cost', 'Share'].map(h => (
                                    <th key={h} className={cn('px-4 py-3 font-bold', h !== 'Model' && 'text-right')}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {modelBreakdown.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No model data yet</td></tr>
                            ) : modelBreakdown.map(([model, tokens]) => {
                                const cost = data?.cost.byModel[model] ?? 0;
                                const share = ((tokens / (data?.tokens.total ?? 1)) * 100).toFixed(1);
                                return (
                                    <tr key={model} className="hover:bg-surface2/30 transition-colors">
                                        <td className="px-4 py-3"><code className="text-xs font-mono text-accent">{model}</code></td>
                                        <td className="px-4 py-3 text-right font-semibold">{tokens.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-green-400">${cost.toFixed(4)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-1.5 bg-surface2 rounded-full overflow-hidden">
                                                    <div className="h-full bg-accent rounded-full" style={{ width: `${share}%` }} />
                                                </div>
                                                <span className="text-xs text-muted w-10 text-right">{share}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
