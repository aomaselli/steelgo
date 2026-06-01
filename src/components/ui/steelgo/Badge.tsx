import { ReactNode } from 'react';

type Variant = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple';
type Size = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
  className?: string;
}

const variants: Record<Variant, string> = {
  blue: 'bg-[#1B6CB8]/15 text-[#3B89D4] border-[#1B6CB8]/30',
  green: 'bg-[#1A9B5E]/15 text-[#2ECC8A] border-[#1A9B5E]/30',
  amber: 'bg-[#CC8800]/15 text-[#F0A500] border-[#CC8800]/30',
  red: 'bg-red-900/30 text-red-400 border-red-700/30',
  gray: 'bg-[#21262D] text-[#8B949E] border-[#30363D]',
  purple: 'bg-purple-900/30 text-purple-400 border-purple-700/30',
};

const sizes: Record<Size, string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

export function Badge({ variant = 'gray', size = 'sm', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium border ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}
