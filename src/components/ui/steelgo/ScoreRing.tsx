export interface ScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { px: 48, text: 'text-sm' },
  md: { px: 72, text: 'text-base' },
  lg: { px: 96, text: 'text-xl' },
};

function colorFor(score: number) {
  if (score >= 8.5) return '#1A9B5E';
  if (score >= 7.0) return '#1B6CB8';
  if (score >= 5.0) return '#CC8800';
  return '#C23333';
}

export function ScoreRing({ score, size = 'md' }: ScoreRingProps) {
  const { px, text } = sizes[size];
  const clamped = Math.max(0, Math.min(10, score));
  const stroke = 6;
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 10);
  const color = colorFor(clamped);

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: px, height: px }}>
      <svg width={px} height={px} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke="#21262D"
          strokeWidth={stroke}
        />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-medium ${text}`}
        style={{ color, fontWeight: 500 }}
      >
        {clamped.toFixed(1)}
      </span>
    </span>
  );
}
