import { useGlobalState, type UsageData, type UsagePeriod } from '../hooks/StateContext';
import { StatCard } from '../components/StatCard';
import { StatusBanner } from '../components/StatusBanner';
import { fmtUptime } from '../lib/utils';
import {
    Users,
    Activity,
    Database,
    Box,
    GitBranch,
    Webhook,
    Zap,
    BarChart3
} from 'lucide-react';

export function Overview() {
    const { health, stats, usage, loading } = useGlobalState();

    if (loading) return <div className="p-8 text-muted animate-pulse">Loading dashboard data...</div>;

    const s = stats?.data || {};
    const h = health || {};
    const u: UsagePeriod = (usage as UsageData)?.byPeriod?.today || { requests: 0, tokens: 0, cost: null };
    const uw: UsagePeriod = (usage as UsageData)?.byPeriod?.week || { requests: 0, tokens: 0, cost: null };
    const ua: UsagePeriod = (usage as UsageData)?.byPeriod?.allTime || { requests: 0, tokens: 0, cost: null };

    return (
        <div className="space-y-8">
            <StatusBanner
                status={h.status === 'ok' ? 'ok' : 'err'}
                uptime={fmtUptime(h.uptime ?? 0)}
                clients={h.server?.wsClients ?? 0}
                port={h.server?.port ?? 3000}
            />

            <div className="mb-6">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted-dark mb-4 pb-2 border-b border-border/40 flex items-center gap-2">
                    <span className="w-1 h-4 bg-accent rounded-full" />
                    Active Statistics
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <StatCard label="Sessions" value={s.sessions ?? 0} icon={Users} color="blue" />
                    <StatCard label="Active Tasks" value={s.activeTasks ?? 0} icon={Activity} color="green" />
                    <StatCard label="Memory" value={s.memorySessions ?? 0} icon={Database} color="purple" />
                    <StatCard label="Swarms" value={s.swarms ?? 0} icon={Box} color="yellow" />
                    <StatCard label="Workflows" value={s.workflows ?? 0} icon={GitBranch} color="pink" />
                    <StatCard label="Webhooks" value={s.webhooks ?? 0} icon={Webhook} color="cyan" />
                </div>
            </div>

            <div className="mb-6">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted-dark mb-4 pb-2 border-b border-border/40 flex items-center gap-2">
                    <span className="w-1 h-4 bg-accent2 rounded-full" />
                    Usage Analytics
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
                    <StatCard
                        label="Today's Requests"
                        value={u.requests ?? 0}
                        subValue={`Cost: $${(u.cost || 0).toFixed(4)}`}
                        icon={Zap}
                    />
                    <StatCard
                        label="Weekly Requests"
                        value={uw.requests ?? 0}
                        subValue={`Cost: $${(uw.cost || 0).toFixed(4)}`}
                        icon={BarChart3}
                    />
                    <StatCard
                        label="All-Time Requests"
                        value={ua.requests ?? 0}
                        subValue={`Cost: $${(ua.cost || 0).toFixed(4)}`}
                        icon={Zap}
                    />
                    <StatCard
                        label="Total Tokens"
                        value={ua.tokens ?? 0}
                        icon={Zap}
                    />
                    <StatCard
                        label="Avg Latency"
                        value={`${Math.round(usage?.avgLatency || 0)}ms`}
                        icon={Activity}
                    />
                </div>
            </div>
        </div>
    );
}
