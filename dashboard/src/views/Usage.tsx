import { useEffect, useState } from 'react';
import { Zap, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface UsagePeriod {
  requests: number;
  tokens: number;
  cost: number | null;
}

interface UsageData {
  byPeriod: {
    today: UsagePeriod;
    week: UsagePeriod;
    allTime: UsagePeriod;
  };
  models: Record<string, { calls: number; tokens: number; cost: number }>;
  avgLatency?: number;
}

function fmt$(n: number | null | undefined) {
  return `$${(n || 0).toFixed(4)}`;
}

export default function Usage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api('/api/usage');
        setUsage(res);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load usage telemetry');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const i = setInterval(fetch, 30000);
    return () => clearInterval(i);
  }, []);

  if (loading && !usage) {
    return (
      <div className="hud-panel p-8 text-center font-mono text-xs text-muted">
        SYNCHRONIZING TOKEN METRICS...
      </div>
    );
  }

  if (error) {
    return (
      <div className="hud-panel p-8 text-center font-mono text-xs text-danger flex items-center justify-center gap-2">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );
  }

  const b = usage?.byPeriod;
  const models = Object.entries(usage?.models || {});

  const periods = [
    { label: 'TODAY_INTERVAL', data: b?.today },
    { label: '7_DAY_WEEKLY_INTERVAL', data: b?.week },
    { label: 'ALL_TIME_CUMULATIVE', data: b?.allTime },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              USAGE_METRICS // TOKEN_VELOCITY
            </div>
            <div className="text-muted text-xs">
              Token consumption velocity, inference latency, and model-level cost accounting.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">AVG_LATENCY: {Math.round(usage?.avgLatency || 0)}ms</span>
          <span className="hud-tag">REALTIME_METERING</span>
        </div>
      </div>

      {/* Period Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        {periods.map(({ label, data }) => (
          <div key={label} className="hud-panel">
            <div className="hud-panel-header">
              <span>{label}</span>
              <span className="text-accent font-bold">{fmt$(data?.cost)}</span>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-border-subtle">
                <span className="text-muted-dark uppercase text-[10px]">API INVOCATIONS</span>
                <span className="font-bold text-text-bright text-base">
                  {(data?.requests || 0).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-border-subtle">
                <span className="text-muted-dark uppercase text-[10px]">TOTAL TOKENS BURNED</span>
                <span className="font-bold text-amber text-base">
                  {(data?.tokens || 0).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-center text-[10px] text-muted">
                <span>ESTIMATED SPEND</span>
                <span className="font-bold text-success text-xs">{fmt$(data?.cost)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Model Breakdown Matrix */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>MODEL TELEMETRY & COST LEDGER</span>
          </div>
          <span className="hud-tag">{models.length} MODELS TRACKED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">MODEL IDENTIFIER</th>
                <th className="px-4 py-2.5 font-semibold">TOTAL CALLS</th>
                <th className="px-4 py-2.5 font-semibold">TOKENS CONSUMED</th>
                <th className="px-4 py-2.5 font-semibold">EST. COMPUTED COST</th>
                <th className="px-4 py-2.5 font-semibold">USAGE SHARE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-dark">
                    NO MODEL CALL RECORDS FOUND
                  </td>
                </tr>
              ) : (
                models.map(([name, m]) => {
                  const totalTokens = b?.allTime?.tokens || 1;
                  const pct = Math.round(((m.tokens || 0) / totalTokens) * 100);
                  return (
                    <tr key={name} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-bold text-text-bright">
                        {name}
                      </td>
                      <td className="px-4 py-3 text-text">
                        {m.calls?.toLocaleString() || 0}
                      </td>
                      <td className="px-4 py-3 text-amber font-semibold">
                        {m.tokens?.toLocaleString() || 0}
                      </td>
                      <td className="px-4 py-3 text-success font-semibold">
                        {fmt$(m.cost)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-surface border border-border h-2 relative">
                            <div className="bg-accent h-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted">{pct}%</span>
                        </div>
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
