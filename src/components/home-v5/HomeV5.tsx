import { useEffect } from "react";
import { useLanguage } from "@/lib/i18n";
import { SiteHeader } from "./SiteHeader";
import { HeroSection } from "./HeroSection";
import { PlatformSection } from "./PlatformSection";
import { Co2Calculator } from "./Co2Calculator";
import { SiteFooter } from "./SiteFooter";
import { useElementWidth } from "./useElementWidth";
import "./home-v5.css";

/** Approved homepage (Home v5). Layout responds to the width of this container, not the window. */
export function HomeV5() {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { language } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language === "pt" ? "pt-BR" : language;
  }, [language]);
  return (
    <div ref={ref} className="home-v5 relative min-h-screen bg-[#F7F9FB] text-[#16263F]">
      <SiteHeader width={width} />
      <main>
        <HeroSection width={width} />
        <PlatformSection width={width} />
        <Co2Calculator />
      </main>
      <SiteFooter />
    </div>
  );
}
