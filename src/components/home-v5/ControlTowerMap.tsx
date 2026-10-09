import { useMemo, useState, type KeyboardEvent } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { CITIES, TRIPS } from "./data";
import { useHomeCopy } from "./useHomeCopy";

type Pt = [number, number];
function geo(path: string[]) {
  const pts = path.map((k) => [CITIES[k][0], CITIES[k][1]] as Pt);
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d); total += d;
  }
  return { pts, seg, total };
}
function at(g: ReturnType<typeof geo>, frac: number) {
  let d = g.total * frac;
  for (let i = 0; i < g.seg.length; i++) {
    if (d <= g.seg[i]) { const a = g.pts[i], b = g.pts[i + 1], f = d / g.seg[i]; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, i }; }
    d -= g.seg[i];
  }
  const l = g.pts[g.pts.length - 1];
  return { x: l[0], y: l[1], i: g.seg.length - 1 };
}
const pts = (arr: (number | string)[][]) => arr.map((p) => p[0] + "," + p[1]).join(" ");
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B89D4]";

// Illustrative coastline / roads (same geometry as the prototype)
const COAST = "600,118 556,106 545,127 529,147 518,205 464,258 404,261 338,264 295,290 229,320 191,340 142,381 109,411 104,434 100,840";

/** Control Tower — interactive illustrative map. Data is fictitious and labelled as such. */
export function ControlTowerMap({ width }: { width: number }) {
  const { lang, c } = useHomeCopy();
  const t = c.map;
  const cargo = c.cargo as Record<string, string>;
  const locale = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR";
  const [trip, setTrip] = useState(0);
  const [zoom, setZoom] = useState(1);
  const wide = width >= 760;

  const v = useMemo(() => {
    const geos = TRIPS.map((tr) => geo(tr.path));
    const sel = TRIPS[trip], g = geos[trip], pos = at(g, sel.p);
    const xs = g.pts.map((p) => p[0]), ys = g.pts.map((p) => p[1]);
    const pad = wide ? 70 : 50;
    const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
    const bw = Math.max(...xs) - Math.min(...xs) + pad * 2, bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const base = Math.max(bw / 1.6, bh);
    const vh = base / zoom, vw = vh * 1.6;
    const cx = zoom === 1 ? bx + bw / 2 : pos.x, cy = zoom === 1 ? by + bh / 2 : pos.y;
    const viewBox = `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
    const k = (vh / 340) * (wide ? 1 : 1.35);
    const markers = sel.path.map((key, i) => {
      const c = CITIES[key], first = i === 0, last = i === sel.path.length - 1;
      const done = i <= pos.i, isNext = i === pos.i + 1, right = c[0] < 520;
      return {
        key, x: c[0], y: c[1], r: (first || last ? 6 : 4.5) * k,
        fill: done && !first ? "#3B89D4" : "#0B1628",
        stroke: isNext ? "#F0A500" : done ? "#79B8F8" : "#9FB4D4",
        label: c[2], lx: c[0] + (right ? 10 : -10) * k - (right ? 0 : c[2].length * 6.4 * k), ly: c[1] + 4 * k,
        labelFill: isNext ? "#F0A500" : first || last ? "#FFFFFF" : "#B8C6D9",
        weight: first || last || isNext ? 600 : 400,
      };
    });
    const done = [...g.pts.slice(0, pos.i + 1), [pos.x.toFixed(1), pos.y.toFixed(1)]];
    const nextKey = sel.path[Math.min(pos.i + 1, sel.path.length - 1)];
    return { geos, sel, g, pos, viewBox, k, markers, done, nextKey };
  }, [trip, zoom, wide]);

  const { sel, pos, k } = v;
  const pct = Math.round(sel.p * 100) + "%";
  const routeName = (path: string[]) => CITIES[path[0]][2] + " → " + CITIES[path[path.length - 1]][2];
  const onListKey = (e: KeyboardEvent) => {
    const n = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!n) return;
    e.preventDefault();
    setTrip((trip + n + TRIPS.length) % TRIPS.length);
    setZoom(1);
  };

  return (
    <div role="region" aria-label={t.title} className="min-w-0 flex-[1.55_1_560px] overflow-hidden rounded-xl border border-[#29405F] bg-[#0B1628] text-[#B8C6D9] shadow-[0_16px_40px_rgba(8,19,33,.45)]">
      <div className="flex h-11 items-center justify-between gap-3 border-b border-[#29405F] bg-[#111E33] px-4">
        <span className="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap">
          <span className="text-[13px] font-semibold text-white">{t.product}</span>
          <span className="truncate text-[13px] text-[#9FB4D4]">{t.title}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] leading-none text-[#79B8F8]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3B89D4]" />
          {t.live}
        </span>
      </div>

      <div className="flex flex-wrap">
        {wide ? (
          <div role="listbox" aria-label={t.trips} onKeyDown={onListKey} className="flex flex-[0_0_228px] flex-col gap-1.5 border-r border-[#29405F] p-3">
            <div className="px-1.5 pb-1.5 pt-0.5 text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#9FB4D4]">{t.trips}</div>
            {TRIPS.map((tr, i) => (
              <button
                key={tr.id}
                type="button"
                role="option"
                aria-selected={i === trip}
                onClick={() => { setTrip(i); setZoom(1); }}
                className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-[#111E33] ${focusRing} focus-visible:outline-offset-1 ${
                  i === trip ? "border-[#3B89D4] bg-[rgba(59,137,212,.16)]" : "border-transparent"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2 font-mono text-[12px] leading-[1.3]">
                  <span className="text-[#79B8F8]">{tr.id}</span>
                  <span className="text-[#9FB4D4]">{Math.round(tr.p * 100)}%</span>
                </span>
                <span className="text-[13px] font-medium leading-[1.35] text-white">{routeName(tr.path)}</span>
                <span className="text-[12px] leading-[1.35] text-[#9FB4D4]">{cargo[tr.id]} · {tr.t} t</span>
              </button>
            ))}
          </div>
        ) : (
          <div role="listbox" aria-label={t.trips} onKeyDown={onListKey} className="grid flex-[1_1_100%] grid-cols-3 gap-1.5 border-b border-[#29405F] p-2.5">
            {TRIPS.map((tr, i) => (
              <button
                key={tr.id}
                type="button"
                role="option"
                aria-selected={i === trip}
                onClick={() => { setTrip(i); setZoom(1); }}
                className={`min-h-11 rounded-lg border px-2 py-1.5 font-mono text-[12px] ${focusRing} ${i === trip ? "border-[#3B89D4] bg-[rgba(59,137,212,.16)] text-white" : "border-transparent text-[#B8C6D9]"}`}
              >
                {tr.id}
              </button>
            ))}
          </div>
        )}

        <div className={`relative min-w-0 flex-[1_1_320px] overflow-hidden bg-[#0B1628] ${wide ? "h-[340px]" : "h-[240px]"}`}>
          <svg
            viewBox={v.viewBox}
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label={t.aria.replace("{r}", routeName(sel.path).replace(" → ", " – ")).replace("{p}", pct)}
            className="absolute inset-0 block h-full w-full"
          >
            <defs>
              <pattern id="sgHomeGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="#16263F" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="-400" y="-400" width="1400" height="1240" fill="url(#sgHomeGrid)" />
            <path d={`M${COAST.replace(/ /g, " L")} L1000 840 L1000 118 Z`} fill="#081321" />
            <polyline points={COAST} fill="none" stroke="#29405F" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <polyline points="404,261 358,83" fill="none" stroke="#16263F" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            <polyline points="404,261 211,296" fill="none" stroke="#16263F" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            <polyline points="556,96 434,57 358,83" fill="none" stroke="#16263F" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            {v.geos.map((gg, i) => i !== trip && (
              <polyline key={i} points={pts(gg.pts)} fill="none" stroke="#29405F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            <polyline points={pts(v.g.pts)} fill="none" stroke="#3B89D4" strokeOpacity=".45" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <polyline points={pts(v.done)} fill="none" stroke="#3B89D4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {v.markers.map((m) => (
              <circle key={m.key} cx={m.x} cy={m.y} r={m.r} fill={m.fill} stroke={m.stroke} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            ))}
            <g aria-hidden="true" style={{ fontFamily: "var(--home-font)" }}>
              <text x={410} y={278} fill="#5B6B80" fontSize={(11.5 * k).toFixed(2)} fontWeight={500}>Rio de Janeiro</text>
              {v.markers.map((m) => (
                <text key={m.key} x={m.lx} y={m.ly} fill={m.labelFill} fontSize={(11.5 * k).toFixed(2)} fontWeight={m.weight}>{m.label}</text>
              ))}
            </g>
            <circle cx={pos.x} cy={pos.y} r={18 * k} fill="#3B89D4" fillOpacity=".18">
              <animate attributeName="fill-opacity" values=".28;.06;.28" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={pos.x} cy={pos.y} r={7 * k} fill="#FFFFFF" stroke="#1B6CB8" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>

          <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-[#29405F] bg-[#111E33]">
            <button type="button" onClick={() => setZoom(Math.min(2, zoom + 0.5))} disabled={zoom >= 2} aria-label={t.zoomIn} className={`flex h-9 w-9 items-center justify-center border-b border-[#29405F] hover:bg-[#16263F] disabled:cursor-default ${zoom >= 2 ? "text-[#29405F]" : "text-[#E7EDF5]"} ${focusRing} focus-visible:-outline-offset-2`}>
              <Plus size={16} />
            </button>
            <button type="button" onClick={() => setZoom(Math.max(1, zoom - 0.5))} disabled={zoom <= 1} aria-label={t.zoomOut} className={`flex h-9 w-9 items-center justify-center hover:bg-[#16263F] disabled:cursor-default ${zoom <= 1 ? "text-[#29405F]" : "text-[#E7EDF5]"} ${focusRing} focus-visible:-outline-offset-2`}>
              <Minus size={16} />
            </button>
          </div>
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md border border-[#29405F] bg-[rgba(8,19,33,.9)] px-2.5 py-[5px] text-[12px] leading-[1.3] text-[#B8C6D9]">
            <Check size={13} className="text-[#2ECC8A]" />
            {t.deviation}
          </div>
        </div>
      </div>

      <div aria-live="polite" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-x-6 gap-y-3 border-t border-[#29405F] bg-[#111E33] px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#79B8F8]">{sel.id}</span>
            <span className="rounded-full bg-[#1B6CB8]/20 px-2.5 py-1 text-[12px] text-[#79B8F8]">{lang === "pt" ? "Em trânsito" : lang === "es" ? "En tránsito" : "In transit"}</span>
          </div>
          <div className="mt-1 text-[14px] font-semibold leading-[1.35] text-white">{routeName(sel.path)}</div>
          <div className="text-[12px] leading-[1.4] text-[#9FB4D4]">{cargo[sel.id]} · {sel.t} t · {sel.km.toLocaleString(locale)} km</div>
        </div>
        <div className="min-w-0">
          <div className="flex justify-between text-[12px] leading-[1.4] text-[#9FB4D4]">
            <span>{t.progress}</span>
            <span className="tabular-nums text-white">{pct}</span>
          </div>
          <div className="mt-2 h-1 rounded bg-[#29405F]">
            <div className="h-full rounded bg-[#3B89D4] transition-[width] duration-[250ms] ease-[ease]" style={{ width: pct }} />
          </div>
          <div className="mt-2 text-[12px] leading-[1.4] text-[#9FB4D4]">{t.updated.replace("{s}", String(sel.s))}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] leading-[1.4] text-[#9FB4D4]">{t.next}</div>
          <div className="mt-0.5 text-[14px] font-semibold leading-[1.35] text-[#F0A500]">{CITIES[v.nextKey][2]}</div>
          <div className="text-[12px] leading-[1.4] text-[#9FB4D4]">
            {t.eta} <span className="tabular-nums text-white">{sel.eta}</span>
          </div>
        </div>
      </div>
      <div className="border-t border-[#29405F] px-4 py-2 text-[11px] leading-[1.4] text-[#9FB4D4]">{t.illustrative}</div>
    </div>
  );
}
