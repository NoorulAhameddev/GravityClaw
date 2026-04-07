import { useEffect, useState } from 'react';
import { Clock, CheckCircle, PauseCircle, Layout, Search, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface Task {
    name: string;
    cron_expression: string;
    session_id: string;
    enabled: boolean;
    last_run: string | null;
    next_run: string | null;
    created_at: string;
}

const caps = ['Cron Scheduling', 'Task Management', 'Smart Retries', 'SLA Tracking', 'Dead-Letter Queue'];
const features = [
    { icon: '🔄', title: 'Smart Retry Policies', desc: 'Exponential backoff and intelligent retry strategies with configurable limits' },
    { icon: '🔍', title: 'Failure Auto-Diagnosis', desc: 'Automatically diagnose, categorize, and report task failures' },
    { icon: '💀', title: 'Dead-Letter Recovery', desc: 'Recover and replay failed tasks from dead-letter queue' },
    { icon: '📊', title: 'SLA Tracking', desc: 'Monitor execution times against SLA targets and alert on violations' },
];

function fmtDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Scheduler() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                setLoading(true);
                const response = await api('/api/scheduler/tasks');
                setTasks(response.data || []);
                setError(null);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
            } finally {
                setLoading(false);
            }
        };
        fetchTasks();
        const interval = setInterval(fetchTasks, 10000);
        return () => clearInterval(interval);
    }, []);

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.session_id.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = filter === 'all' || (filter === 'enabled' && t.enabled) || (filter === 'disabled' && !t.enabled);
        return matchesSearch && matchesFilter;
    });

    const stats = {
        total: tasks.length,
        active: tasks.filter(t => t.enabled).length,
        disabled: tasks.filter(t => !t.enabled).length,
        next: tasks.filter(t => t.enabled && t.next_run).sort((a, b) =>
            new Date(a.next_run!).getTime() - new Date(b.next_run!).getTime()
        )[0]?.next_run || null,
    };

    return (
        <div className="p-8 space-y-6">
            {/* Agent Identity */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">⏰</div>
                <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Task Scheduler</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent rounded-full">Sub-Agent</span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">
                        Manages recurring jobs, cron schedules, retries with exponential backoff, failure recovery, and execution guarantees.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {caps.map((cap, i) => (
                            <span key={cap} className={cn(
                                'px-2 py-0.5 text-[10px] rounded font-medium border',
                                i < 2 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-surface2 text-muted border-border'
                            )}>{cap}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Active Tasks', value: stats.active, icon: CheckCircle, color: 'text-green-400' },
                    { label: 'Disabled', value: stats.disabled, icon: PauseCircle, color: 'text-yellow-400' },
                    { label: 'Next Run', value: fmtDate(stats.next), icon: Clock, color: 'text-accent' },
                    { label: 'Total Tasks', value: stats.total, icon: Layout, color: 'text-blue-400' },
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
                        <span className="text-lg">📋</span>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Scheduled Tasks</h2>
                        <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{filteredTasks.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/5 px-2 py-1 rounded-full border border-green-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
                        <input type="text" placeholder="Search tasks…"
                            className="w-full pl-8 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'enabled', 'disabled'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)}
                                className={cn(
                                    'px-3 py-2 rounded-lg text-xs font-medium border transition-colors capitalize',
                                    filter === f
                                        ? f === 'enabled' ? 'bg-green-500 border-green-500 text-white'
                                            : f === 'disabled' ? 'bg-yellow-500 border-yellow-500 text-white'
                                                : 'bg-accent border-accent text-white'
                                        : 'bg-surface border-border text-muted hover:text-text'
                                )}>{f}</button>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface2/50 text-[11px] uppercase tracking-wider text-muted">
                                {['Name', 'Cron', 'Session', 'Status', 'Last Run', 'Next Run'].map(h => (
                                    <th key={h} className="px-4 py-3 font-bold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && tasks.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                        Loading tasks…
                                    </div>
                                </td></tr>
                            ) : error ? (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-red-400">
                                    <div className="flex flex-col items-center gap-2"><AlertCircle size={22} />{error}</div>
                                </td></tr>
                            ) : filteredTasks.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">No tasks found</td></tr>
                            ) : filteredTasks.map(t => (
                                <tr key={t.name} className="hover:bg-surface2/30 transition-colors group">
                                    <td className="px-4 py-3">
                                        <div className="font-semibold group-hover:text-accent transition-colors">{t.name}</div>
                                        <div className="text-[10px] text-muted">{fmtDate(t.created_at)}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <code className="px-2 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{t.cron_expression}</code>
                                    </td>
                                    <td className="px-4 py-3"><code className="text-xs font-mono text-muted">{t.session_id}</code></td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border',
                                            t.enabled ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-surface2 text-muted border-border'
                                        )}>{t.enabled ? 'Enabled' : 'Disabled'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted">{fmtDate(t.last_run)}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-accent">{fmtDate(t.next_run)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
