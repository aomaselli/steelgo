import { useEffect } from "react";
import { MENU, NAV_SLUGS, PILLAR_PATH, type NavSlug } from "./data";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter, StoreBadges } from "./SiteFooter";
import { Co2Calculator } from "./Co2Calculator";
import { HomeLink } from "./HomeLink";
import { useHomeCopy } from "./useHomeCopy";
import { useElementWidth } from "./useElementWidth";
import "./home-v5.css";

const UI = {
  pt: {home:"Início", category:"Nesta categoria", also:"Também em", pillars:"Os 11 pilares da plataforma"},
  en: {home:"Home", category:"In this category", also:"Also in", pillars:"The 11 platform pillars"},
  es: {home:"Inicio", category:"En esta categoría", also:"También en", pillars:"Los 11 pilares de la plataforma"},
};

/** Public information pages from the approved prototype; operational tools remain in the dashboards. */
export function InnerPage({path}: {path:string}) {
  const {c, lang} = useHomeCopy();
  const [ref,width] = useElementWidth<HTMLDivElement>();
  const pages = c.pages as {titles:Record<string,string>; descriptions:Record<string,string>; categoryOverview:Record<string,string>};
  const category = path.split("/")[0] as NavSlug;
  const label = c.nav[NAV_SLUGS.indexOf(category)];
  const overview = path === category;
  const title = overview ? label : pages.titles[path];
  const description = overview ? pages.categoryOverview[category] : pages.descriptions[path];
  const ui = UI[lang];
  const cards = path === "sobre/pilares" ? Object.values(PILLAR_PATH).map(path => ({path})) : MENU[category].filter(item => item.path !== path);
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
    document.title = `${title} | SteelGo`;
  }, [lang,title]);
  return <div ref={ref} className="home-v5 relative min-h-screen bg-[#101C30] text-white">
    <SiteHeader width={width}/>
    <main>
      <section className="bg-[linear-gradient(120deg,#172D4E,#101C30)]">
        <div className="mx-auto max-w-[1280px] px-5 py-12 md:px-8 md:py-16">
          <nav aria-label={ui.home} className="mb-8 flex flex-wrap items-center gap-3 text-sm text-[#B8C6D9]">
            <HomeLink to="">{ui.home}</HomeLink><span aria-hidden>›</span>
            {!overview && <><HomeLink to={category}>{label}</HomeLink><span aria-hidden>›</span></>}
            <span aria-current="page" className="text-white">{title}</span>
          </nav>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#2FA98A]">{label}</p>
          <h1 className="text-[clamp(32px,4cqi,52px)] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-5 max-w-[900px] text-lg leading-relaxed text-[#B8C6D9]">{description}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <HomeLink to="register" className="rounded-[10px] bg-[#1E8168] px-6 py-4 font-semibold hover:bg-[#176D57]">{c.cta}</HomeLink>
            {!overview && <HomeLink to={category} className="rounded-[10px] border border-[#29405F] px-6 py-4 font-semibold hover:border-[#2FA98A]">{`${c.ui.overviewOf} ${label}`}</HomeLink>}
          </div>
          {path === "tecnologia/driver-app" && <div className="mt-8"><StoreBadges/></div>}
        </div>
      </section>
      {path === "esg/calculadora" ? <Co2Calculator/> : cards.length > 0 && <section className="border-t border-[#29405F] bg-[#0B1628]">
        <div className="mx-auto max-w-[1280px] px-5 py-12 md:px-8 md:py-16">
          <h2 className="mb-7 text-2xl font-semibold">{path === "sobre/pilares" ? ui.pillars : overview ? ui.category : `${ui.also} ${label}`}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(item => <article key={item.path} className="flex flex-col rounded-2xl border border-[#29405F] bg-[#111E33] p-6">
              <h3 className="text-xl font-semibold">{item.path === "register" ? c.cta : pages.titles[item.path]}</h3>
              <p className="mt-3 mb-6 text-base leading-relaxed text-[#B8C6D9]">{pages.descriptions[item.path]}</p>
              <HomeLink to={item.path} className="mt-auto flex justify-between border-t border-[#29405F] pt-4 font-semibold text-[#2FA98A] hover:underline">{c.sol.action}<span aria-hidden>→</span></HomeLink>
            </article>)}
          </div>
        </div>
      </section>}
    </main>
    <SiteFooter/>
  </div>;
}
