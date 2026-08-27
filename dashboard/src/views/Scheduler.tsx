import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, PauseCircle, Search, AlertCircle } from 'lucide-react';
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

function fmtDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
        setError(err instanceof Error ? err.message : 'Failed to fetch scheduler jobs');
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.session_id.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'enabled' && t.enabled) ||
      (filter === 'disabled' && !t.enabled);
    return matchesSearch && matchesFilter;
  });

  const activeCount = tasks.filter((t) => t.enabled).length;
  const disabledCount = tasks.filter((t) => !t.enabled).length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              JOB_SCHEDULER // CRON_DAEMON
            </div>
            <div className="text-muted text-xs">
              Automated recurring background jobs, exponential backoff retries, and SLA tracking.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">CRON_ENABLED</span>
          <span className="hud-tag">SLA_MONITOR</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">TOTAL_JOBS</div>
            <div className="text-2xl font-bold text-text-bright">{tasks.length}</div>
          </div>
          <Calendar size={16} className="text-accent" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">ACTIVE_SCHEDULES</div>
            <div className="text-2xl font-bold text-success">{activeCount}</div>
          </div>
          <CheckCircle2 size={16} className="text-success" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">DISABLED_SCHEDULES</div>
            <div className="text-2xl font-bold text-muted">{disabledCount}</div>
          </div>
          <PauseCircle size={16} className="text-muted-dark" />
        </div>
      </div>

      {/* Filter and Table Panel */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>CRON TASK REGISTRY</span>
          </div>
          <span className="hud-tag">{filteredTasks.length} FILTERED</span>
        </div>

        {/* Tactical Search / Filter Toolbar */}
        <div className="p-3 border-b border-border bg-surface2 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
            <input
              type="text"
              placeholder="Filter tasks by name or session..."
              className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border text-xs font-mono text-text-bright focus:outline-none focus:border-accent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 font-mono text-xs">
            {(['all', 'enabled', 'disabled'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1 border text-[11px] font-semibold uppercase tracking-wider transition-colors',
                  filter === f
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-muted hover:text-text hover:bg-surface-hover',
                )}
              >
                [{f}]
              </button>
            ))}
          </div>
        </div>

        {/* Task Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">JOB NAME</th>
                <th className="px-4 py-2.5 font-semibold">CRON EXPRESSION</th>
                <th className="px-4 py-2.5 font-semibold">TARGET SESSION</th>
                <th className="px-4 py-2.5 font-semibold">STATE</th>
                <th className="px-4 py-2.5 font-semibold">LAST EXECUTION</th>
                <th className="px-4 py-2.5 font-semibold">NEXT RUN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    SYNCHRONIZING SCHEDULER MATRIX...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-danger">
                    <div className="flex items-center justify-center gap-2">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-dark">
                    NO TASKS MATCH SEARCH CRITERIA
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t) => (
                  <tr key={t.name} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-text-bright font-sans text-xs">
                        {t.name}
                      </div>
                      <div className="text-[10px] text-muted-dark font-mono mt-0.5">
                        CREATED: {fmtDate(t.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="px-1.5 py-0.5 border border-border bg-surface text-accent font-mono text-[11px]">
                        {t.cron_expression}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {t.session_id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-wider',
                          t.enabled
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-border bg-surface2 text-muted',
                        )}
                      >
                        {t.enabled ? '[ENABLED]' : '[DISABLED]'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-dark text-[11px]">
                      {fmtDate(t.last_run)}
                    </td>
                    <td className="px-4 py-3 text-accent font-semibold text-[11px]">
                      {fmtDate(t.next_run)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
