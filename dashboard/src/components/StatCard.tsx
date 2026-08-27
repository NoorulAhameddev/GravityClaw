import { cn } from '../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: LucideIcon;
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'pink' | 'cyan' | 'default';
  className?: string;
}

export function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-border p-4 flex flex-col justify-between relative transition-colors duration-150 hover:border-border-bright group',
        className,
      )}
    >
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted font-medium">
          {label}
        </span>
        {Icon && (
          <Icon
            size={14}
            className="text-muted-dark group-hover:text-accent transition-colors"
          />
        )}
      </div>

      <div className="font-mono text-2xl font-bold text-text-bright tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {subValue && (
        <div className="font-mono text-[11px] text-muted-dark mt-2 pt-2 border-t border-border-subtle flex items-center justify-between">
          <span>{subValue}</span>
        </div>
      )}
    </div>
  );
}
