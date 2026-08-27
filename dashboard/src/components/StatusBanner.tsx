import { Activity, Radio, Cpu, Network } from 'lucide-react';
import { cn } from '../lib/utils';

interface StatusBannerProps {
  status: 'ok' | 'err' | 'warn' | 'connecting';
  uptime: string;
  clients: number;
  port: number;
}

export function StatusBanner({ status, uptime, clients, port }: StatusBannerProps) {
  const isOk = status === 'ok';

  return (
    <div
      role="region"
      aria-label="Server telemetry banner"
      className="bg-surface border border-border p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs"
    >
      {/* Left: Core Server State */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-2 h-2',
            isOk
              ? 'bg-success'
              : status === 'connecting'
                ? 'bg-warning animate-pulse'
                : 'bg-danger',
          )}
          aria-hidden="true"
        />
        <div className="flex items-center gap-2">
          <span className="text-muted uppercase tracking-wider text-[11px]">System Status:</span>
          <span
            className={cn(
              'font-bold uppercase tracking-wider px-1.5 py-0.5 border text-[11px]',
              isOk
                ? 'text-success border-success/30 bg-success/5'
                : status === 'connecting'
                  ? 'text-warning border-warning/30 bg-warning/5'
                  : 'text-danger border-danger/30 bg-danger/5',
            )}
          >
            {isOk ? 'LIVE // OPERATIONAL' : status === 'connecting' ? 'SYNCING...' : 'DEGRADED'}
          </span>
        </div>
      </div>

      {/* Right: Telemetry Matrix */}
      <div className="flex items-center gap-6 text-muted">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-accent" />
          <span className="text-muted-dark uppercase text-[10px]">UPTIME:</span>
          <span className="text-text-bright font-semibold">{uptime}</span>
        </div>

        <div className="flex items-center gap-2">
          <Network size={13} className="text-amber" />
          <span className="text-muted-dark uppercase text-[10px]">WS CLIENTS:</span>
          <span className="text-text-bright font-semibold">{clients}</span>
        </div>

        <div className="flex items-center gap-2">
          <Cpu size={13} className="text-muted" />
          <span className="text-muted-dark uppercase text-[10px]">PORT:</span>
          <span className="text-text-bright font-semibold">{port}</span>
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <Radio size={12} className={isOk ? 'text-success animate-pulse' : 'text-danger'} />
          <span className="text-[10px] text-muted-dark uppercase tracking-widest">FEED ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
