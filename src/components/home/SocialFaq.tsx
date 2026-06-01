import { useState } from "react";
import { ChevronDown, Quote } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TESTIMONIALS = {
  pt: [
    { name: "Carlos M.", role: "Logística — Gerdau (distrib.)", quote: "Reduzimos 22% do custo de frete em 3 meses. A conta protegida acabou com nossa dor de cabeça com inadimplência." },
    { name: "Ana R.", role: "Sócia — Transportes Aço Forte", quote: "Saí do WhatsApp e dos brokers. Hoje fecho 4 cargas por semana só pela SteelGo." },
    { name: "Roberto P.", role: "Compras — Indústria Metalúrgica SP", quote: "Visibilidade total da carga e contratos digitais. Nosso jurídico aprovou na primeira semana." },
  ],
  en: [
    { name: "Carlos M.", role: "Logistics — Gerdau (distrib.)", quote: "We cut 22% of freight cost in 3 months. Escrow killed our payment headache." },
    { name: "Ana R.", role: "Partner — Aço Forte Transport", quote: "Left WhatsApp and brokers behind. I close 4 loads a week just through SteelGo." },
    { name: "Roberto P.", role: "Procurement — SP Metals", quote: "Full cargo visibility and digital contracts. Our legal team approved week one." },
  ],
};

const FAQ = {
  pt: [
    { q: "Quanto custa para começar?", a: "Cadastro é grátis para ambos os lados. Embarcadores não pagam nada. Transportadoras pagam 5% apenas quando fecham um frete." },
    { q: "Como funciona a conta protegida?", a: "O pagamento do embarcador é guardado com segurança no momento da contratação e só é liberado para a transportadora após a confirmação digital da entrega." },
    { q: "A SteelGo emite nota fiscal?", a: "Sim. Emitimos NF de serviço da nossa comissão e facilitamos a emissão do CT-e pela transportadora." },
    { q: "E se a carga for danificada ou roubada?", a: "Todas as cargas têm seguro obrigatório acionável diretamente pela plataforma. KYC + rastreamento minimizam o risco." },
    { q: "Posso integrar com meu ERP?", a: "Sim. Oferecemos API REST para clientes Enterprise com integração SAP, TOTVS e outros." },
  ],
  en: [
    { q: "What does it cost to start?", a: "Sign-up is free for both sides. Shippers pay nothing. Carriers pay 5% only when closing a freight." },
    { q: "How does escrow work?", a: "The shipper's payment is held in a secure account at contract signing and only released to the carrier after confirmed digital delivery." },
    { q: "Does SteelGo issue invoices?", a: "Yes. We issue a service invoice for our commission and help carriers issue CT-e." },
    { q: "What if cargo is damaged or stolen?", a: "All cargo has mandatory insurance triggerable through the platform. KYC + tracking minimize risk." },
    { q: "Can I integrate with my ERP?", a: "Yes. We offer a REST API for Enterprise customers, with SAP, TOTVS and more." },
  ],
};

export function Testimonials() {
  const { language } = useLanguage();
  const items = TESTIMONIALS[language];
  const label = language === "pt" ? "O que dizem nossos clientes" : "What our customers say";
  return (
    <section className="border-b border-graphite-800 py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="text-center text-3xl font-bold text-graphite-50 md:text-4xl">{label}</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((t) => (
            <figure key={t.name} className="rounded-lg border border-graphite-800 bg-bg-surface p-6">
              <Quote className="h-6 w-6 text-steel-blue-400" />
              <blockquote className="mt-3 text-sm leading-relaxed text-graphite-200">"{t.quote}"</blockquote>
              <figcaption className="mt-4 border-t border-graphite-800 pt-4">
                <div className="text-sm font-semibold text-graphite-50">{t.name}</div>
                <div className="text-xs text-graphite-400">{t.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const { language } = useLanguage();
  const items = FAQ[language];
  const label = language === "pt" ? "Perguntas frequentes" : "Frequently asked";
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="border-b border-graphite-800 bg-bg-surface/30 py-20">
      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <h2 className="text-center text-3xl font-bold text-graphite-50 md:text-4xl">{label}</h2>
        <div className="mt-10 space-y-3">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="overflow-hidden rounded-lg border border-graphite-800 bg-bg-surface">
                <button
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span className="text-sm font-medium text-graphite-50">{it.q}</span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-graphite-400 transition-transform", isOpen && "rotate-180")}
                  />
                </button>
                {isOpen && <div className="px-5 pb-4 text-sm text-graphite-300">{it.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
