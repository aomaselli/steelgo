import { ControlTowerMap } from "./ControlTowerMap";
import { HomeLink } from "./HomeLink";
import { useHomeCopy } from "./useHomeCopy";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B89D4] focus-visible:outline-offset-2";

export function HeroSection({ width }: { width: number }) {
  const t = useHomeCopy().c.hero;
  return (
    <section
      aria-labelledby="hero-title"
      className="text-white"
      style={{ background: "radial-gradient(circle at 18% 10%, rgba(41,96,172,.28), transparent 48%), radial-gradient(circle at 88% 85%, rgba(26,155,94,.12), transparent 42%), #101C30" }}
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-[clamp(28px,4cqi,64px)] px-[clamp(20px,2.5cqi,32px)] pb-[clamp(44px,5cqi,72px)] pt-[clamp(36px,4.5cqi,64px)]">
        <div className="min-w-0 max-w-[520px] flex-[1_1_360px]">
          <div className="text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#2FA98A]">{t.eyebrow}</div>
          <h1 id="hero-title" style={{ fontWeight: "var(--home-display-weight)" as never }} className="mt-4 text-[clamp(38px,4.4cqi,62px)] leading-[1.04] tracking-[-0.035em] text-white [text-wrap:balance]">
            {t.title1}
            <span className="text-[#9FB4D4]">{t.title2}</span>
          </h1>
          <p className="mt-5 max-w-[460px] text-[clamp(17px,1.3cqi,18px)] leading-[1.6] text-[#B8C6D9] [text-wrap:pretty]">{t.sub}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <HomeLink to="register" className={`inline-flex h-12 items-center justify-center whitespace-nowrap rounded-[10px] bg-[#1E8168] px-[22px] text-[16px] font-semibold text-white transition-shadow hover:text-white hover:shadow-[inset_0_0_0_999px_rgba(8,19,33,.18)] ${focusRing}`}>
              {t.primary}
            </HomeLink>
            <HomeLink to="login" className={`inline-flex h-12 items-center justify-center whitespace-nowrap rounded-[10px] border border-[#29405F] px-[22px] text-[16px] font-semibold text-white transition-colors hover:border-[#9FB4D4] hover:bg-[#111E33] hover:text-white ${focusRing}`}>
              {t.secondary}
            </HomeLink>
          </div>
        </div>
        <ControlTowerMap width={width} />
      </div>
    </section>
  );
}
