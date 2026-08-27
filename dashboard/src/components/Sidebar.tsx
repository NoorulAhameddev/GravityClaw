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
} from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat Terminal', icon: MessageSquare },
  { id: 'canvas', label: 'Canvas Viewport', icon: Box },
  { type: 'section', label: 'Automation' },
  { id: 'scheduler', label: 'Scheduler', icon: Calendar },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'heartbeats', label: 'Heartbeats', icon: Activity },
  { type: 'section', label: 'System Memory' },
  { id: 'sessions', label: 'Sessions', icon: Users },
  { id: 'memory', label: 'Memory Bank', icon: Database },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { type: 'section', label: 'Orchestration' },
  { id: 'swarms', label: 'Swarms', icon: Box },
  { id: 'workflows', label: 'Workflows', icon: GitBranch },
  { id: 'tools', label: 'Tool Registry', icon: Wrench },
  { id: 'usage', label: 'Usage & Cost', icon: Zap },
  { id: 'admin', label: 'Admin Control', icon: ShieldCheck },
];

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  status: 'ok' | 'err' | 'warn' | 'connecting';
}

export function Sidebar({ currentPage, onNavigate, status }: SidebarProps) {
  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className="w-57.5 bg-surface border-r border-border flex flex-col shrink-0 h-screen overflow-y-auto select-none"
    >
      {/* Tactical Branding Header */}
      <div
        className="h-14 px-4 flex items-center justify-between border-b border-border bg-surface2 shrink-0"
        role="banner"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent" />
          <span className="font-mono font-bold text-sm tracking-wider text-text-bright uppercase">
            Gravity<span className="text-accent">.Claw</span>
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted uppercase tracking-widest px-1.5 py-0.5 border border-border bg-surface">
          v2.4
        </span>
      </div>

      {/* Navigation Matrix */}
      <nav aria-label="Sidebar" className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item, i) => {
          if (item.type === 'section') {
            return (
              <div
                key={i}
                role="separator"
                className="px-3 pt-4 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-dark flex items-center gap-2"
              >
                <span>// {item.label}</span>
              </div>
            );
          }

          const Icon = item.icon!;
          const active = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id!)}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className={cn(
                'w-full px-3 py-2 flex items-center gap-2.5 text-xs font-medium border-l-2 transition-colors duration-100 text-left',
                active
                  ? 'border-accent bg-surface-hover text-text-bright font-semibold'
                  : 'border-transparent text-muted hover:bg-surface-hover/60 hover:text-text',
              )}
            >
              <Icon
                size={14}
                className={cn('shrink-0', active ? 'text-accent' : 'text-muted-dark')}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Telemetry Footer */}
      <div
        role="status"
        aria-label="Connection status"
        className="h-12 px-4 border-t border-border bg-surface2 flex items-center justify-between font-mono text-[11px] shrink-0"
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-1.5 h-1.5',
              status === 'ok'
                ? 'bg-success'
                : status === 'err'
                  ? 'bg-danger'
                  : 'bg-warning animate-pulse',
            )}
            aria-hidden="true"
          />
          <span className="text-muted-dark uppercase tracking-wider">WS</span>
        </div>
        <span
          className={cn(
            'font-semibold uppercase tracking-wider',
            status === 'ok'
              ? 'text-success'
              : status === 'err'
                ? 'text-danger'
                : 'text-warning',
          )}
        >
          {status === 'ok' ? '[ONLINE]' : status === 'connecting' ? '[CONNECTING]' : '[OFFLINE]'}
        </span>
      </div>
    </aside>
  );
}
