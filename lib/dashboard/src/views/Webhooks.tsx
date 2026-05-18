import { useEffect, useState } from 'react';
import { Link, Lock, Shield, Clock, Search, AlertCircle, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface Webhook {
    name: string;
    session_id: string;
    created_at: string;
}

const caps = ['HMAC Verification', 'Endpoint Management', 'Replay Detection', 'Auto Quarantine', 'Pattern Analysis'];
const features = [
    { icon: '🛡️', title: 'HMAC Signature Verification', desc: 'Validate request authenticity with cryptographic signatures' },
    { icon: '🔄', title: 'Replay Attack Detection', desc: 'Prevent duplicate event processing with timestamp validation' },
    { icon: '🚫', title: 'Auto Quarantine', desc: 'Isolate suspicious requests pending manual review' },
    { icon: '📊', title: 'Pattern Analysis', desc: 'Detect anomalous webhook call patterns and alert on violations' },
];

function fmtDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Webhooks() {
    const [hooks, setHooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await api('/api/webhooks');
                setHooks(res.data || []);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to fetch webhooks');
            } finally { setLoading(false); }
        };
        fetch();
        const i = setInterval(fetch, 15000);
        return () => clearInterval(i);
    }, []);

    const copy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(text);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    const filtered = hooks.filter(w =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.session_id.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-8 space-y-6">
            {/* Agent Identity */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">🔗</div>
                <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Webhook Security</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent rounded-full">Sub-Agent</span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">
                        Validates, secures, monitors, and analyzes inbound webhook events with HMAC signature verification and replay protection.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {caps.map((cap, i) => (
                            <span key={cap} className={cn('px-2 py-0.5 text-[10px] rounded font-medium border',
                                i < 2 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-surface2 text-muted border-border'
                            )}>{cap}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Webhooks', value: hooks.length, icon: Link, color: 'text-accent' },
                    { label: 'Secured', value: hooks.length, icon: Lock, color: 'text-green-400' },
                    { label: 'Active', value: hooks.length, icon: Shield, color: 'text-blue-400' },
                    { label: 'Last Activity', value: fmtDate(hooks[0]?.created_at ?? null), icon: Clock, color: 'text-yellow-400' },
                ].map(s => (
                    <div key={s.label} className="p-4 rounded-xl bg-surface border border-border flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg bg-surface2', s.color)}><s.icon size={18} /></div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{s.label}</div>
                            <div className="text-base font-bold truncate">{s.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {features.map(f => (
                    <div key={f.title} className="p-4 rounded-xl bg-surface/40 border border-border hover:border-accent/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-lg">{f.icon}</span>
                            <span className="text-[9px] font-bold uppercase text-accent bg-accent/10 px-1.5 py-0.5 rounded">Planned</span>
                        </div>
                        <h3 className="text-xs font-bold mb-1">{f.title}</h3>
                        <p className="text-[11px] text-muted leading-tight">{f.desc}</p>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🔗</span>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Registered Webhooks</h2>
                        <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{filtered.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/5 px-2 py-1 rounded-full border border-green-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                    </div>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
                    <input type="text" placeholder="Search webhooks…"
                        className="w-full max-w-sm pl-8 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface2/50 text-[11px] uppercase tracking-wider text-muted">
                                {['Name', 'Session', 'Endpoint URL', 'Actions', 'Created'].map(h => (
                                    <th key={h} className="px-4 py-3 font-bold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && hooks.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />Loading…
                                    </div>
                                </td></tr>
                            ) : error ? (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-red-400">
                                    <div className="flex flex-col items-center gap-2"><AlertCircle size={22} />{error}</div>
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted">No webhooks registered</td></tr>
                            ) : filtered.map(w => {
                                const url = `${window.location.origin}/webhook/${w.session_id}/${encodeURIComponent(w.name)}`;
                                return (
                                    <tr key={w.name + w.session_id} className="hover:bg-surface2/30 transition-colors group">
                                        <td className="px-4 py-3 font-semibold group-hover:text-accent transition-colors">{w.name}</td>
                                        <td className="px-4 py-3"><code className="text-xs font-mono text-muted">{w.session_id}</code></td>
                                        <td className="px-4 py-3 max-w-[200px]">
                                            <code className="text-xs font-mono text-muted truncate block">{url}</code>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => copy(url)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface2 hover:bg-accent hover:text-white border border-border hover:border-accent rounded-lg text-xs font-medium transition-all">
                                                {copied === url ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy URL</>}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted">{fmtDate(w.created_at)}</td>
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
