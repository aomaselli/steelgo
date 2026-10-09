import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLanguage, type Language } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HomeLink } from "./HomeLink";
import { STORE, WHATSAPP_URL } from "./routes";
import { NAV_SLUGS, PILLAR_PATH } from "./data";
import { useHomeCopy } from "./useHomeCopy";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B89D4] focus-visible:outline-offset-2";

// Official store badges, served locally from /public/badges (see README → Assets).
const BADGES: Record<Language, { label: string; apple: string; play: string; playPadded?: boolean; cc: string; hl: string; aAlt: string; gAlt: string }> = {
  pt: { label: "Baixe o app do motorista", apple: "/badges/app-store-pt-br.svg", play: "/badges/google-play-pt-br.svg", cc: "br", hl: "pt_BR", aAlt: "Baixar na App Store", gAlt: "Disponível no Google Play" },
  en: { label: "Get the driver app", apple: "/badges/app-store-en-us.svg", play: "/badges/google-play-en.svg", cc: "us", hl: "en", aAlt: "Download on the App Store", gAlt: "Get it on Google Play" },
  // ES Google Play: the official es-419 badge is a PNG with built-in padding (cropped to 48 px visual height).
  es: { label: "Descarga la app del conductor", apple: "/badges/app-store-es-mx.svg", play: "/badges/google-play-es-419.png", playPadded: true, cc: "mx", hl: "es_419", aAlt: "Descargar en App Store", gAlt: "Disponible en Google Play" },
};

export function StoreBadges() {
  const { language: lang } = useLanguage();
  const b = BADGES[lang];
  const [playFallback, setPlayFallback] = useState(false);
  const iosHref = STORE.iosAppId ? `https://apps.apple.com/${b.cc}/app/steelgo-driver/id${STORE.iosAppId}` : undefined;
  const playHref = STORE.androidPackage ? `https://play.google.com/store/apps/details?id=${STORE.androidPackage}&hl=${b.hl}` : undefined;
  const padded = b.playPadded && !playFallback;
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#9FB4D4]">{b.label}</span>
      <div role="group" aria-label={b.label} className="flex flex-wrap items-center gap-4">
        <a href={iosHref} target="_blank" rel="noopener" data-integration-pending={!iosHref || undefined} className={`inline-flex h-12 flex-none items-center rounded-[9px] hover:opacity-[.88] ${focusRing} focus-visible:outline-offset-[3px]`}>
          <img src={b.apple} alt={b.aAlt} height={48} className="block h-12 w-auto" />
        </a>
        <a href={playHref} target="_blank" rel="noopener" data-integration-pending={!playHref || undefined} className={`inline-flex h-12 flex-none items-center overflow-hidden rounded-[9px] hover:opacity-[.88] ${focusRing} focus-visible:outline-offset-[3px]`}>
          <img
            src={playFallback ? BADGES.en.play : b.play}
            onError={() => setPlayFallback(true)}
            alt={b.gAlt}
            height={padded ? 70 : 48}
            className={`block w-auto ${padded ? "-mx-2.5 -my-[11px] h-[70px]" : "h-12"}`}
          />
        </a>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { c } = useHomeCopy();
  const pages = c.pages as { titles: Record<string, string> };
  const nav = (i: number) => ({ label: c.nav[i], to: NAV_SLUGS[i] as string });
  const cols = [
    { title: c.foot.cols[0], links: [nav(0), nav(1), nav(4), nav(5), { label: pages.titles[PILLAR_PATH["open-api"]], to: PILLAR_PATH["open-api"] }] },
    { title: c.foot.cols[1], links: [nav(6), nav(7), nav(8)] },
    { title: c.foot.cols[2], links: [{ label: c.foot.legal[0], to: "termos" }, { label: c.foot.legal[1], to: "privacidade" }, { label: c.foot.legal[2], to: "cookies" }] },
  ];
  return (
    <footer className="border-t border-[#29405F] bg-[#081321] text-[#E7EDF5]">
      <div className="mx-auto max-w-[1280px] px-[clamp(20px,2.5cqi,32px)] pb-7 pt-10">
        <div className="flex flex-wrap justify-between gap-x-12 gap-y-8">
          <div className="min-w-0 max-w-[360px] flex-[1_1_340px]">
            <BrandLogo surface="dark" className="h-8 w-auto" />
            <p className="mt-3 text-[14px] leading-[1.5] text-[#B8C6D9]">{c.foot.tagline}</p>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener" className={`mt-3.5 inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[#29405F] bg-[#111E33] px-3.5 text-[14px] font-medium text-[#E7EDF5] transition-colors hover:border-[#2FA98A] hover:text-[#E7EDF5] ${focusRing}`}>
              <MessageCircle aria-hidden size={16} />
              {c.foot.contact}
            </a>
            <div className="mt-6 border-t border-[#29405F] pt-5">
              <StoreBadges />
            </div>
          </div>
          <div className="grid flex-[2_1_420px] grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))] gap-6">
            {cols.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <div className="mb-2.5 text-[12px] font-semibold uppercase leading-[1.3] tracking-[.08em] text-[#9FB4D4]">{col.title}</div>
                <div className="flex flex-col">
                  {col.links.map((lk) => (
                    <HomeLink key={lk.to} to={lk.to} className={`rounded-sm py-1 text-[14px] leading-[1.5] text-[#E7EDF5] hover:text-[#2FA98A] hover:underline ${focusRing}`}>
                      {lk.label}
                    </HomeLink>
                  ))}
                </div>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-8 border-t border-[#29405F] pt-5 text-[12px] leading-[1.4] text-[#9FB4D4]">© 2026 SteelGo · São Paulo, Brasil</div>
      </div>
    </footer>
  );
}
