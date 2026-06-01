export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

const sizeMap = { sm: 16, md: 24, lg: 32 };

export function Spinner({ size = 'md', color = '#3B89D4', className = '' }: SpinnerProps) {
  const px = sizeMap[size];
  return (
    <span
      className={`animate-spin rounded-full border-2 border-current border-t-transparent inline-block ${className}`}
      style={{ width: px, height: px, color }}
    />
  );
}
