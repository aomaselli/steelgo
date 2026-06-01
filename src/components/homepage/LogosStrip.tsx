import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

const LOGOS = ["Gerdau", "Usiminas", "CSN", "ArcelorMittal", "Villares"];

export function LogosStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { language } = useLanguage();
  const label = language === "pt" ? "Confiado por empresas do setor" : "Trusted by industry leaders";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="bg-[#161B22] border-y border-[#30363D]" style={{ padding: "32px 0" }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-[#484F58] text-xs uppercase tracking-widest text-center mb-6">{label}</div>
        <div
          className="flex items-center justify-center gap-12 flex-wrap transition-all ease-out"
          style={{
            transitionDuration: "600ms",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
          }}
        >
          {LOGOS.map((name) => (
            <div key={name} className="rounded bg-[#30363D]/40 h-7 flex items-center px-4">
              <span className="text-[#484F58] text-sm font-medium">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default LogosStrip;
