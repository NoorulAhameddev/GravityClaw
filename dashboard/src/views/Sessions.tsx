import { useEffect, useState } from 'react';
import { Users, MessageSquare, CheckCircle2, AlertCircle, Search } from 'lucide-react';
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
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
        setError(e instanceof Error ? e.message : 'Failed to fetch active sessions');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const i = setInterval(fetch, 10000);
    return () => clearInterval(i);
  }, []);

  const filtered = sessions.filter((s) => {
    const id = s.id || s.session_id || '';
    return id.toLowerCase().includes(search.toLowerCase());
  });

  const activeCount = sessions.filter((s) => s.allow_messages).length;
  const totalMsgs = sessions.reduce((acc, s) => acc + (s.message_count || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              SESSION_MANAGER // CONTEXT_INSTANCES
            </div>
            <div className="text-muted text-xs">
              Live and archived agent conversation sessions with isolated memory namespaces and permissions.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">{sessions.length} INSTANCES</span>
          <span className="hud-tag">ISOLATED_STATE</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">TOTAL_SESSIONS</div>
            <div className="text-2xl font-bold text-text-bright">{sessions.length}</div>
          </div>
          <Users size={16} className="text-accent" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">ACCEPTING_MESSAGES</div>
            <div className="text-2xl font-bold text-success">{activeCount}</div>
          </div>
          <CheckCircle2 size={16} className="text-success" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">TOTAL_MESSAGE_TURNS</div>
            <div className="text-2xl font-bold text-text-bright">{totalMsgs.toLocaleString()}</div>
          </div>
          <MessageSquare size={16} className="text-info" />
        </div>
      </div>

      {/* Sessions Table Panel */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>SESSION NAMESPACE REGISTRY</span>
          </div>
          <span className="hud-tag">{filtered.length} MATCHED</span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border bg-surface2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
            <input
              type="text"
              placeholder="Search session namespace hash..."
              className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border text-xs font-mono text-text-bright focus:outline-none focus:border-accent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">SESSION ID / NAMESPACE</th>
                <th className="px-4 py-2.5 font-semibold">MESSAGE VOLUME</th>
                <th className="px-4 py-2.5 font-semibold">INGRESS GATE</th>
                <th className="px-4 py-2.5 font-semibold">LAST ACTIVITY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    SYNCHRONIZING SESSION DATA...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-danger">
                    <div className="flex items-center justify-center gap-2">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-dark">
                    NO SESSIONS MATCHED QUERY
                  </td>
                </tr>
              ) : (
                filtered.map((s, i) => {
                  const sid = s.id || s.session_id || `session-${i}`;
                  return (
                    <tr key={sid} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-bold text-accent">
                        {sid}
                      </td>
                      <td className="px-4 py-3 text-text-bright">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare size={12} className="text-muted" />
                          <span>{s.message_count || 0} turns</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-wider',
                            s.allow_messages
                              ? 'border-success/40 bg-success/10 text-success'
                              : 'border-border bg-surface2 text-muted',
                          )}
                        >
                          {s.allow_messages ? '[ACCEPTING_INPUT]' : '[LOCKED]'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-dark text-[11px]">
                        {fmtDate(s.updated_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
