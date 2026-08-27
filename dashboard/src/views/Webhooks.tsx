import { useEffect, useState } from 'react';
import { Webhook as WebhookIcon, Shield, Search, AlertCircle, Copy, Check, Lock } from 'lucide-react';
import { api } from '../lib/api';

interface Webhook {
  name: string;
  session_id: string;
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
        setError(e instanceof Error ? e.message : 'Failed to fetch webhook listeners');
      } finally {
        setLoading(false);
      }
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

  const filtered = hooks.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.session_id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WebhookIcon size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              WEBHOOK_GATEWAY // INGRESS_SECURITY
            </div>
            <div className="text-muted text-xs">
              HMAC cryptographic validation, replay attack mitigation, and session event dispatching.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">HMAC_SHA256</span>
          <span className="hud-tag">REPLAY_GUARD_ACTIVE</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">REGISTERED_LISTENERS</div>
            <div className="text-2xl font-bold text-text-bright">{hooks.length}</div>
          </div>
          <WebhookIcon size={16} className="text-accent" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">SIGNATURE_ENFORCEMENT</div>
            <div className="text-2xl font-bold text-success">[ACTIVE]</div>
          </div>
          <Lock size={16} className="text-success" />
        </div>

        <div className="hud-panel p-4 flex items-center justify-between">
          <div>
            <div className="text-muted-dark uppercase text-[10px] tracking-wider mb-1">QUARANTINE_ISOLATION</div>
            <div className="text-2xl font-bold text-info">ZERO_THREATS</div>
          </div>
          <Shield size={16} className="text-info" />
        </div>
      </div>

      {/* Ingress Table Panel */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>INGRESS ENDPOINT MATRIX</span>
          </div>
          <span className="hud-tag">{filtered.length} ACTIVE</span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border bg-surface2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
            <input
              type="text"
              placeholder="Filter webhooks by endpoint name or session ID..."
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
                <th className="px-4 py-2.5 font-semibold">ENDPOINT NAME</th>
                <th className="px-4 py-2.5 font-semibold">WEBHOOK INGRESS URL</th>
                <th className="px-4 py-2.5 font-semibold">BINDING SESSION</th>
                <th className="px-4 py-2.5 font-semibold">AUTH VERIFICATION</th>
                <th className="px-4 py-2.5 font-semibold">REGISTERED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && hooks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    SCANNING INGRESS LISTENERS...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-danger">
                    <div className="flex items-center justify-center gap-2">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-dark">
                    NO ACTIVE WEBHOOKS FOUND
                  </td>
                </tr>
              ) : (
                filtered.map((w) => {
                  const url = `/api/webhook/${encodeURIComponent(w.name)}`;
                  return (
                    <tr key={w.name} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-bold text-text-bright">
                        {w.name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="px-1.5 py-0.5 border border-border bg-surface text-accent font-mono text-[11px]">
                            {url}
                          </code>
                          <button
                            onClick={() => copy(url)}
                            className="p-1 text-muted-dark hover:text-text-bright transition-colors"
                            title="Copy Ingress URL"
                          >
                            {copied === url ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {w.session_id}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 border border-success/40 bg-success/10 text-success text-[10px] font-bold uppercase tracking-wider">
                          [HMAC_ENFORCED]
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-dark text-[11px]">
                        {fmtDate(w.created_at)}
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
