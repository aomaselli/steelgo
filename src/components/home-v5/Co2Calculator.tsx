import { useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { HomeLink } from "./HomeLink";
import { FUELS, KG_CO2_PER_TKM_DIESEL } from "./data";
import { useHomeCopy } from "./useHomeCopy";

type Fuel = (typeof FUELS)[number][0];
type Parsed = { ok: true; val: number } | { ok: false; err: string };

export { parseAmount } from "./parseAmount";
import { parseAmount } from "./parseAmount";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B89D4]";
const inputCls = "h-12 w-full rounded-[10px] border bg-[#111E33] pl-3 text-[16px] tabular-nums text-white outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#9FB4D4] focus:border-[#3B89D4] focus:shadow-[0_0_0_3px_rgba(59,137,212,.35)]";

export function Co2Calculator() {
  const { lang, c } = useHomeCopy();
  const t = c.calc;
  const locale = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR";
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);
  // State survives language switches (component is not remounted).
  const [dist, setDist] = useState("620");
  const [weight, setWeight] = useState("42");
  const [fuel, setFuel] = useState<Fuel>("b100");

  const base = { empty: t.empty, negative: t.negative, invalid: t.invalid };
  const dc = parseAmount(dist, 1, 5000, { ...base, range: t.distErr });
  const wc = parseAmount(weight, 1, 74, { ...base, range: t.weightErr });
  const ok = dc.ok && wc.ok;
  const fi = FUELS.findIndex((f) => f[0] === fuel);
  const ratio = FUELS[fi][1];
  const ref = ok ? dc.val * wc.val * KG_CO2_PER_TKM_DIESEL : 0;
  const val = ref * ratio;
  const red = ref - val;

  const onFuelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!n) return;
    e.preventDefault();
    const ni = (fi + n + FUELS.length) % FUELS.length;
    setFuel(FUELS[ni][0]);
    const grp = e.currentTarget;
    setTimeout(() => grp.querySelectorAll<HTMLButtonElement>("[role=radio]")[ni]?.focus(), 0);
  };

  const field = (id: string, label: string, unit: string, value: string, set: (v: string) => void, c: Parsed, max: number, padR: string) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium leading-[1.3] text-white">{label}</span>
      <span className="relative block">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => set(e.target.value.slice(0, max))}
          aria-invalid={!c.ok}
          aria-describedby={id}
          className={`${inputCls} ${padR} ${c.ok ? "border-[#29405F]" : "border-[#E5484D]"}`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#9FB4D4]">{unit}</span>
      </span>
      <span id={id} className={`flex min-h-[18px] items-center gap-1.5 text-[12px] leading-[1.4] ${c.ok ? "text-[#9FB4D4]" : "text-[#F87171]"}`}>
        {c.ok ? <Check size={13} /> : <CircleAlert size={13} />}
        {c.ok ? t.ok : c.err}
      </span>
    </label>
  );

  return (
    <section aria-labelledby="calc-title" className="text-white" style={{ background: "radial-gradient(circle at 85% 20%, rgba(26,155,94,.12), transparent 45%), #101C30" }}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-x-[clamp(28px,4cqi,64px)] gap-y-7 px-[clamp(20px,2.5cqi,32px)] py-[clamp(48px,5.5cqi,80px)]">
        <div className="min-w-0 max-w-[400px] flex-[1_1_300px]">
          <div className="text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#2ECC8A]">{t.eyebrow}</div>
          <h2 id="calc-title" style={{ fontWeight: "var(--home-heading-weight)" as never }} className="mt-3.5 text-[clamp(28px,2.6cqi,36px)] leading-[1.15] tracking-[-0.02em] text-white [text-wrap:balance]">{t.title}</h2>
          <p className="mt-3.5 text-[16px] leading-[1.6] text-[#B8C6D9] [text-wrap:pretty]">{t.sub}</p>
          <HomeLink to="esg" className={`mt-5 inline-flex min-h-11 items-center gap-2 rounded-sm text-[15px] font-semibold text-[#2FA98A] hover:text-white hover:underline ${focusRing} focus-visible:outline-offset-2`}>
            {t.link} <ArrowRight aria-hidden size={18} />
          </HomeLink>
        </div>

        <div className="min-w-0 flex-[1.7_1_560px] overflow-hidden rounded-xl border border-[#29405F] bg-[#0B1628] text-[#B8C6D9] shadow-[0_16px_40px_rgba(8,19,33,.45)]">
          <div className="flex flex-wrap">
            <form onSubmit={(e) => e.preventDefault()} className="flex min-w-0 flex-[1_1_280px] flex-col gap-[18px] border-r border-[#29405F] p-5">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-3">
                {field("co2-dist-msg", t.distance, "km", dist, setDist, dc, 9, "pr-11")}
                {field("co2-weight-msg", t.weight, "t", weight, setWeight, wc, 7, "pr-9")}
              </div>
              <div>
                <div id="co2-fuel-label" className="mb-2 text-[13px] font-medium leading-[1.3] text-white">{t.fuel}</div>
                <div role="radiogroup" aria-labelledby="co2-fuel-label" onKeyDown={onFuelKey} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,84px),1fr))] gap-1 rounded-[10px] border border-[#29405F] bg-[#111E33] p-1">
                  {FUELS.map(([key], i) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={fuel === key}
                      tabIndex={fuel === key ? 0 : -1}
                      onClick={() => setFuel(key)}
                      className={`min-h-10 rounded-[7px] px-2 py-1.5 text-[13px] font-medium leading-[1.25] transition-colors hover:text-white ${focusRing} focus-visible:outline-offset-1 ${
                        fuel === key ? "bg-[#1A9B5E] text-white" : "text-[#B8C6D9]"
                      }`}
                    >
                      {t.fuels[i]}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            <div aria-live="polite" className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 p-5">
              <div>
                <div className="text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#9FB4D4]">{t.result}</div>
                <div className="mt-2 flex items-baseline gap-2 tabular-nums">
                  <span className={`text-[clamp(40px,3.6cqi,52px)] font-medium leading-none tracking-[-0.03em] ${ok ? "text-white" : "text-[#29405F]"}`}>{ok ? fmt(val) : "—"}</span>
                  <span className="text-[16px] text-[#9FB4D4]">kg CO₂</span>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <div>
                  <div className="flex justify-between gap-3 text-[12px] leading-[1.4] text-white">
                    <span>{t.fuels[fi]}</span>
                    <span className="tabular-nums">{ok ? fmt(val) : "—"} kg</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-[#16263F]">
                    <div className={`h-full rounded transition-[width] duration-[250ms] ${fuel === "diesel" ? "bg-[#9FB4D4]" : "bg-[#2ECC8A]"}`} style={{ width: ok ? Math.max(2, Math.round(ratio * 100)) + "%" : "0%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between gap-3 text-[12px] leading-[1.4] text-[#9FB4D4]">
                    <span>{t.reference}</span>
                    <span className="tabular-nums">{ok ? fmt(ref) : "—"} kg</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-[#16263F]">
                    <div className="h-full rounded bg-[#29405F] transition-[width] duration-[250ms]" style={{ width: ok ? "100%" : "0%" }} />
                  </div>
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[#29405F] pt-3.5">
                <span className="text-[13px] leading-[1.4] text-[#B8C6D9]">{t.reduction}</span>
                <span className={`text-[20px] font-semibold leading-[1.2] tabular-nums ${ok && red > 0 ? "text-[#2ECC8A]" : "text-[#9FB4D4]"}`}>
                  {ok ? (red > 0 ? "−" + fmt(red) + " kg" : "0 kg") : "—"}
                </span>
              </div>

            </div>
          </div>
          <div className="border-t border-[#29405F] bg-[#111E33] px-5 py-2.5 text-[11px] leading-[1.4] text-[#9FB4D4]">{t.note}</div>
        </div>
      </div>
    </section>
  );
}
