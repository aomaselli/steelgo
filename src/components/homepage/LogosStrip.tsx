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
    <section ref={ref} className="border-y border-[#E6EAF0] bg-[#F7F9FB]" style={{ padding: "32px 0" }}>
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-[#9AA6B2]">{label}</div>
        <div
          className="flex flex-wrap items-center justify-center gap-12 transition-all ease-out"
          style={{
            transitionDuration: "600ms",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
          }}
        >
          {LOGOS.map((name) => (
            <div key={name} className="flex h-7 items-center rounded bg-white px-4 shadow-sm ring-1 ring-[#E6EAF0]">
              <span className="text-sm font-medium text-[#5B6B80]">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default LogosStrip;
