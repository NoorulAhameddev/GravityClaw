import {
    LayoutDashboard,
    MessageSquare,
    Box,
    Calendar,
    Webhook,
    Activity,
    Database,
    BarChart3,
    Users,
    GitBranch,
    Wrench,
    Zap,
    ShieldCheck,
    Phone
} from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'canvas', label: 'Canvas', icon: Box },
    { type: 'section', label: 'Automation' },
    { id: 'scheduler', label: 'Scheduler', icon: Calendar },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'heartbeats', label: 'Heartbeats', icon: Activity },
    { type: 'section', label: 'Channels' },
    { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
    { type: 'section', label: 'System' },
    { id: 'sessions', label: 'Sessions', icon: Users },
    { id: 'memory', label: 'Memory', icon: Database },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { type: 'section', label: 'Advanced' },
    { id: 'swarms', label: 'Swarms', icon: Box },
    { id: 'workflows', label: 'Workflows', icon: GitBranch },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'usage', label: 'Usage', icon: Zap },
    { id: 'admin', label: 'Admin', icon: ShieldCheck },
];

interface SidebarProps {
    currentPage: string;
    onNavigate: (page: string) => void;
    status: 'ok' | 'err' | 'warn' | 'connecting';
}

export function Sidebar({ currentPage, onNavigate, status }: SidebarProps) {
    return (
        <aside role="navigation" aria-label="Main navigation" className="w-[240px] bg-surface backdrop-blur-xl border-r border-border/50 flex flex-col flex-shrink-0 h-screen overflow-y-auto relative">
            <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent pointer-events-none" aria-hidden="true" />
            
            <div className="p-5 pt-[22px] pb-[16px] text-lg font-bold border-b border-border/50 tracking-tight relative" role="banner">
                <span className="text-text-bright">Gravity</span> <span className="text-accent drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">Claw</span>
            </div>

            <nav aria-label="Sidebar" className="flex-1 py-3 px-2">
                {NAV_ITEMS.map((item, i) => {
                    if (item.type === 'section') {
                        return (
                            <div key={i} role="separator" className="px-3 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-dark">
                                {item.label}
                            </div>
                        );
                    }

                    const Icon = item.icon!;
                    const active = currentPage === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id!)}
                            aria-current={active ? "page" : undefined}
                            aria-label={item.label}
                            className={cn(
                                "w-[calc(100%-8px)] mx-[4px] my-[2px] px-3 py-2.5 flex items-center gap-3 rounded-xl transition-all duration-200 text-[13.5px] font-medium",
                                active
                                    ? "bg-accent text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                                    : "text-muted hover:bg-surface-hover hover:text-text-bright"
                            )}
                        >
                            <Icon size={16} className={cn("flex-shrink-0", active && "drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]")} aria-hidden="true" />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div role="status" aria-label="Connection status" className="mt-auto p-4 border-t border-border/50 flex items-center gap-3 text-xs text-muted backdrop-blur-sm bg-bg/30">
                <div className={cn(
                    "w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]",
                    status === 'ok' ? "bg-success text-success" : status === 'err' ? "bg-danger text-danger" : "bg-warning text-warning animate-pulse"
                )} aria-hidden="true" />
                <span className="font-medium">{status === 'ok' ? 'Online' : status === 'connecting' ? 'Connecting...' : 'Offline'}</span>
            </div>
        </aside>
    );
}
