import { ReactNode } from 'react';

type Variant = 'default' | 'elevated' | 'highlighted' | 'green' | 'amber' | 'red';
type Padding = 'sm' | 'md' | 'lg';

export interface CardProps {
  variant?: Variant;
  padding?: Padding;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  default: 'bg-[#161B22] border border-[#30363D]',
  elevated: 'bg-[#1C2128] border border-[#30363D]',
  highlighted: 'bg-[#1B6CB8]/5 border border-[#1B6CB8]',
  green: 'bg-[#1A9B5E]/5 border border-[#1A9B5E]',
  amber: 'bg-[#CC8800]/5 border border-[#CC8800]',
  red: 'bg-red-900/10 border border-red-700',
};

const paddings: Record<Padding, string> = {
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
  children,
}: CardProps) {
  const interactive = onClick ? 'cursor-pointer hover:border-[#484F58] transition' : '';
  return (
    <div
      onClick={onClick}
      className={`rounded-[16px] transition-all ${variants[variant]} ${paddings[padding]} ${interactive} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`pb-3 border-b border-[#30363D] mb-3 flex items-center justify-between ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <div className={`flex-1 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <div className={`pt-3 border-t border-[#30363D] mt-3 ${className}`}>{children}</div>;
}
