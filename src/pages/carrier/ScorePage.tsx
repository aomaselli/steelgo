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
import { useLanguage } from "@/lib/i18n";
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

const TIERS: { id: Tier; minScore: number; minFreights: number; esgKey: string }[] = [
  { id: "standard", minScore: 0, minFreights: 0, esgKey: "esgNone" },
  { id: "silver", minScore: 7, minFreights: 10, esgKey: "esgRecommended" },
  { id: "gold", minScore: 8.5, minFreights: 50, esgKey: "esgCertified" },
  { id: "platinum", minScore: 9.2, minFreights: 150, esgKey: "esgCertified" },
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
        <span className="text-sm text-[#2C3E50]">{label}</span>
      </div>
      <span className="text-[10px] bg-[#EEF3FA] text-[#5B6B80] rounded px-2 py-0.5 w-10 text-center flex-shrink-0">
        {weight}
      </span>
      <div className="flex-1 h-2 bg-[#E3EAF3] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, (value / 10) * 100)}%`,
            backgroundColor: barColor(value),
          }}
        />
      </div>
      <span className="text-sm font-bold text-[#10274A] w-8 text-right flex-shrink-0 tabular-nums">
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
        <span className="text-sm font-semibold text-[#10274A]">{title}</span>
      </div>
      <ul className="space-y-1">
        {tips.map((t, i) => (
          <li key={i} className="text-xs text-[#5B6B80]">
            • {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScorePage() {
  const { company } = useAuth();
  const { t } = useLanguage();

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
        title={t("carrierScore.tipPunctualityTitle")}
        tips={[
          t("carrierScore.tipPunctuality1"),
          t("carrierScore.tipPunctuality2"),
          t("carrierScore.tipPunctuality3"),
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
        title={t("carrierScore.tipEsgTitle")}
        tips={[
          t("carrierScore.tipEsg1"),
          t("carrierScore.tipEsg2"),
          t("carrierScore.tipEsg3"),
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
        title={t("carrierScore.tipSafetyTitle")}
        tips={[
          t("carrierScore.tipSafety1"),
          t("carrierScore.tipSafety2"),
          t("carrierScore.tipSafety3"),
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
        title={t("carrierScore.tipRatingsTitle")}
        tips={[
          t("carrierScore.tipRatings1"),
          t("carrierScore.tipRatings2"),
          t("carrierScore.tipRatings3"),
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
        title={t("carrierScore.tipOkTitle")}
        tips={[t("carrierScore.tipOk1")]}
      />,
    );
  }

  // Sorting unused suppression
  void dims;

  // Next tier gap
  const currentIdx = TIERS.findIndex((t) => t.id === tier);
  const nextTier = TIERS[currentIdx + 1];

  return (
    <div className="space-y-6 bg-[#F4F7FB] p-1">
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
        <h1 className="text-xl font-bold text-[#10274A] mt-4">
          {t("carrierScore.heading")}
        </h1>
        <p className="text-xs text-[#5B6B80] mt-1">
          {t("carrierScore.updatedAt")} {updatedAt}
        </p>
      </div>

      {/* Formula */}
      <div className="bg-white border border-[#DDE7F2] rounded-[12px] p-3 text-center mb-8 shadow-[0_8px_18px_rgba(16,39,74,0.04)]">
        <p className="text-xs text-[#5B6B80]">
          {t("carrierScore.formula")}
        </p>
      </div>

      {/* Dimension bars */}
      <Card className="p-6 mb-6 border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)]">
        <h2 className="text-base font-semibold text-[#10274A] mb-5">
          {t("carrierScore.detailHeading")}
        </h2>
        <div className="space-y-4">
          <Bar
            icon={Shield}
            iconColor="#3B89D4"
            label={t("carrierScore.safety")}
            weight="30%"
            value={safety}
          />
          <Bar
            icon={Clock}
            iconColor="#F0A500"
            label={t("carrierScore.punctuality")}
            weight="25%"
            value={delivery}
          />
          <Bar
            icon={Leaf}
            iconColor="#2ECC8A"
            label={t("carrierScore.esgRating")}
            weight="20%"
            value={esg}
          />
          <Bar
            icon={Lock}
            iconColor="#3B89D4"
            label={t("carrierScore.cargoSafety")}
            weight="15%"
            value={security}
          />
          <Bar
            icon={Star}
            iconColor="#F0A500"
            label={t("carrierScore.ratings")}
            weight="10%"
            value={client}
          />
        </div>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { value: formatNum(total), label: t("carrierScore.totalFreights"), color: "#10274A" },
          {
            value: `${onTime}/${total}`,
            label: t("carrierScore.onTimeDeliveries"),
            color: "#10274A",
          },
          {
            value: `${onTimePct}%`,
            label: t("carrierScore.onTimeRate"),
            color: "#2ECC8A",
          },
          {
            value: "0",
            label: t("carrierScore.incidents"),
            color: "#2ECC8A",
          },
          {
            value: score?.esg_certified ? t("carrierScore.certified") : t("carrierScore.notCertified"),
            label: t("carrierScore.esgCertification"),
            color: score?.esg_certified ? "#2ECC8A" : "#5B6B80",
          },
          {
            value: TIER_LABEL[tier],
            label: t("carrierScore.badgeLevel"),
            color: tierColor,
          },
        ].map((s, i) => (
          <Card key={i} className="p-4 text-center border-[#DDE7F2] bg-white">
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
            <div className="text-xs text-[#5B6B80] mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* How to improve */}
      <Card className="p-5 mb-6 border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)]">
        <h2 className="text-base font-semibold text-[#10274A] mb-4">
          💡 {t("carrierScore.improveHeading")}
        </h2>
        <div className="space-y-3">{tips}</div>
      </Card>

      {/* Badge requirements */}
      <Card className="p-5 border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)]">
        <h2 className="text-base font-semibold text-[#10274A] mb-4">
          {t("carrierScore.badgeLevelsHeading")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-[#5B6B80]">
              <tr>
                <th className="text-left py-2">{t("carrierScore.colLevel")}</th>
                <th className="text-right py-2">{t("carrierScore.colMinScore")}</th>
                <th className="text-right py-2">{t("carrierScore.colFreights")}</th>
                <th className="text-right py-2">{t("carrierScore.colEsg")}</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tierRow) => {
                const isCurrent = tierRow.id === tier;
                return (
                  <tr
                    key={tierRow.id}
                    className="border-t border-[#DDE7F2]"
                    style={
                      isCurrent
                        ? { backgroundColor: `${TIER_COLOR[tierRow.id]}15` }
                        : undefined
                    }
                  >
                    <td
                      className="py-3 font-semibold"
                      style={{ color: TIER_COLOR[tierRow.id] }}
                    >
                      {TIER_LABEL[tierRow.id]}{" "}
                      {isCurrent && (
                        <span className="text-[10px] ml-1 text-[#5B6B80]">
                          {t("carrierScore.current")}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right text-[#2C3E50] tabular-nums">
                      {tierRow.minScore.toFixed(1)}
                    </td>
                    <td className="py-3 text-right text-[#2C3E50] tabular-nums">
                      {tierRow.minFreights}
                    </td>
                    <td className="py-3 text-right text-[#5B6B80]">{t(`carrierScore.${tierRow.esgKey}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {nextTier && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#5B6B80]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#F0A500]" />
            {t("carrierScore.missingPrefix")}{" "}
            <strong className="text-[#10274A]">
              {Math.max(0, nextTier.minScore - overall).toFixed(1)} {t("carrierScore.points")}
            </strong>{" "}
            {t("carrierScore.and")}{" "}
            <strong className="text-[#10274A]">
              {Math.max(0, nextTier.minFreights - total)} {t("carrierScore.freightsWord")}
            </strong>{" "}
            {t("carrierScore.forTier")} {TIER_LABEL[nextTier.id]}
          </div>
        )}
      </Card>
    </div>
  );
}
