import { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { getWsUrl } from '../lib/utils';

interface Group {
  platform: string;
  groupId: string;
  enabledToolCount: number;
  disabledToolCount: number;
}

interface ToolResponse {
  type: string;
  error?: string;
  result?: string;
}

export default function Admin() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const { sendMessage, messages } = useWebSocket(getWsUrl());

  const loadGroups = useCallback(() => {
    setLoading(true);
    setError(null);
    sendMessage({
      type: 'tool_call',
      id: `admin-${Date.now()}`,
      tool: 'listGroupsForUser',
      args: {},
    } as unknown as Parameters<typeof sendMessage>[0]);
  }, [sendMessage]);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadGroups();
    }
  }, [loadGroups]);

  useEffect(() => {
    const latestMsg = messages[messages.length - 1];
    if (!latestMsg || latestMsg.type !== 'tool_response') return;

    const response = latestMsg as unknown as ToolResponse;

    if (response.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(response.error);
      setLoading(false);
      return;
    }

    try {
      const result =
        typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
      if (result?.success && result?.data?.groups) {
        setGroups(result.data.groups);
        setError(null);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [messages]);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              ADMIN_CONSOLE // PERMISSIONS_ENFORCEMENT
            </div>
            <div className="text-muted text-xs">
              Platform group access controls, tool permission whitelisting, and authorization boundary management.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hud-tag text-danger border-danger/30">RESTRICTED_ACCESS</span>
          <button
            onClick={loadGroups}
            disabled={loading}
            className="px-3 py-1 bg-surface2 hover:bg-surface-hover border border-border font-mono text-xs text-text-bright hover:text-accent disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 text-danger font-mono text-xs">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Group Permissions Matrix */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>PLATFORM GROUP PERMISSIONS</span>
          </div>
          <span className="hud-tag">{groups.length} GROUPS REGISTERED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">PLATFORM PROTOCOL</th>
                <th className="px-4 py-2.5 font-semibold">GROUP IDENTIFIER</th>
                <th className="px-4 py-2.5 font-semibold">ENABLED CAPABILITIES</th>
                <th className="px-4 py-2.5 font-semibold">DISABLED CAPABILITIES</th>
                <th className="px-4 py-2.5 font-semibold">ENFORCEMENT STATE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    QUERYING ADMIN AUTH BOUNDARY...
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-dark">
                    NO PLATFORM GROUPS REGISTERED
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={`${g.platform}-${g.groupId}`} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-bold text-text-bright uppercase">
                      [{g.platform}]
                    </td>
                    <td className="px-4 py-3 text-accent font-semibold">
                      {g.groupId}
                    </td>
                    <td className="px-4 py-3 text-success font-semibold">
                      {g.enabledToolCount} tools active
                    </td>
                    <td className="px-4 py-3 text-muted-dark">
                      {g.disabledToolCount} blocked
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 border border-success/40 bg-success/10 text-success text-[10px] font-bold uppercase tracking-wider">
                        [RESTRICTED_BOUNDS]
                      </span>
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
