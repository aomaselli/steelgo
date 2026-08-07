import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/homepage/Navbar";
import { HeroSection } from "@/components/homepage/HeroSection";
import { HowItWorksSection } from "@/components/homepage/HowItWorksSection";
import { TraditionalFreightSection } from "@/components/homepage/TraditionalFreightSection";
import { GreenLogisticsSection } from "@/components/homepage/GreenLogisticsSection";
import { SecuritySection } from "@/components/homepage/SecuritySection";
import { ESGSection } from "@/components/homepage/ESGSection";
import { CarrierSection } from "@/components/homepage/CarrierSection";
import { CompanySection } from "@/components/homepage/CompanySection";
import { RequestAccessSection } from "@/components/homepage/RequestAccessSection";
import { FinalCTASection } from "@/components/homepage/FinalCTASection";
import { Footer } from "@/components/homepage/Footer";
import { WhatsAppButton } from "@/components/homepage/WhatsAppButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SteelGo — A infraestrutura digital logística da América Latina" },
      {
        name: "description",
        content: "Tecnologia para conectar embarcadores, transportadoras e motoristas, integrando fretes, documentos, pagamentos e rastreamento em uma única operação.",
      },
      { property: "og:title", content: "SteelGo — A infraestrutura digital logística da América Latina" },
      { property: "og:description", content: "Tecnologia para conectar embarcadores, transportadoras e motoristas em operações logísticas mais seguras, visíveis e eficientes." },
    ],
    scripts: [
      { children: `document.documentElement.style.scrollBehavior='smooth';` },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="homepage-shell min-h-screen text-[#16263F]">
      <Navbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <TraditionalFreightSection />
        <GreenLogisticsSection />
        <SecuritySection />
        <ESGSection />
        <CarrierSection />
        <CompanySection />
        <RequestAccessSection />
        <FinalCTASection />
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
