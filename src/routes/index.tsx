import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/homepage/Navbar";
import { HeroSection } from "@/components/homepage/HeroSection";
import { LogosStrip } from "@/components/homepage/LogosStrip";
import { HowItWorksSection } from "@/components/homepage/HowItWorksSection";
import { TraditionalFreightSection } from "@/components/homepage/TraditionalFreightSection";
import { GreenLogisticsSection } from "@/components/homepage/GreenLogisticsSection";
import { SecuritySection } from "@/components/homepage/SecuritySection";
import { ESGSection } from "@/components/homepage/ESGSection";
import { CarrierSection } from "@/components/homepage/CarrierSection";
import { CompanySection } from "@/components/homepage/CompanySection";
import { TestimonialsSection } from "@/components/homepage/TestimonialsSection";
import { PricingSection } from "@/components/homepage/PricingSection";
import { FinalCTASection } from "@/components/homepage/FinalCTASection";
import { Footer } from "@/components/homepage/Footer";
import { WhatsAppButton } from "@/components/homepage/WhatsAppButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SteelGo — Transporte de aço seguro, digital e rastreável" },
      {
        name: "description",
        content:
          "Plataforma brasileira que conecta siderúrgicas e indústrias a transportadoras verificadas, com contrato digital, conta protegida e rastreamento ponta a ponta.",
      },
      { property: "og:title", content: "SteelGo — Transporte de aço seguro, digital e rastreável" },
      { property: "og:description", content: "Plataforma brasileira que conecta siderúrgicas e indústrias a transportadoras verificadas, com contrato digital, conta protegida e rastreamento ponta a ponta." },
    ],
    scripts: [
      { children: `document.documentElement.style.scrollBehavior='smooth';` },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <Navbar />
      <main>
        <HeroSection />
        <LogosStrip />
        <HowItWorksSection />
        <TraditionalFreightSection />
        <GreenLogisticsSection />
        <SecuritySection />
        <ESGSection />
        <CarrierSection />
        <CompanySection />
        <TestimonialsSection />
        <PricingSection />
        <FinalCTASection />
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
