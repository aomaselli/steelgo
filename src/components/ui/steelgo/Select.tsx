import { SelectHTMLAttributes, ReactNode, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, leftIcon, required, className = '', disabled, children, ...rest },
  ref,
) {
  const base =
    'appearance-none w-full bg-[#21262D] border rounded-[10px] px-3 py-2.5 text-[#E6EDF3] text-sm outline-none cursor-pointer transition-all';
  const state = error
    ? 'border-red-500 ring-1 ring-red-500/30'
    : 'border-[#30363D] focus:border-[#1B6CB8] focus:ring-1 focus:ring-[#1B6CB8]/30';
  const disabledCls = disabled ? 'opacity-50 cursor-not-allowed' : '';
  const padL = leftIcon ? 'pl-9' : '';

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm text-[#C9D1D9] font-medium">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-[#484F58] text-base flex items-center pointer-events-none">
            {leftIcon}
          </span>
        )}
        <select
          ref={ref}
          required={required}
          disabled={disabled}
          className={`${base} ${state} ${disabledCls} ${padL} pr-9 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <span className="absolute right-3 text-[#484F58] pointer-events-none flex items-center">
          <ChevronDown size={16} />
        </span>
      </div>
      {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
      {!error && hint && <p className="text-xs text-[#484F58] mt-0.5">{hint}</p>}
    </div>
  );
});
