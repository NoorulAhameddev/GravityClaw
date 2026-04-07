import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'; import { cn } from '../lib/utils';

interface StatusBannerProps {
    status: 'ok' | 'err' | 'warn' | 'connecting';
    uptime: string;
    clients: number;
    port: number;
}

export function StatusBanner({ status, uptime, clients, port }: StatusBannerProps) {
    const isOk = status === 'ok';

    return (
        <div className={cn(
            "relative overflow-hidden backdrop-blur-xl border rounded-2xl p-6 mb-8 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-500",
            isOk 
                ? "bg-gradient-to-br from-surface to-accent/5 border-accent/20 shadow-[0_0_40px_rgba(99,102,241,0.1)]" 
                : "bg-gradient-to-br from-surface to-danger/5 border-danger/20"
        )}>
            <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-transparent opacity-50" />
            
            <div className="flex items-center gap-5 relative z-10">
                <div className={cn(
                    "text-4xl p-2 rounded-xl",
                    isOk ? "text-success" : "text-danger"
                )}>
                    {isOk ? <CheckCircle2 size={36} className="drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]" /> : status === 'connecting' ? <RefreshCw size={36} className="animate-spin" /> : <AlertCircle size={36} className="drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]" />}
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-dark uppercase tracking-widest font-semibold">Server Status</span>
                    <span className="text-xl font-bold text-text-bright">
                        {isOk ? 'Online' : status === 'connecting' ? 'Connecting...' : 'Offline'}
                    </span>
                </div>
            </div>

            <div className="flex gap-8 relative z-10">
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-dark uppercase tracking-wider font-semibold">Uptime</span>
                    <span className="text-[16px] font-bold text-text-bright">{uptime}</span>
                </div>
                <div className="flex flex-col gap-1 text-right">
                    <span className="text-[11px] text-muted-dark uppercase tracking-wider font-semibold">WebSocket Clients</span>
                    <span className="text-[16px] font-bold text-text-bright">{clients}</span>
                </div>
                <div className="flex flex-col gap-1 text-right">
                    <span className="text-[11px] text-muted-dark uppercase tracking-wider font-semibold">Port</span>
                    <span className="text-[16px] font-bold text-text-bright">{port}</span>
                </div>
            </div>
        </div>
    );
}
