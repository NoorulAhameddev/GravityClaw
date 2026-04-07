import { useEffect, useState } from 'react';
import { Heart, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface Heartbeat {
    session_id: string;
    interval_minutes: number;
    prompt: string;
    enabled: boolean;
    last_run: string | null;
    created_at: string;
}

function fmtDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Heartbeats() {
    const [beats, setBeats] = useState<Heartbeat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await api('/api/heartbeats');
                setBeats(res.data || []);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to fetch heartbeats');
            } finally { setLoading(false); }
        };
        fetch();
        const i = setInterval(fetch, 10000);
        return () => clearInterval(i);
    }, []);

    const active = beats.filter(b => b.enabled).length;

    return (
        <div className="p-8 space-y-6">
            {/* Agent Identity */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">💓</div>
                <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Heartbeats</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400 rounded-full">Active</span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">
                        Periodic keep-alive checks that fire prompts to sessions at defined intervals, ensuring agents remain responsive and healthy.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {['Interval Pings', 'Session Health', 'Auto-Recovery', 'Alert on Miss'].map((cap, i) => (
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
                    { label: 'Total', value: beats.length, icon: Heart, color: 'text-pink-400' },
                    { label: 'Active', value: active, icon: CheckCircle, color: 'text-green-400' },
                    { label: 'Disabled', value: beats.length - active, icon: XCircle, color: 'text-muted' },
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

            {/* Cards Grid */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">💓</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Heartbeat Jobs</h2>
                    <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{beats.length}</span>
                </div>

                {loading && beats.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-muted">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />Loading…
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-red-400">
                        <AlertCircle size={24} />{error}
                    </div>
                ) : beats.length === 0 ? (
                    <div className="py-16 text-center text-muted">
                        <Heart size={32} className="mx-auto mb-2 opacity-30" />
                        <div>No heartbeat jobs configured</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {beats.map((b, idx) => (
                            <div key={idx} className={cn(
                                "p-5 rounded-xl border bg-surface hover:border-accent/40 transition-all group",
                                b.enabled ? "border-green-500/20" : "border-border"
                            )}>
                                <div className="flex items-start justify-between mb-3">
                                    <code className="text-xs font-mono text-accent truncate mr-2">{b.session_id}</code>
                                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border flex-shrink-0",
                                        b.enabled ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-surface2 text-muted border-border"
                                    )}>{b.enabled ? 'Active' : 'Off'}</span>
                                </div>
                                <div className="text-xs text-muted mb-3 line-clamp-2 leading-relaxed">{b.prompt}</div>
                                <div className="flex items-center justify-between text-[11px] text-muted border-t border-border pt-3">
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={11} />
                                        <span>Every {b.interval_minutes}m</span>
                                    </div>
                                    <div>Last: {fmtDate(b.last_run)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
