import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Globe, Menu, X } from "lucide-react";
import { useLanguage, type Language } from "@/lib/i18n";
import { HOME_I18N } from "@/lib/i18n.home";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HomeLink } from "./HomeLink";
import { destination, HIDE_PENDING } from "./routes";
import { MENU, NAV_NEED, NAV_SLUGS, type NavSlug } from "./data";

const LANGS: Language[] = ["pt", "en", "es"];
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3B89D4]";

function menuItems(slug: NavSlug, lang: Language) {
  const p = HOME_I18N[lang].pages as { titles: Record<string, string>; descriptions: Record<string, string>; menuDescriptions: Record<string, string>; menuLabels: Record<string, string> };
  return MENU[slug]
    .filter((it) => !(HIDE_PENDING && destination(it.path).pending))
    .map((it) => ({
      path: it.path,
      name: p.menuLabels[it.path] ?? p.titles[it.path] ?? it.path,
      desc: p.menuDescriptions[it.path] ?? p.descriptions[it.path] ?? "",
    }));
}

export function SiteHeader({ width }: { width: number }) {
  const { language: lang, setLanguage } = useLanguage();
  const t = HOME_I18N[lang];
  const ui = t.ui;
  const LANG_NAMES = t.langNames as Record<Language, string>;
  const [openCat, setOpenCat] = useState<NavSlug | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerCat, setDrawerCat] = useState<NavSlug | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const langBtnRef = useRef<HTMLButtonElement>(null);

  // Deterministic rule: full header only when the container fits it for the active language.
  // Safety net: if the row still overflows (e.g. font fallback), switch to compact too.
  const compact = width < NAV_NEED[lang] || overflowing;
  const showActions = width >= 720;

  useEffect(() => setOverflowing(false), [lang, width]);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || compact) return;
    const check = () => { if (row.scrollWidth > row.clientWidth + 1) setOverflowing(true); };
    check();
    const ro = new ResizeObserver(() => setTimeout(check, 0));
    ro.observe(row);
    if (navRef.current) ro.observe(navRef.current);
    document.fonts?.ready.then(() => setTimeout(check, 0));
    return () => ro.disconnect();
  }, [compact, lang]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // One submenu at a time; close on outside click / Escape (focus returns to the trigger).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (openCat && navRef.current && !navRef.current.contains(target)) setOpenCat(null);
      if (langOpen && langRef.current && !langRef.current.contains(target)) setLangOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openCat) { const k = openCat; setOpenCat(null); triggerRefs.current[k]?.focus(); }
      if (langOpen) { setLangOpen(false); langBtnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openCat, langOpen]);

  useEffect(() => { if (!compact) setDrawer(false); }, [compact]);

  const closeAll = useCallback(() => { setOpenCat(null); setLangOpen(false); setDrawer(false); }, []);
  const pickLang = (l: Language) => { setLanguage(l); setLangOpen(false); langBtnRef.current?.focus(); };
  const solid = scrolled || drawer;

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-[8px] transition-colors duration-200 ${
        solid ? "border-[#E6EAF0] bg-white/95" : "border-transparent bg-[#F7F9FB]"
      }`}
    >
      <div ref={rowRef} className="mx-auto flex h-16 max-w-[1440px] items-center gap-[10px] px-4">
        <HomeLink to="" aria-label="SteelGo" className={`flex flex-none rounded-md ${focusRing} focus-visible:outline-offset-4`} onClick={closeAll}>
          <BrandLogo tight className="h-8 w-auto" />
        </HomeLink>

        {!compact && (
          <nav ref={navRef} aria-label={t.navLabel} className="flex min-w-max flex-[1_0_auto] items-center">
            {NAV_SLUGS.map((slug, i) => {
              const open = openCat === slug;
              const items = menuItems(slug, lang);
              const two = MENU[slug].length >= 5;
              const alignRight = i >= 5;
              return (
                <div key={slug} className="relative">
                  <button
                    ref={(el) => { triggerRefs.current[slug] = el; }}
                    type="button"
                    aria-expanded={open}
                    aria-haspopup="true"
                    onClick={() => { setOpenCat(open ? null : slug); setLangOpen(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault(); setOpenCat(slug);
                        setTimeout(() => document.querySelector<HTMLAnchorElement>(`[data-panel="${slug}"] a`)?.focus(), 0);
                      }
                    }}
                    className={`inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-lg px-1 text-[14px] font-medium leading-5 transition-colors hover:bg-[rgba(22,38,63,.05)] hover:text-[#16263F] ${focusRing} ${
                      open ? "bg-[rgba(22,38,63,.07)] text-[#16263F]" : "text-[#5B6B80]"
                    }`}
                  >
                    {t.nav[i]}
                    <ChevronDown aria-hidden size={12} className={`opacity-80 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div
                      data-panel={slug}
                      className={`absolute top-[calc(100%+12px)] z-[60] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#E6EAF0] bg-white p-1 text-left shadow-[0_8px_24px_rgba(16,28,48,.10),0_1px_2px_rgba(16,28,48,.06)] ${
                        alignRight ? "right-0" : "left-0"
                      } ${two ? "w-[600px]" : "w-[320px]"}`}
                    >
                      <HomeLink
                        to={slug}
                        onClick={closeAll}
                        className={`flex min-h-[34px] items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium leading-[18px] text-[#1E8168] transition-colors hover:bg-[#F7F9FB] hover:text-[#16263F] ${focusRing} focus-visible:-outline-offset-2`}
                      >
                        <span>{ui.overviewOf} {t.nav[i]}</span>
                        <ArrowRight aria-hidden size={12} />
                      </HomeLink>
                      <div aria-hidden className="mx-3.5 mb-0.5 h-px bg-[#E6EAF0]" />
                      <div className={`grid gap-0.5 ${two ? "grid-cols-2" : "grid-cols-1"}`}>
                        {items.map((it) => (
                          <HomeLink
                            key={it.path}
                            to={it.path}
                            onClick={closeAll}
                            className={`block rounded-md px-3.5 py-2.5 text-[#16263F] transition-colors hover:bg-[#F7F9FB] ${focusRing} focus-visible:-outline-offset-2`}
                          >
                            <span className="block text-[14px] font-medium leading-5">{it.name}</span>
                            <span className="mt-1 block text-[13px] leading-[18px] text-[#5B6B80] [text-wrap:pretty]">{it.desc}</span>
                          </HomeLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {showActions && (
          <div className="ml-auto flex flex-none items-center gap-1">
            <div ref={langRef} className="relative">
              <button
                ref={langBtnRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                aria-label={`${t.langLabel}: ${LANG_NAMES[lang]}`}
                onClick={() => { setLangOpen(!langOpen); setOpenCat(null); }}
                className={`inline-flex h-10 items-center gap-[5px] whitespace-nowrap rounded-lg border px-1.5 text-[14px] font-medium leading-5 text-[#16263F] transition-colors hover:border-[#16263F] ${focusRing} focus-visible:outline-offset-1 ${
                  langOpen ? "border-[#16263F] bg-white" : "border-[#E6EAF0] bg-transparent"
                }`}
              >
                <Globe aria-hidden size={16} />
                <span>{lang.toUpperCase()}</span>
                <ChevronDown aria-hidden size={12} className={`transition-transform duration-150 ${langOpen ? "rotate-180" : ""}`} />
              </button>
              {langOpen && (
                <div role="listbox" aria-label={t.langLabel} className="absolute right-0 top-[calc(100%+10px)] z-[60] flex w-[184px] flex-col gap-0.5 rounded-xl border border-[#E6EAF0] bg-white p-1.5 shadow-[0_12px_32px_rgba(16,28,48,.12)]">
                  {LANGS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="option"
                      aria-selected={l === lang}
                      onClick={() => pickLang(l)}
                      className={`flex h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[14px] text-[#16263F] hover:bg-[#F7F9FB] ${focusRing} focus-visible:-outline-offset-2 ${
                        l === lang ? "bg-[#F7F9FB] font-semibold" : "font-normal"
                      }`}
                    >
                      <span>{LANG_NAMES[l]}</span>
                      <Check aria-hidden size={16} className={`text-[#1E8168] ${l === lang ? "opacity-100" : "opacity-0"}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <HomeLink to="login" className={`inline-flex h-10 items-center whitespace-nowrap rounded-lg px-1.5 text-[14px] font-semibold leading-5 text-[#16263F] transition-colors hover:bg-[rgba(22,38,63,.05)] hover:text-[#101C30] ${focusRing}`}>
              {t.signIn}
            </HomeLink>
            <HomeLink to="register" className={`inline-flex h-9 items-center whitespace-nowrap rounded-[10px] bg-[#16263F] px-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#101C30] hover:text-white ${focusRing} focus-visible:outline-offset-2`}>
              {t.cta} →
            </HomeLink>
          </div>
        )}

        {compact && (
          <button
            type="button"
            onClick={() => setDrawer(!drawer)}
            aria-label={drawer ? t.close : t.open}
            aria-expanded={drawer}
            className={`-mr-2.5 ${showActions ? "" : "ml-auto"} flex h-11 w-11 items-center justify-center rounded-lg text-[#5B6B80] hover:text-[#16263F] ${focusRing} focus-visible:-outline-offset-4`}
          >
            {drawer ? <X size={24} /> : <Menu size={24} />}
          </button>
        )}
      </div>

      {compact && drawer && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[49] flex flex-col overflow-y-auto border-t border-[#E6EAF0] bg-[#F7F9FB]">
          <nav aria-label={t.navLabel} className="flex flex-col px-6">
            {NAV_SLUGS.map((slug, i) => {
              const open = drawerCat === slug;
              return (
                <div key={slug} className="border-b border-[#E6EAF0]">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setDrawerCat(open ? null : slug)}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 text-left text-[18px] leading-[1.3] text-[#16263F] ${open ? "font-semibold" : "font-normal"} ${focusRing} focus-visible:outline-offset-2`}
                  >
                    <span>{t.nav[i]}</span>
                    <ChevronDown aria-hidden size={20} className={`text-[#5B6B80] transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="flex flex-col gap-0.5 pb-3.5">
                      <HomeLink to={slug} onClick={closeAll} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[#E6EAF0] bg-white px-3 py-2.5 text-[15px] font-semibold text-[#16263F]">
                        {ui.overview}
                        <ArrowRight aria-hidden size={16} />
                      </HomeLink>
                      {menuItems(slug, lang).map((it) => (
                        <HomeLink key={it.path} to={it.path} onClick={closeAll} className="block min-h-11 rounded-lg px-3 py-2.5 text-[#16263F]">
                          <span className="block text-[15px] font-semibold leading-[1.35]">{it.name}</span>
                          <span className="mt-0.5 block text-[13px] leading-[1.45] text-[#5B6B80]">{it.desc}</span>
                        </HomeLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="flex flex-col gap-3 p-6">
            <div role="group" aria-label={t.langLabel} className="flex self-start overflow-hidden rounded-full border border-[#E6EAF0] bg-white">
              {LANGS.map((l) => (
                <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLanguage(l)} className={`px-4 py-2 text-[13px] ${l === lang ? "bg-[#2FA98A] text-white" : "text-[#5B6B80]"}`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <HomeLink to="login" onClick={closeAll} className="flex h-12 items-center justify-center rounded-[10px] border border-[#E6EAF0] bg-white text-[15px] font-semibold text-[#16263F]">
              {t.signIn}
            </HomeLink>
            <HomeLink to="register" onClick={closeAll} className="flex h-12 items-center justify-center rounded-[10px] bg-[#16263F] text-[15px] font-semibold text-white">
              {t.cta} →
            </HomeLink>
          </div>
        </div>
      )}
    </header>
  );
}
