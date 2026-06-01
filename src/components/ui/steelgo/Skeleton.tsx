export interface SkeletonProps {
  variant?: 'text' | 'card' | 'avatar' | 'table-row';
  className?: string;
}

const variants = {
  text: 'h-4 w-full rounded',
  card: 'h-32 w-full rounded-[16px]',
  avatar: 'w-10 h-10 rounded-full',
  'table-row': 'h-12 w-full rounded-[10px]',
};

export function Skeleton({ variant = 'text', className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-[#21262D] ${variants[variant]} ${className}`} />;
}
