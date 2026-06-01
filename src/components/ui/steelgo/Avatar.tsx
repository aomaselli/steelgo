export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  badge?: string;
  className?: string;
}

const sizes = {
  sm: { px: 32, text: 'text-xs' },
  md: { px: 40, text: 'text-sm' },
  lg: { px: 48, text: 'text-base' },
};

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, src, size = 'md', badge, className = '' }: AvatarProps) {
  const { px, text } = sizes[size];
  return (
    <span className={`relative inline-block ${className}`} style={{ width: px, height: px }}>
      {src ? (
        <img
          src={src}
          alt={name ?? 'avatar'}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span
          className={`w-full h-full rounded-full bg-[#0D2744] text-[#3B89D4] flex items-center justify-center font-medium ${text}`}
        >
          {initials(name)}
        </span>
      )}
      {badge && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-[#0D1117]"
          style={{ width: 8, height: 8, backgroundColor: badge }}
        />
      )}
    </span>
  );
}
