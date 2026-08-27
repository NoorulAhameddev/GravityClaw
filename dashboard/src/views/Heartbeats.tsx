import { useEffect, useState } from 'react';
import { Activity, Clock, AlertCircle, CheckCircle2, PauseCircle } from 'lucide-react';
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
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
        setError(e instanceof Error ? e.message : 'Failed to fetch heartbeat monitors');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const i = setInterval(fetch, 10000);
    return () => clearInterval(i);
  }, []);

  const activeCount = beats.filter((b) => b.enabled).length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              HEARTBEAT_MONITOR // LIVENESS_DAEMON
            </div>
            <div className="text-muted text-xs">
              Periodic keep-alive probe pings, session liveliness verification, and automated prompt dispatch.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">PULSE_ACTIVE</span>
          <span className="hud-tag">AUTO_RECOVERY</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">TOTAL_HEARTBEATS</div>
            <div className="text-2xl font-bold text-text-bright">{beats.length}</div>
          </div>
          <Activity size={16} className="text-accent" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">ACTIVE_PULSES</div>
            <div className="text-2xl font-bold text-success">{activeCount}</div>
          </div>
          <CheckCircle2 size={16} className="text-success" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">PAUSED_PULSES</div>
            <div className="text-2xl font-bold text-muted">{beats.length - activeCount}</div>
          </div>
          <PauseCircle size={16} className="text-muted-dark" />
        </div>
      </div>

      {/* Heartbeat Table Panel */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>LIVENESS PROBE REGISTRY</span>
          </div>
          <span className="hud-tag">{beats.length} CONFIGURED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">TARGET SESSION</th>
                <th className="px-4 py-2.5 font-semibold">INTERVAL</th>
                <th className="px-4 py-2.5 font-semibold">DISPATCH PROMPT</th>
                <th className="px-4 py-2.5 font-semibold">STATE</th>
                <th className="px-4 py-2.5 font-semibold">LAST PULSE</th>
                <th className="px-4 py-2.5 font-semibold">INITIALIZED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && beats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    SYNCHRONIZING PROBE TELEMETRY...
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
              ) : beats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-dark">
                    NO ACTIVE HEARTBEATS CONFIGURED
                  </td>
                </tr>
              ) : (
                beats.map((b, i) => (
                  <tr key={i} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-accent font-semibold">
                      {b.session_id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-muted" />
                        <span>{b.interval_minutes}m</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-sans text-xs text-text max-w-xs truncate">
                      {b.prompt || '<DEFAULT_HEALTH_PING>'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-wider',
                          b.enabled
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-border bg-surface2 text-muted',
                        )}
                      >
                        {b.enabled ? '[PULSING]' : '[PAUSED]'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-dark text-[11px]">
                      {fmtDate(b.last_run)}
                    </td>
                    <td className="px-4 py-3 text-muted-dark text-[11px]">
                      {fmtDate(b.created_at)}
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
