import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/steel";

export function Hero() {
  const { t, raw } = useLanguage();
  return (
    <section id="top" className="relative overflow-hidden border-b border-graphite-800 bg-bg-base">
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in oklch, var(--color-steel-blue-400) 25%, transparent), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-graphite-700 bg-bg-surface px-3 py-1 text-xs font-medium text-graphite-200">
            {t("hero.eyebrow")}
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-graphite-50 md:text-6xl">
            {t("hero.headline")}
            <br />
            <span className="text-steel-blue-400">{t("hero.headlineAccent")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-graphite-300 md:text-lg">
            {t("hero.subheadline")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register" search={{ role: "shipper" }}>
              <Button size="xl">
                {t("hero.ctaPrimary")} <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/register" search={{ role: "carrier" }}>
              <Button size="xl" variant="outline">{t("hero.ctaSecondary")}</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-graphite-400">{t("hero.trustLine")}</p>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Object.values(raw.hero.stats).map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-graphite-800 bg-bg-surface p-5 text-center"
            >
              <div className="text-2xl font-bold text-steel-blue-400 md:text-3xl">{s.value}</div>
              <div className="mt-1 text-xs text-graphite-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
