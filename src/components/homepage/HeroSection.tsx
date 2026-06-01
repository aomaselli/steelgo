import { useNavigate } from "@tanstack/react-router";
import { Lock, Leaf } from "lucide-react";
import { Button } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "🇧🇷 Marketplace especializado em transporte de aço",
    h1a: "Transporte de aço.",
    h1b: "Seguro, digital e rastreável.",
    sub: "Conectamos siderúrgicas, distribuidores e indústrias às melhores transportadoras do Brasil. Contratos digitais, rastreamento GPS e pagamento protegido.",
    ctaPrimary: "Publicar meu frete →",
    ctaSecondary: "Sou transportadora",
    trust: "Sem taxa de cadastro. Pague apenas quando fechar um frete.",
    stats: [
      { value: "12.400+", label: "toneladas transportadas" },
      { value: "340+", label: "transportadoras verificadas" },
      { value: "R$ 0", label: "em roubos de carga (2024)" },
      { value: "34%", label: "fretes com logística verde", color: "#2ECC8A" },
    ],
    escrowLabel: "Pagamento protegido",
    escrowValue: "R$ 18.400 protegido",
    greenLabel: "Frete verde",
  },
  en: {
    eyebrow: "🇧🇷 Marketplace specialized in steel transport",
    h1a: "Steel transport.",
    h1b: "Secure, digital and traceable.",
    sub: "We connect steel mills, distributors and industries to Brazil's top carriers. Digital contracts, GPS tracking and escrow payment.",
    ctaPrimary: "Post my freight →",
    ctaSecondary: "I'm a carrier",
    trust: "No sign-up fee. Pay only when you close a freight.",
    stats: [
      { value: "12,400+", label: "tons transported" },
      { value: "340+", label: "verified carriers" },
      { value: "$0", label: "in cargo theft (2024)" },
      { value: "34%", label: "green logistics freights", color: "#2ECC8A" },
    ],
    escrowLabel: "Escrow active",
    escrowValue: "$18,400 protected",
    greenLabel: "Green freight",
  },
} as const;

export function HeroSection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language];

  return (
    <section className="relative min-h-screen bg-[#0D1117] overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(#30363D 1px, transparent 1px), repeating-linear-gradient(90deg, #30363D 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.04,
        }}
      />

      <div
        className="relative max-w-[760px] mx-auto px-6 flex flex-col items-center text-center"
        style={{ paddingTop: 120, paddingBottom: 80 }}
      >
        <div className="inline-flex items-center gap-2 border border-[#1B6CB8]/40 bg-[#1B6CB8]/10 text-[#79B8F8] rounded-full px-4 py-1.5 text-sm mb-6">
          {c.eyebrow}
        </div>

        <h1
          style={{
            fontSize: "clamp(42px, 6vw, 72px)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginBottom: 24,
          }}
        >
          <span className="block text-[#E6EDF3]">{c.h1a}</span>
          <span
            className="block"
            style={{
              backgroundImage: "linear-gradient(135deg, #3B89D4 0%, #2ECC8A 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {c.h1b}
          </span>
        </h1>

        <p className="text-[#8B949E] text-lg max-w-[560px] mx-auto mb-8" style={{ lineHeight: 1.7 }}>
          {c.sub}
        </p>

        <div className="flex gap-4 justify-center flex-wrap mb-4">
          <Button variant="primary" size="xl" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })}>
            {c.ctaPrimary}
          </Button>
          <Button variant="ghost" size="xl" onClick={() => navigate({ to: "/register", search: { role: "carrier" } as never })}>
            {c.ctaSecondary}
          </Button>
        </div>

        <p className="text-[#484F58] text-sm">{c.trust}</p>

        <div className="w-full mt-12 pt-8 border-t border-[#30363D]/50">
          <div className="flex justify-center flex-wrap gap-0">
            {c.stats.map((s, i) => (
              <div
                key={s.label}
                className={`px-5 md:px-8 text-center ${i < c.stats.length - 1 ? "border-r border-[#30363D]/40" : ""}`}
              >
                <span className="font-bold text-3xl tabular-nums block" style={{ color: ("color" in s && s.color) || "#E6EDF3" }}>
                  {s.value}
                </span>
                <span className="text-[#8B949E] text-xs mt-1 block">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative w-full max-w-2xl mx-auto mt-12">
          <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-[#1B6CB8]/5 blur-xl" />
          <div className="relative bg-[#1C2128] border border-[#30363D] rounded-[20px] p-4">
            <div className="relative flex items-center justify-center" style={{ height: 200 }}>
              <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-48">
                <path d="M180 40 L220 35 L260 50 L290 80 L310 120 L320 160 L300 200 L310 240 L290 280 L260 320 L220 350 L190 360 L160 340 L130 300 L110 260 L100 220 L90 180 L100 140 L120 100 L150 65 Z" stroke="#30363D" strokeWidth="1.5" fill="#161B22" />
              </svg>
              <span className="absolute" style={{ width: 12, height: 12, borderRadius: 9999, background: "#1B6CB8", animation: "steelgo-pulse 2s infinite" }} />
            </div>
            <div className="absolute bottom-0 left-0 -translate-x-4 translate-y-4 bg-[#1C2128] border border-[#1A9B5E]/40 rounded-[12px] px-3 py-2 flex items-center gap-2 shadow-lg">
              <Lock size={16} color="#2ECC8A" />
              <div className="text-left">
                <div className="text-[10px] text-[#8B949E] leading-none">{c.escrowLabel}</div>
                <div className="text-sm font-bold text-[#E6EDF3]">{c.escrowValue}</div>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 translate-x-4 translate-y-4 bg-[#1C2128] border border-[#1A9B5E]/40 rounded-[12px] px-3 py-2 flex items-center gap-2 shadow-lg">
              <Leaf size={16} color="#2ECC8A" />
              <div className="text-left">
                <div className="text-[10px] text-[#8B949E] leading-none">{c.greenLabel}</div>
                <div className="text-sm font-bold text-[#2ECC8A]">-420 kg CO₂</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes steelgo-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(27,108,184,0.4); }
          100% { box-shadow: 0 0 0 12px rgba(27,108,184,0); }
        }
      `}</style>
    </section>
  );
}

export default HeroSection;
