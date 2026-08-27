import { useGlobalState, type UsageData, type UsagePeriod } from '../hooks/StateContext';
import { StatCard } from '../components/StatCard';
import { StatusBanner } from '../components/StatusBanner';
import { fmtUptime } from '../lib/utils';
import { Users, Activity, Database, Box, GitBranch, Webhook, Zap, BarChart3, Clock, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Overview() {
  const { health, stats, usage, loading } = useGlobalState();

  if (loading) {
    return (
      <div className="p-6 font-mono text-xs text-muted flex items-center gap-2">
        <span className="w-2 h-2 bg-accent animate-pulse" />
        <span>INITIALIZING TELEMETRY STREAM...</span>
      </div>
    );
  }

  const s = stats?.data || {};
  const h = health || {};
  const u: UsagePeriod = (usage as UsageData)?.byPeriod?.today || {
    requests: 0,
    tokens: 0,
    cost: null,
  };
  const uw: UsagePeriod = (usage as UsageData)?.byPeriod?.week || {
    requests: 0,
    tokens: 0,
    cost: null,
  };
  const ua: UsagePeriod = (usage as UsageData)?.byPeriod?.allTime || {
    requests: 0,
    tokens: 0,
    cost: null,
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Global Server Telemetry */}
      <StatusBanner
        status={h.status === 'ok' ? 'ok' : 'err'}
        uptime={fmtUptime(h.uptime ?? 0)}
        clients={h.server?.wsClients ?? 0}
        port={h.server?.port ?? 4000}
      />

      {/* Domain 1: Agent & Orchestration Grid */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent" />
            <span>ORCHESTRATION & AGENT TOPOLOGY</span>
          </div>
          <span className="hud-tag">6 ACTIVE SUBSYSTEMS</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-border divide-x divide-y sm:divide-y-0 divide-border bg-surface">
          <StatCard label="Live Sessions" value={s.sessions ?? 0} icon={Users} className="border-none" />
          <StatCard label="Active Tasks" value={s.activeTasks ?? 0} icon={Activity} className="border-none" />
          <StatCard label="Memory Bank" value={s.memorySessions ?? 0} icon={Database} className="border-none" />
          <StatCard label="Swarm Units" value={s.swarms ?? 0} icon={Box} className="border-none" />
          <StatCard label="Workflows" value={s.workflows ?? 0} icon={GitBranch} className="border-none" />
          <StatCard label="Webhooks" value={s.webhooks ?? 0} icon={Webhook} className="border-none" />
        </div>
      </div>

      {/* Domain 2: Usage & Token Velocity */}
      <div className="hud-panel">
        <div className="hud-panel-header">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-amber" />
            <span>TOKEN VELOCITY & RESOURCE CONSUMPTION</span>
          </div>
          <span className="hud-tag">METRICS SYNCED</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border-b border-border divide-x divide-y lg:divide-y-0 divide-border bg-surface">
          <StatCard
            label="Today's Calls"
            value={u.requests ?? 0}
            subValue={`Est. Cost: $${(u.cost || 0).toFixed(4)}`}
            icon={Zap}
            className="border-none"
          />
          <StatCard
            label="7-Day Calls"
            value={uw.requests ?? 0}
            subValue={`Est. Cost: $${(uw.cost || 0).toFixed(4)}`}
            icon={BarChart3}
            className="border-none"
          />
          <StatCard
            label="All-Time Calls"
            value={ua.requests ?? 0}
            subValue={`Est. Cost: $${(ua.cost || 0).toFixed(4)}`}
            icon={Zap}
            className="border-none"
          />
          <StatCard
            label="Total Tokens Burned"
            value={ua.tokens ?? 0}
            subValue="Input + Output Tokens"
            icon={Terminal}
            className="border-none"
          />
          <StatCard
            label="Average Latency"
            value={`${Math.round(usage?.avgLatency || 0)}ms`}
            subValue="P50 Response Time"
            icon={Clock}
            className="border-none"
          />
        </div>
      </div>

      {/* Domain 3: Tactical Module Jump Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        <Link
          to="/chat"
          className="hud-panel p-4 hover:border-accent transition-colors flex items-start justify-between group"
        >
          <div>
            <div className="font-bold text-text-bright uppercase group-hover:text-accent mb-1">
              &gt; CHAT TERMINAL
            </div>
            <div className="text-muted text-[11px]">
              Direct agent conversation & interactive tool invocation
            </div>
          </div>
          <Terminal size={16} className="text-muted-dark group-hover:text-accent shrink-0 ml-2" />
        </Link>

        <Link
          to="/memory"
          className="hud-panel p-4 hover:border-accent transition-colors flex items-start justify-between group"
        >
          <div>
            <div className="font-bold text-text-bright uppercase group-hover:text-accent mb-1">
              &gt; MEMORY BANK
            </div>
            <div className="text-muted text-[11px]">
              Hybrid SQLite + Vector store session retrieval & facts
            </div>
          </div>
          <Database size={16} className="text-muted-dark group-hover:text-accent shrink-0 ml-2" />
        </Link>

        <Link
          to="/swarms"
          className="hud-panel p-4 hover:border-accent transition-colors flex items-start justify-between group"
        >
          <div>
            <div className="font-bold text-text-bright uppercase group-hover:text-accent mb-1">
              &gt; SWARM RUNTIME
            </div>
            <div className="text-muted text-[11px]">
              Multi-agent coordination, task handoffs & agent roles
            </div>
          </div>
          <Box size={16} className="text-muted-dark group-hover:text-accent shrink-0 ml-2" />
        </Link>
      </div>
    </div>
  );
}
