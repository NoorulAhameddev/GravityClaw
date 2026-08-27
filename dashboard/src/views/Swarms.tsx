import { useEffect, useState } from 'react';
import { Network, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
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
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
        setError(e instanceof Error ? e.message : 'Failed to fetch swarm nodes');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const i = setInterval(fetch, 10000);
    return () => clearInterval(i);
  }, []);

  const activeCount = swarms.filter((s) => s.status === 'active' || s.status === 'running').length;
  const completedCount = swarms.filter((s) => s.status === 'completed' || s.status === 'done').length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              SWARM_TOPOLOGY // MULTI-AGENT_HIERARCHY
            </div>
            <div className="text-muted text-xs">
              Coordinated agent networks, task delegation DAGs, and parent-child session handoffs.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">PARALLEL_EXECUTION</span>
          <span className="hud-tag">L2_SWARM_ROUTER</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">TOTAL_SWARMS</div>
            <div className="text-2xl font-bold text-text-bright">{swarms.length}</div>
          </div>
          <Network size={16} className="text-accent" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">ACTIVE_NODES</div>
            <div className="text-2xl font-bold text-success">{activeCount}</div>
          </div>
          <RefreshCw size={16} className={activeCount > 0 ? "text-success animate-spin" : "text-muted-dark"} />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">COMPLETED_RUNS</div>
            <div className="text-2xl font-bold text-info">{completedCount}</div>
          </div>
          <CheckCircle2 size={16} className="text-info" />
        </div>
      </div>

      {/* Swarm Matrix Table */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>SWARM PROCESS REGISTRY</span>
          </div>
          <span className="hud-tag">{swarms.length} REGISTERED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">SWARM ID</th>
                <th className="px-4 py-2.5 font-semibold">PARENT SESSION</th>
                <th className="px-4 py-2.5 font-semibold">CHILD SESSION</th>
                <th className="px-4 py-2.5 font-semibold">ROLE</th>
                <th className="px-4 py-2.5 font-semibold">STATUS</th>
                <th className="px-4 py-2.5 font-semibold">CREATED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && swarms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    SYNCHRONIZING SWARM DAG...
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
              ) : swarms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-dark">
                    NO ACTIVE SWARMS REGISTERED
                  </td>
                </tr>
              ) : (
                swarms.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-bold text-text-bright">
                      {String(s.id).substring(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-accent font-semibold">
                      {s.parent_session_id}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {s.child_session_id}
                    </td>
                    <td className="px-4 py-3 font-sans text-xs text-text font-medium">
                      {s.role}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-wider',
                          s.status === 'active' || s.status === 'running'
                            ? 'border-success/40 bg-success/10 text-success'
                            : s.status === 'completed' || s.status === 'done'
                              ? 'border-info/40 bg-info/10 text-info'
                              : 'border-border bg-surface2 text-muted',
                        )}
                      >
                        [{s.status.toUpperCase()}]
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-dark text-[11px]">
                      {fmtDate(s.created_at)}
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
