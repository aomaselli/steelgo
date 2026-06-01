import { ReactNode } from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      {icon && (
        <div className="w-16 h-16 rounded-full bg-[#161B22] flex items-center justify-center text-[#484F58]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-[#C9D1D9]">{title}</h3>
      {description && <p className="text-sm text-[#484F58] max-w-xs">{description}</p>}
      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
