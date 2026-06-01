import { Link } from "@tanstack/react-router";
import {
  Building2,
  Truck,
  Shield,
  ClipboardCheck,
  Wallet,
  BarChart3,
  Users,
  MapPin,
  DollarSign,
  Repeat,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/steel";

const COPY = {
  companies: {
    pt: {
      label: "Para embarcadores",
      headline: "Reduza custo, ganhe transparência",
      desc: "Siderúrgicas, distribuidores e indústrias do aço — tudo em um único painel.",
      cta: "Sou embarcador",
      items: [
        { icon: DollarSign, title: "Até 18% mais barato", desc: "Concorrência real entre transportadoras verificadas." },
        { icon: ClipboardCheck, title: "Contrato e nota fiscal", desc: "Tudo digital, sem papelada manual." },
        { icon: Shield, title: "Escrow + seguro", desc: "Pagamento só é liberado após entrega confirmada." },
        { icon: BarChart3, title: "Dashboard ESG", desc: "Acompanhe emissões e fretes verdes em tempo real." },
      ],
    },
    en: {
      label: "For shippers",
      headline: "Lower cost, full transparency",
      desc: "Steel mills, distributors and industry — one single dashboard.",
      cta: "I'm a shipper",
      items: [
        { icon: DollarSign, title: "Up to 18% cheaper", desc: "Real competition between verified carriers." },
        { icon: ClipboardCheck, title: "Contract & invoice", desc: "Fully digital, no manual paperwork." },
        { icon: Shield, title: "Escrow + insurance", desc: "Payment released only after confirmed delivery." },
        { icon: BarChart3, title: "ESG dashboard", desc: "Track emissions and green freight in real time." },
      ],
    },
  },
  carriers: {
    pt: {
      label: "Para transportadoras",
      headline: "Carga garantida, pagamento garantido",
      desc: "Cresça sua operação com cargas de aço de embarcadores qualificados.",
      cta: "Sou transportadora",
      items: [
        { icon: Truck, title: "Marketplace ativo", desc: "Centenas de cargas novas por dia em todo o Brasil." },
        { icon: Wallet, title: "Pagamento em D+1", desc: "Receba rapidamente após confirmar a entrega." },
        { icon: Users, title: "Equipe e frota", desc: "Gerencie motoristas e veículos no mesmo painel." },
        { icon: Repeat, title: "Frete de retorno", desc: "Algoritmo sugere cargas para evitar caminhão vazio." },
      ],
    },
    en: {
      label: "For carriers",
      headline: "Guaranteed loads, guaranteed payment",
      desc: "Grow your operation with steel freight from qualified shippers.",
      cta: "I'm a carrier",
      items: [
        { icon: Truck, title: "Active marketplace", desc: "Hundreds of new loads daily across Brazil." },
        { icon: Wallet, title: "Payment in D+1", desc: "Get paid fast after confirmed delivery." },
        { icon: Users, title: "Team & fleet", desc: "Manage drivers and vehicles in the same panel." },
        { icon: Repeat, title: "Return freight", desc: "Algorithm suggests loads to avoid empty trucks." },
      ],
    },
  },
};

export function ForCompanies() {
  const { language } = useLanguage();
  const c = COPY.companies[language];
  return (
    <Block
      id="companies"
      icon={Building2}
      label={c.label}
      headline={c.headline}
      desc={c.desc}
      items={c.items}
      cta={c.cta}
      role="shipper"
    />
  );
}

export function ForCarriers() {
  const { language } = useLanguage();
  const c = COPY.carriers[language];
  return (
    <Block
      id="carriers"
      icon={MapPin}
      label={c.label}
      headline={c.headline}
      desc={c.desc}
      items={c.items}
      cta={c.cta}
      role="carrier"
      flipped
    />
  );
}

function Block({
  id,
  icon: Icon,
  label,
  headline,
  desc,
  items,
  cta,
  role,
  flipped,
}: {
  id: string;
  icon: typeof Building2;
  label: string;
  headline: string;
  desc: string;
  items: { icon: typeof Building2; title: string; desc: string }[];
  cta: string;
  role: "shipper" | "carrier";
  flipped?: boolean;
}) {
  return (
    <section id={id} className="border-b border-graphite-800 py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center">
        <div className={flipped ? "lg:order-2" : ""}>
          <div className="inline-flex items-center gap-2 rounded-full border border-graphite-700 bg-bg-surface px-3 py-1 text-xs font-medium text-steel-blue-400">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <h2 className="mt-4 text-3xl font-bold text-graphite-50 md:text-4xl">{headline}</h2>
          <p className="mt-3 text-base text-graphite-300">{desc}</p>
          <Link to="/register" search={{ role }} className="mt-6 inline-block">
            <Button size="lg" variant={role === "carrier" ? "green" : "primary"}>{cta} →</Button>
          </Link>
        </div>
        <div className={flipped ? "lg:order-1" : ""}>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((it) => (
              <div key={it.title} className="rounded-lg border border-graphite-800 bg-bg-surface p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-steel-blue-100 text-steel-blue-400">
                  <it.icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-graphite-50">{it.title}</h3>
                <p className="mt-1 text-xs text-graphite-400">{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
