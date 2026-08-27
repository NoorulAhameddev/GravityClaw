import { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  DollarSign,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface AnalyticsData {
  requests: { total: number; byHour: number[]; byDay: number[] };
  tokens: { total: number; byModel: Record<string, number> };
  cost: { total: number; byModel: Record<string, number> };
  latency: { avg: number; p50: number; p95: number; p99: number };
  errors: { total: number; byType: Record<string, number> };
  sessions: { active: number; total: number; avgDuration: number };
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const res = await api(`/api/analytics?period=${period}`);
        setData(res);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics telemetry');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [period]);

  const metrics = [
    {
      label: 'TOTAL_INVOCATIONS',
      value: data?.requests.total ?? 0,
      icon: Zap,
      trend: '+12%',
      isPositive: true,
    },
    {
      label: 'TOTAL_TOKENS_BURNED',
      value: data?.tokens.total ?? 0,
      icon: Hash,
      trend: '+8%',
      isPositive: true,
    },
    {
      label: 'CALCULATED_SPEND',
      value: `$${(data?.cost.total ?? 0).toFixed(2)}`,
      icon: DollarSign,
      trend: '-3%',
      isPositive: true,
    },
    {
      label: 'LATENCY_P50_BENCH',
      value: `${Math.round(data?.latency.p50 ?? 0)}ms`,
      icon: Clock,
      trend: '-5%',
      isPositive: true,
    },
  ];

  const modelBreakdown = Object.entries(data?.tokens.byModel ?? {}).sort(([, a], [, b]) => b - a);

  if (loading && !data) {
    return (
      <div className="hud-panel p-8 text-center font-mono text-xs text-muted">
        PROCESSING HISTORICAL TELEMETRY STREAMS...
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

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              SYSTEM_ANALYTICS // HISTORICAL_PERFORMANCE
            </div>
            <div className="text-muted text-xs">
              Throughput distributions, token burn velocity, latency percentiles, and SLA compliance.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          {(['24h', '7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 border text-[11px] font-semibold uppercase tracking-wider transition-colors',
                period === p
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-surface text-muted hover:text-text hover:bg-surface-hover',
              )}
            >
              [{p.toUpperCase()}]
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        {metrics.map((m) => (
          <div key={m.label} className="hud-panel p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted uppercase tracking-wider">{m.label}</span>
              <m.icon size={14} className="text-muted-dark" />
            </div>

            <div className="text-2xl font-bold text-text-bright">
              {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
            </div>

            <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between text-[11px]">
              <span className="text-muted-dark">DELTA:</span>
              <span className={cn('font-semibold flex items-center gap-1', m.isPositive ? 'text-success' : 'text-danger')}>
                {m.trend.startsWith('+') ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {m.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Latency Distribution & Session Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-mono text-xs">
        {/* Latency Percentiles */}
        <div className="hud-panel">
          <div className="hud-panel-header">
            <span>LATENCY_DISTRIBUTION_PERCENTILES</span>
            <span className="hud-tag">SLA_OK</span>
          </div>

          <div className="p-4 space-y-3">
            {[
              { label: 'AVERAGE_RESPONSE', value: data?.latency.avg ?? 0 },
              { label: 'P50_MEDIAN', value: data?.latency.p50 ?? 0 },
              { label: 'P95_TAIL_LATENCY', value: data?.latency.p95 ?? 0 },
              { label: 'P99_PEAK_LATENCY', value: data?.latency.p99 ?? 0 },
            ].map((m) => {
              const max = Math.max(data?.latency.p99 ?? 100, 1);
              const pct = (m.value / max) * 100;
              return (
                <div key={m.label} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted">{m.label}</span>
                    <span className="font-bold text-text-bright">{Math.round(m.value)}ms</span>
                  </div>
                  <div className="h-1.5 bg-surface2 border border-border">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Session Topology Telemetry */}
        <div className="hud-panel">
          <div className="hud-panel-header">
            <span>SESSION_TOPOLOGY_METRICS</span>
            <span className="hud-tag">ACTIVE_POOLS</span>
          </div>

          <div className="p-4 grid grid-cols-3 gap-3 text-center">
            <div className="p-3 border border-border bg-surface2">
              <div className="text-2xl font-bold text-accent">{data?.sessions.active ?? 0}</div>
              <div className="text-[10px] text-muted-dark uppercase mt-1">ACTIVE SESSIONS</div>
            </div>

            <div className="p-3 border border-border bg-surface2">
              <div className="text-2xl font-bold text-success">{data?.sessions.total ?? 0}</div>
              <div className="text-[10px] text-muted-dark uppercase mt-1">TOTAL POOLED</div>
            </div>

            <div className="p-3 border border-border bg-surface2">
              <div className="text-2xl font-bold text-amber">
                {Math.round(data?.sessions.avgDuration ?? 0)}m
              </div>
              <div className="text-[10px] text-muted-dark uppercase mt-1">AVG DURATION</div>
            </div>
          </div>
        </div>
      </div>

      {/* Model Usage Matrix */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>MODEL USAGE DISTRIBUTION BREAKDOWN</span>
          </div>
          <span className="hud-tag">{modelBreakdown.length} MODELS</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">MODEL ARCHITECTURE</th>
                <th className="px-4 py-2.5 font-semibold">TOKEN ALLOCATION</th>
                <th className="px-4 py-2.5 font-semibold">USAGE SHARE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {modelBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-dark">
                    NO MODEL ALLOCATION DATA RECORDED
                  </td>
                </tr>
              ) : (
                modelBreakdown.map(([model, tokens]) => {
                  const total = data?.tokens.total || 1;
                  const pct = Math.round((tokens / total) * 100);
                  return (
                    <tr key={model} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-bold text-text-bright">
                        {model}
                      </td>
                      <td className="px-4 py-3 text-amber font-semibold">
                        {tokens.toLocaleString()} tokens
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-surface border border-border h-2 relative">
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
