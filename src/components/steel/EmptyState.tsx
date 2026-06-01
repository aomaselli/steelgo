import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-graphite-700 bg-bg-surface/50 px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 rounded-full bg-bg-elevated p-3 text-steel-blue-400">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-graphite-50">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-graphite-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
