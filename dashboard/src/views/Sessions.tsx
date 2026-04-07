import { useEffect, useState } from 'react';
import { Users, MessageSquare, CheckCircle, XCircle, AlertCircle, Search } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface Session {
    id?: string;
    session_id?: string;
    message_count: number;
    allow_messages: boolean;
    updated_at: string;
}

function fmtDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Sessions() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await api('/api/sessions');
                setSessions(res.data || []);
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to fetch sessions');
            } finally { setLoading(false); }
        };
        fetch();
        const i = setInterval(fetch, 10000);
        return () => clearInterval(i);
    }, []);

    const filtered = sessions.filter(s => {
        const id = s.id || s.session_id || '';
        return id.toLowerCase().includes(search.toLowerCase());
    });

    const active = sessions.filter(s => s.allow_messages).length;
    const totalMsgs = sessions.reduce((acc, s) => acc + (s.message_count || 0), 0);

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">💬</div>
                <div className="space-y-1 min-w-0">
                    <h1 className="text-xl font-bold">Sessions</h1>
                    <p className="text-sm text-muted">Active and historical agent conversation sessions. Each session maintains its own memory and context.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Sessions', value: sessions.length, icon: Users, color: 'text-accent' },
                    { label: 'Active', value: active, icon: CheckCircle, color: 'text-green-400' },
                    { label: 'Stopped', value: sessions.length - active, icon: XCircle, color: 'text-red-400' },
                    { label: 'Total Messages', value: totalMsgs.toLocaleString(), icon: MessageSquare, color: 'text-blue-400' },
                ].map(s => (
                    <div key={s.label} className="p-4 rounded-xl bg-surface border border-border flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg bg-surface2', s.color)}><s.icon size={18} /></div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{s.label}</div>
                            <div className="text-xl font-bold">{s.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">💬</span>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">All Sessions</h2>
                        <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{filtered.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/5 px-2 py-1 rounded-full border border-green-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                    </div>
                </div>

                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
                    <input type="text" placeholder="Search by session ID…"
                        className="w-full pl-8 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface2/50 text-[11px] uppercase tracking-wider text-muted">
                                {['Session ID', 'Messages', 'Status', 'Last Active'].map(h => (
                                    <th key={h} className="px-4 py-3 font-bold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && sessions.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />Loading…
                                    </div>
                                </td></tr>
                            ) : error ? (
                                <tr><td colSpan={4} className="px-4 py-12 text-center text-red-400">
                                    <div className="flex flex-col items-center gap-2"><AlertCircle size={22} />{error}</div>
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted">No sessions found</td></tr>
                            ) : filtered.map((s, idx) => {
                                const sid = s.id || s.session_id || `session-${idx}`;
                                return (
                                    <tr key={sid} className="hover:bg-surface2/30 transition-colors group">
                                        <td className="px-4 py-3">
                                            <code className="text-xs font-mono text-accent group-hover:text-accent-hover">{sid}</code>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <MessageSquare size={12} className="text-muted" />
                                                <span className="font-semibold">{s.message_count}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border',
                                                s.allow_messages ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                                            )}>{s.allow_messages ? 'Active' : 'Stopped'}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted">{fmtDate(s.updated_at)}</td>
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
