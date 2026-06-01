import { ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: Size;
  children?: ReactNode;
}

const sizes: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Modal({ isOpen, onClose, title, size = 'md', children }: ModalProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShown(false);
      return;
    }
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-150 ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#1C2128] border border-[#30363D] rounded-[16px] w-full shadow-2xl transition-transform duration-150 ${
          sizes[size]
        } ${shown ? 'scale-100' : 'scale-95'}`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between p-5 border-b border-[#30363D]">
            <h2 className="text-lg font-semibold text-[#E6EDF3]">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X size={18} />
            </Button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
