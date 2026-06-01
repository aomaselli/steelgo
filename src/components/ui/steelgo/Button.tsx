import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'green' | 'danger' | 'amber';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-[#1B6CB8] hover:bg-[#3B89D4] text-white',
  secondary: 'border border-[#30363D] hover:bg-[#1C2128] text-[#C9D1D9]',
  ghost: 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#1C2128]',
  green: 'bg-[#1A9B5E] hover:bg-[#2ECC8A] text-white',
  danger: 'bg-red-900/40 hover:bg-red-800/60 text-red-400',
  amber: 'bg-[#CC8800]/20 border border-[#CC8800]/40 text-[#F0A500]',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2',
  xl: 'px-6 py-3.5 text-base gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading,
  leftIcon,
  rightIcon,
  fullWidth,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'flex items-center font-medium transition-all duration-150 rounded-[10px]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    fullWidth ? 'w-full justify-center' : '',
    className,
  ].join(' ');

  return (
    <button type={type} disabled={disabled || isLoading} className={cls} {...rest}>
      {isLoading ? (
        <Loader2 className="animate-spin" size={16} />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}
