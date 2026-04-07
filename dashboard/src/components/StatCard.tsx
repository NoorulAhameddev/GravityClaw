import { cn } from '../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: string | number;
    subValue?: string;
    icon?: LucideIcon;
    color?: 'blue' | 'green' | 'purple' | 'yellow' | 'pink' | 'cyan';
    className?: string;
}

const COLORS = {
    blue: 'border-l-info shadow-[0_4px_24px_-4px_rgba(59,130,246,0.2)]',
    green: 'border-l-success shadow-[0_4px_24px_-4px_rgba(16,185,129,0.2)]',
    purple: 'border-l-accent shadow-[0_4px_24px_-4px_rgba(99,102,241,0.2)]',
    yellow: 'border-l-warning shadow-[0_4px_24px_-4px_rgba(245,158,11,0.2)]',
    pink: 'border-l-pink-500 shadow-[0_4px_24px_-4px_rgba(236,72,153,0.2)]',
    cyan: 'border-l-accent2 shadow-[0_4px_24px_-4px_rgba(20,184,166,0.2)]',
};

export function StatCard({ label, value, subValue, icon: Icon, color = 'purple', className }: StatCardProps) {
    return (
        <div className={cn(
            "bg-surface backdrop-blur-xl border border-border/50 rounded-2xl p-5 border-l-[3px] transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-[0_12px_32px_rgba(99,102,241,0.15)] group",
            COLORS[color] || 'border-l-accent',
            className
        )}>
            <div className="flex justify-between items-start mb-3">
                <span className="text-[11px] uppercase tracking-wider text-muted-dark font-semibold">{label}</span>
                {Icon && <Icon size={16} className="text-muted opacity-40 group-hover:opacity-70 transition-opacity" />}
            </div>
            <div className="text-[36px] font-bold leading-none text-text-bright tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {subValue && <div className="text-xs text-muted mt-2 font-medium">{subValue}</div>}
        </div>
    );
}
