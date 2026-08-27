import { useEffect, useState } from 'react';
import { GitBranch, AlertCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
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
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
        setError(e instanceof Error ? e.message : 'Failed to fetch active workflows');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const i = setInterval(fetch, 10000);
    return () => clearInterval(i);
  }, []);

  const running = workflows.filter((w) => w.status === 'running').length;
  const completed = workflows.filter((w) => w.status === 'completed').length;
  const failed = workflows.filter((w) => w.status === 'failed').length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              WORKFLOW_PIPELINE // EXECUTION_DAG
            </div>
            <div className="text-muted text-xs">
              Multi-step autonomous agent goal execution with step progress tracking and result aggregation.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">DAG_ENGINE</span>
          <span className="hud-tag">STATE_PERSISTENCE</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">TOTAL_WORKFLOWS</div>
            <div className="text-2xl font-bold text-text-bright">{workflows.length}</div>
          </div>
          <GitBranch size={16} className="text-accent" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">RUNNING_PIPELINES</div>
            <div className="text-2xl font-bold text-info">{running}</div>
          </div>
          <RefreshCw size={16} className={running > 0 ? "text-info animate-spin" : "text-muted-dark"} />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">COMPLETED_SUCCESS</div>
            <div className="text-2xl font-bold text-success">{completed}</div>
          </div>
          <CheckCircle2 size={16} className="text-success" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">FAILED_EXECUTIONS</div>
            <div className="text-2xl font-bold text-danger">{failed}</div>
          </div>
          <XCircle size={16} className="text-danger" />
        </div>
      </div>

      {/* Workflow Table Panel */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>PIPELINE EXECUTION QUEUE</span>
          </div>
          <span className="hud-tag">{workflows.length} PIPELINES</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">TARGET GOAL</th>
                <th className="px-4 py-2.5 font-semibold">TARGET SESSION</th>
                <th className="px-4 py-2.5 font-semibold">PROGRESS</th>
                <th className="px-4 py-2.5 font-semibold">STATUS</th>
                <th className="px-4 py-2.5 font-semibold">DISPATCHED</th>
                <th className="px-4 py-2.5 font-semibold">COMPLETED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && workflows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    SYNCHRONIZING PIPELINE STATE...
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
              ) : workflows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-dark">
                    NO WORKFLOW PIPELINES IN QUEUE
                  </td>
                </tr>
              ) : (
                workflows.map((w, i) => (
                  <tr key={i} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-sans text-xs text-text-bright font-medium max-w-sm">
                      {w.goal}
                    </td>
                    <td className="px-4 py-3 text-accent font-semibold">
                      {w.session_id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-surface border border-border h-2 relative">
                          <div
                            className="bg-accent h-full"
                            style={{ width: `${Math.min(100, Math.max(0, w.progress || 0))}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted">{w.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-wider',
                          w.status === 'completed'
                            ? 'border-success/40 bg-success/10 text-success'
                            : w.status === 'running'
                              ? 'border-info/40 bg-info/10 text-info'
                              : w.status === 'failed'
                                ? 'border-danger/40 bg-danger/10 text-danger'
                                : 'border-border bg-surface2 text-muted',
                        )}
                      >
                        [{w.status.toUpperCase()}]
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-dark text-[11px]">
                      {fmtDate(w.created_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-dark text-[11px]">
                      {fmtDate(w.completed_at)}
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
