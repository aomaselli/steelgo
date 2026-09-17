// Painel de membro (operator / viewer) de transportadora ou embarcador.
// O painel do proprietario mistura lances, contratos e financeiro - leituras que
// o RLS reserva ao proprietario. O membro recebe somente o que pode usar:
// viagens visiveis (list_my_trips) e o papel que a empresa lhe deu.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { Badge, Button, Card, EmptyState, Spinner } from "@/components/steel";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMyTrips } from "@/lib/trips";
import {
  ACTIVE_TRIP_STATUSES,
  fmtDateTime,
  relativeMinutes,
  tripStatusMeta,
} from "@/lib/tripStatus";

export function MemberDashboard({ kind }: { kind: "carrier" | "shipper" }) {
  const { profile, company, companyRole } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["trips", "member-dashboard"],
    queryFn: () => fetchMyTrips("mine", undefined, 100),
    refetchInterval: 30_000,
  });
  const active = trips.filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
  const attention = trips.filter(
    (t) => t.has_open_sos || (t.open_exceptions ?? 0) > 0 || (t.open_alerts ?? 0) > 0,
  );
  const detailTo = kind === "carrier" ? "/carrier/trips/$id" : "/shipper/trips/$id";
  const listTo = kind === "carrier" ? "/carrier/trips" : "/shipper/trips";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10274A]">Olá, {firstName || "equipe"}!</h1>
          <p className="mt-1 text-sm text-[#5B6B80]">
            {company?.trade_name ?? company?.name} ·{" "}
            {companyRole === "operator" ? (
              <>
                <b>operador</b>: acompanha, designa/reatribui motoristas, informa ETA e trata
                ocorrências. Lances, contratos, pagamentos e disputas são do proprietário.
              </>
            ) : (
              <>
                <b>leitor</b>: acompanha as viagens. Nenhuma ação de mutação está disponível.
              </>
            )}
          </p>
        </div>
        <Link to={listTo}>
          <Button variant="outline">Ver todas as viagens</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          ["Viagens em andamento", active.length],
          ["Com atenção", attention.length],
          ["Viagens visíveis", trips.length],
        ].map(([label, value]) => (
          <Card key={String(label)} className="border border-[#E3EAF3] bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs uppercase tracking-wide text-[#5B6B80]">{label}</div>
            <div className="text-3xl font-bold tabular-nums text-[#1B6CB8]">{value}</div>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="text-base font-semibold text-[#10274A] mb-3">Viagens em andamento</h2>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : !active.length ? (
          <EmptyState
            tone="light"
            icon={Radar}
            title="Nenhuma viagem em andamento"
            description="As viagens aparecem aqui assim que o contrato é ativado."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {active.map((t) => {
              const m = tripStatusMeta(t.status);
              return (
                <Card
                  key={t.trip_id}
                  className="bg-white border border-[#E3EAF3] p-4 flex justify-between items-center gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#10274A]">
                      {t.trip_number} · {t.origin ?? "—"} → {t.destination ?? "—"}
                    </div>
                    <div className="text-xs text-[#5B6B80] mt-1 flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}
                      >
                        {m.short}
                      </span>
                      {t.driver_label ?? "—"} · sinal {relativeMinutes(t.last_location_at)}
                      {t.eta_at ? ` · ETA ${fmtDateTime(t.eta_at)}` : ""}
                      {t.has_open_sos && <Badge variant="danger">ALERTA CRÍTICO</Badge>}
                      {!t.has_open_sos && (t.open_exceptions ?? 0) > 0 && (
                        <Badge variant="amber">{t.open_exceptions} ocorrência(s)</Badge>
                      )}
                    </div>
                  </div>
                  <Link to={detailTo} params={{ id: t.trip_id }}>
                    <Button size="sm" variant="outline">
                      Abrir
                    </Button>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
