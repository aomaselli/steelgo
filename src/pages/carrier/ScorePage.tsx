import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Leaf,
  Lock,
  Shield,
  Star,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ThumbsUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, Spinner } from "@/components/steel";
import { ScoreRing } from "@/components/steel/ScoreRing";
import { formatNum } from "@/lib/steel";

type Tier = "standard" | "silver" | "gold" | "platinum";

const TIER_COLOR: Record<Tier, string> = {
  standard: "#484F58",
  silver: "#8B949E",
  gold: "#F0A500",
  platinum: "#2ECC8A",
};

const TIER_LABEL: Record<Tier, string> = {
  standard: "Standard",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

const TIERS: { id: Tier; minScore: number; minFreights: number; esg: string }[] = [
  { id: "standard", minScore: 0, minFreights: 0, esg: "—" },
  { id: "silver", minScore: 7, minFreights: 10, esg: "Recomendada" },
  { id: "gold", minScore: 8.5, minFreights: 50, esg: "Certificada" },
  { id: "platinum", minScore: 9.2, minFreights: 150, esg: "Certificada" },
];

function barColor(s: number) {
  if (s >= 8.5) return "#1A9B5E";
  if (s >= 7) return "#1B6CB8";
  if (s >= 5) return "#CC8800";
  return "#C23333";
}

function Bar({
  icon: Icon,
  iconColor,
  label,
  weight,
  value,
}: {
  icon: typeof Shield;
  iconColor: string;
  label: string;
  weight: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 w-44 flex-shrink-0">
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
        <span className="text-sm text-[#C9D1D9]">{label}</span>
      </div>
      <span className="text-[10px] bg-[#21262D] text-[#484F58] rounded px-2 py-0.5 w-10 text-center flex-shrink-0">
        {weight}
      </span>
      <div className="flex-1 h-2 bg-[#21262D] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, (value / 10) * 100)}%`,
            backgroundColor: barColor(value),
          }}
        />
      </div>
      <span className="text-sm font-bold text-[#E6EDF3] w-8 text-right flex-shrink-0 tabular-nums">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function TipCard({
  borderColor,
  bg,
  icon: Icon,
  title,
  tips,
}: {
  borderColor: string;
  bg: string;
  icon: typeof Shield;
  title: string;
  tips: string[];
}) {
  return (
    <div
      className="rounded-[10px] p-4 border-l-4"
      style={{ borderLeftColor: borderColor, backgroundColor: bg }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: borderColor }} />
        <span className="text-sm font-semibold text-[#E6EDF3]">{title}</span>
      </div>
      <ul className="space-y-1">
        {tips.map((t, i) => (
          <li key={i} className="text-xs text-[#8B949E]">
            • {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScorePage() {
  const { company } = useAuth();

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("carriers")
        .select("*")
        .eq("company_id", company!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: score, isLoading } = useQuery({
    queryKey: ["carrier-score-page", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("carrier_scores")
        .select("*")
        .eq("carrier_id", carrier!.id)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  const overall = Number(score?.overall_score ?? 0);
  const safety = Number(score?.safety_score ?? 0);
  const delivery = Number(score?.delivery_score ?? 0);
  const esg = Number(score?.esg_score ?? 0);
  const security = Number(score?.security_score ?? 0);
  const client = Number(score?.client_score ?? 0);
  const total = Number(score?.total_freights ?? 0);
  const onTime = Number(score?.on_time_count ?? 0);
  const tier = ((score?.badge_tier as Tier) ?? "standard") as Tier;
  const tierColor = TIER_COLOR[tier];
  const onTimePct = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const updatedAt = score?.updated_at
    ? new Date(score.updated_at).toLocaleDateString("pt-BR")
    : "—";

  const dims = [
    { score: delivery, key: "delivery" },
    { score: esg, key: "esg" },
    { score: safety, key: "safety" },
    { score: client, key: "client" },
  ];
  const tips: React.ReactNode[] = [];
  if (delivery < 8) {
    tips.push(
      <TipCard
        key="delivery"
        borderColor="#F0A500"
        bg="rgba(240,165,0,0.08)"
        icon={Clock}
        title="Melhore sua pontualidade"
        tips={[
          "Confirme janelas de coleta com antecedência",
          "Use o app do motorista para checkpoints em tempo real",
          "Planeje rotas considerando trânsito e descanso obrigatório",
        ]}
      />,
    );
  }
  if (esg < 7) {
    tips.push(
      <TipCard
        key="esg"
        borderColor="#1A9B5E"
        bg="rgba(26,155,94,0.08)"
        icon={Leaf}
        title="Aumente seu rating ESG"
        tips={[
          "Adicione veículos elétricos ou com biodiesel B100 à frota",
          "Certifique sua transportadora em programas verdes",
          "Aceite mais fretes da categoria Verde / Verde EV",
        ]}
      />,
    );
  }
  if (safety < 8) {
    tips.push(
      <TipCard
        key="safety"
        borderColor="#3B89D4"
        bg="rgba(59,137,212,0.08)"
        icon={Shield}
        title="Reforce a segurança"
        tips={[
          "Mantenha CRLV e inspeções dos caminhões em dia",
          "Capacite motoristas com MOPP quando aplicável",
          "Revise apólice de seguro e sinistralidade",
        ]}
      />,
    );
  }
  if (client < 8) {
    tips.push(
      <TipCard
        key="client"
        borderColor="#F0A500"
        bg="rgba(240,165,0,0.08)"
        icon={ThumbsUp}
        title="Melhore as avaliações"
        tips={[
          "Mantenha comunicação clara com o embarcador",
          "Entregue a carga sem avarias e dentro do prazo",
          "Solicite feedback após a entrega",
        ]}
      />,
    );
  }
  if (!tips.length) {
    tips.push(
      <TipCard
        key="ok"
        borderColor="#2ECC8A"
        bg="rgba(46,204,138,0.08)"
        icon={CheckCircle2}
        title="Continue assim!"
        tips={["Todas as dimensões estão saudáveis. Mantenha o desempenho."]}
      />,
    );
  }

  // Sorting unused suppression
  void dims;

  // Next tier gap
  const currentIdx = TIERS.findIndex((t) => t.id === tier);
  const nextTier = TIERS[currentIdx + 1];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="flex justify-center">
          <ScoreRing score={overall * 10} size={96} />
        </div>
        <div
          className="inline-block mt-4 px-3 py-1 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: `${tierColor}20`,
            color: tierColor,
            border: `1px solid ${tierColor}40`,
          }}
        >
          {TIER_LABEL[tier]}
        </div>
        <h1 className="text-xl font-bold text-[#E6EDF3] mt-4">
          Meu Score de Transportadora
        </h1>
        <p className="text-xs text-[#484F58] mt-1">
          Atualizado em {updatedAt}
        </p>
      </div>

      {/* Formula */}
      <div className="bg-[#161B22] rounded-[12px] p-3 text-center mb-8">
        <p className="text-xs text-[#484F58]">
          segurança (30%) + pontualidade (25%) + ESG (20%) + segurança de carga
          (15%) + avaliações (10%)
        </p>
      </div>

      {/* Dimension bars */}
      <Card className="p-6 mb-6">
        <h2 className="text-base font-semibold text-[#E6EDF3] mb-5">
          Detalhamento do score
        </h2>
        <div className="space-y-4">
          <Bar
            icon={Shield}
            iconColor="#3B89D4"
            label="Segurança"
            weight="30%"
            value={safety}
          />
          <Bar
            icon={Clock}
            iconColor="#F0A500"
            label="Pontualidade"
            weight="25%"
            value={delivery}
          />
          <Bar
            icon={Leaf}
            iconColor="#2ECC8A"
            label="Rating ESG"
            weight="20%"
            value={esg}
          />
          <Bar
            icon={Lock}
            iconColor="#3B89D4"
            label="Seg. de carga"
            weight="15%"
            value={security}
          />
          <Bar
            icon={Star}
            iconColor="#F0A500"
            label="Avaliações"
            weight="10%"
            value={client}
          />
        </div>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { value: formatNum(total), label: "Total de fretes", color: "#E6EDF3" },
          {
            value: `${onTime}/${total}`,
            label: "Entregas no prazo",
            color: "#E6EDF3",
          },
          {
            value: `${onTimePct}%`,
            label: "Taxa de pontualidade",
            color: "#2ECC8A",
          },
          {
            value: "0",
            label: "Incidentes",
            color: "#2ECC8A",
          },
          {
            value: score?.esg_certified ? "Certificada" : "Não certificada",
            label: "Certificação ESG",
            color: score?.esg_certified ? "#2ECC8A" : "#8B949E",
          },
          {
            value: TIER_LABEL[tier],
            label: "Nível do badge",
            color: tierColor,
          },
        ].map((s, i) => (
          <Card key={i} className="p-4 text-center">
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
            <div className="text-xs text-[#484F58] mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* How to improve */}
      <Card className="p-5 mb-6">
        <h2 className="text-base font-semibold text-[#E6EDF3] mb-4">
          💡 Como melhorar seu score
        </h2>
        <div className="space-y-3">{tips}</div>
      </Card>

      {/* Badge requirements */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-[#E6EDF3] mb-4">
          Níveis de badge
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-[#484F58]">
              <tr>
                <th className="text-left py-2">Nível</th>
                <th className="text-right py-2">Score mínimo</th>
                <th className="text-right py-2">Fretes</th>
                <th className="text-right py-2">ESG</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const isCurrent = t.id === tier;
                return (
                  <tr
                    key={t.id}
                    className="border-t border-[#30363D]"
                    style={
                      isCurrent
                        ? { backgroundColor: `${TIER_COLOR[t.id]}15` }
                        : undefined
                    }
                  >
                    <td
                      className="py-3 font-semibold"
                      style={{ color: TIER_COLOR[t.id] }}
                    >
                      {TIER_LABEL[t.id]}{" "}
                      {isCurrent && (
                        <span className="text-[10px] ml-1 text-[#8B949E]">
                          (atual)
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right text-[#C9D1D9] tabular-nums">
                      {t.minScore.toFixed(1)}
                    </td>
                    <td className="py-3 text-right text-[#C9D1D9] tabular-nums">
                      {t.minFreights}
                    </td>
                    <td className="py-3 text-right text-[#8B949E]">{t.esg}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {nextTier && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#8B949E]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#F0A500]" />
            Faltam{" "}
            <strong className="text-[#E6EDF3]">
              {Math.max(0, nextTier.minScore - overall).toFixed(1)} pontos
            </strong>{" "}
            e{" "}
            <strong className="text-[#E6EDF3]">
              {Math.max(0, nextTier.minFreights - total)} fretes
            </strong>{" "}
            para {TIER_LABEL[nextTier.id]}
          </div>
        )}
      </Card>
    </div>
  );
}
