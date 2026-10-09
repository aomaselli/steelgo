import { ArrowRight } from "lucide-react";
import { HomeLink } from "./HomeLink";
import { destination, HIDE_PENDING } from "./routes";
import { AUD_PATHS, HOME_SOLUTIONS, PILLAR_PATH } from "./data";
import { useHomeCopy } from "./useHomeCopy";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B89D4] focus-visible:outline-offset-2";

export function PlatformSection({ width }: { width: number }) {
  const { c } = useHomeCopy();
  const t = c.sol;
  const pages = c.pages as { titles: Record<string, string>; descriptions: Record<string, string> };
  const cols = width >= 1024 ? "grid-cols-3" : width >= 640 ? "grid-cols-2" : "grid-cols-1";
  const cards = HOME_SOLUTIONS.filter(([slug]) => !(HIDE_PENDING && destination(PILLAR_PATH[slug]).pending));
  return (
    <section aria-labelledby="sol-title" className="border-y border-[#29405F] bg-[#0B1628] text-white">
      <div className="mx-auto max-w-[1280px] px-[clamp(20px,2.5cqi,32px)] py-[clamp(48px,5.5cqi,80px)]">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="min-w-0 max-w-[680px] flex-[1_1_420px]">
            <div className="text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#2FA98A]">{t.eyebrow}</div>
            <h2 id="sol-title" style={{ fontWeight: "var(--home-heading-weight)" as never }} className="mt-3.5 text-[clamp(28px,2.8cqi,40px)] leading-[1.12] tracking-[-0.025em] text-white [text-wrap:balance]">{t.title}</h2>
            <p className="mt-3.5 max-w-[560px] text-[17px] leading-[1.6] text-[#B8C6D9] [text-wrap:pretty]">{t.sub}</p>
          </div>
          <HomeLink to="solucoes" className={`inline-flex h-12 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-[#1E8168] px-[22px] text-[16px] font-semibold text-white transition-shadow hover:text-white hover:shadow-[inset_0_0_0_999px_rgba(8,19,33,.18)] active:shadow-[inset_0_0_0_999px_rgba(8,19,33,.3)] ${focusRing}`}>
            {t.all} <ArrowRight aria-hidden size={18} />
          </HomeLink>
        </div>

        <div className={`mt-[clamp(28px,3cqi,40px)] grid gap-4 ${cols}`}>
          {cards.map(([slug, group]) => (
            <HomeLink
              key={slug}
              to={PILLAR_PATH[slug]}
              className={`flex min-w-0 flex-col rounded-xl border border-[#29405F] bg-[#111E33] px-5 pt-5 text-white transition-colors hover:border-[#9FB4D4] hover:bg-[#16263F] hover:text-white active:border-[#2FA98A] active:bg-[#101C30] ${focusRing}`}
            >
              <span className="text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#9FB4D4]">{(t.groups as Record<string, string>)[group]}</span>
              <span className="mt-2.5 text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-white">{pages.titles[PILLAR_PATH[slug]]}</span>
              <span className="mt-2 flex-1 text-[14px] leading-[1.55] text-[#B8C6D9]">{pages.descriptions[PILLAR_PATH[slug]]}</span>
              <span className="mt-5 flex h-[52px] flex-none items-center justify-between gap-3 border-t border-[#29405F] text-[14px] font-semibold text-[#2FA98A]">
                {t.action}
                <ArrowRight aria-hidden size={18} />
              </span>
            </HomeLink>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <span className="mr-1 text-[14px] font-semibold text-[#B8C6D9]">{t.audiences}</span>
          {t.aud.map((label, i) => (
            <HomeLink
              key={label}
              to={AUD_PATHS[i]}
              className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[10px] border border-[#9FB4D4] px-[18px] text-[14px] font-semibold text-white transition-colors hover:border-white hover:bg-[#111E33] hover:text-white active:bg-[#16263F] ${focusRing}`}
            >
              {label}
            </HomeLink>
          ))}
        </div>
      </div>
    </section>
  );
}
