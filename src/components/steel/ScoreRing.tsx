export function ScoreRing({ score = 0, size = 48 }: { score?: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const stroke = size <= 24 ? 3 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = pct >= 80 ? "var(--esg-green-400)" : pct >= 60 ? "var(--amber-400)" : "var(--graphite-200)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--graphite-700)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-graphite-50 font-semibold tabular-nums" style={{ fontSize: size * 0.3 }}>
        {Math.round(pct)}
      </span>
    </div>
  );
}
