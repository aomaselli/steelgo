import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge, Button, Textarea } from "@/components/steel";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/disputes")({
  component: DisputesPage,
});

type Tab = "open" | "review" | "resolved";

// Uniao OFICIAL gerada pelo Supabase a partir do enum public.dispute_status.
type DisputeStatus = Database["public"]["Enums"]["dispute_status"];

// `as const satisfies` valida cada literal contra a uniao oficial SEM alargar
// para string[]. Se um valor sair do enum no banco, isto para de compilar - que
// e exatamente o que se quer de uma tela que filtra por status.
const TAB_STATUSES = {
  open: ["open"],
  review: ["under_review", "awaiting_evidence", "decided"],
  resolved: ["closed", "withdrawn"],
} as const satisfies Record<Tab, readonly DisputeStatus[]>;

const BRL = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function DisputesPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  // L2a revisão 8: a tela lê o MÓDULO DE DISPUTAS de verdade
  // (public.dispute_cases e tabelas relacionadas), não mais contracts filtrado
  // por status. Toda escrita passa por RPC — não há UPDATE direto aqui.
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["admin-disputes", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispute_cases")
        // Literal unica, sem concatenacao: o tipo do select precisa ser um
        // literal para o supabase-js resolver as colunas.
        .select(
          "id, case_number, contract_id, freight_id, reason_code, description, disputed_amount, currency_code, status, priority, due_at, opened_at, opened_by_role",
        )
        .in("status", TAB_STATUSES[tab])
        .order("opened_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-graphite-50">Central de disputas</h1>
          {cases.length > 0 && <Badge variant="danger">{cases.length}</Badge>}
        </div>
      </div>

      <div className="flex gap-2 border-b border-graphite-700">
        {(
          [
            { id: "open", label: "Abertas" },
            { id: "review", label: "Em análise" },
            { id: "resolved", label: "Resolvidas" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium",
              tab === t.id
                ? "border-steel-blue-400 text-steel-blue-200"
                : "border-transparent text-graphite-400 hover:text-graphite-100",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-[16px] border border-graphite-600 bg-bg-surface p-12 text-center text-graphite-400">
          Carregando…
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-[16px] border border-graphite-600 bg-bg-surface p-12 text-center text-graphite-400">
          Nenhuma disputa nesta categoria.
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <DisputeCard
              key={c.id}
              dispute={c}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CaseRow {
  id: string;
  case_number: string;
  contract_id: string;
  reason_code: string;
  description: string;
  disputed_amount: number;
  currency_code: string;
  status: string;
  priority: string;
  due_at: string | null;
  opened_at: string;
  opened_by_role: string;
}

function DisputeCard({
  dispute,
  expanded,
  onToggle,
}: {
  dispute: CaseRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<
    "release_to_carrier" | "refund_to_shipper" | "split" | "dismissed" | null
  >(null);
  const [carrierAmount, setCarrierAmount] = useState(0);
  const [shipperAmount, setShipperAmount] = useState(0);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decideRequestId = useRef<string | null>(null);
  const closeRequestId = useRef<string | null>(null);

  const days = Math.floor((Date.now() - new Date(dispute.opened_at).getTime()) / 86400000);

  // Alegações e evidências REAIS do caso — não mais texto fixo no código.
  const { data: detail } = useQuery({
    queryKey: ["dispute-detail", dispute.id],
    enabled: expanded,
    queryFn: async () => {
      const [claims, evidence, decisions] = await Promise.all([
        supabase
          .from("dispute_claims")
          .select("id, claimed_by_role, reason_code, statement, claimed_amount, created_at")
          .eq("case_id", dispute.id)
          .order("created_at"),
        supabase
          .from("dispute_evidence")
          .select("id, kind, description, content_hash, submitted_by_role, submitted_at")
          .eq("case_id", dispute.id)
          .order("submitted_at"),
        supabase
          .from("dispute_decisions")
          .select("id, outcome, decided_amount, rationale, decided_at, is_current")
          .eq("case_id", dispute.id)
          .order("decided_at", { ascending: false }),
      ]);
      return {
        claims: claims.data ?? [],
        evidence: evidence.data ?? [],
        decisions: decisions.data ?? [],
      };
    },
  });

  const current = detail?.decisions.find((d) => d.is_current);
  const decidedAmount =
    outcome === "dismissed"
      ? 0
      : outcome === "split"
        ? carrierAmount + shipperAmount
        : dispute.disputed_amount;
  const sumOk =
    outcome === "dismissed" ||
    (outcome === "split"
      ? carrierAmount + shipperAmount === decidedAmount && decidedAmount > 0
      : true);

  async function decide() {
    if (busy || !outcome || rationale.trim().length < 20 || !sumOk) return;
    setBusy(true);
    setError(null);
    if (decideRequestId.current === null) decideRequestId.current = crypto.randomUUID();

    const carrier =
      outcome === "release_to_carrier"
        ? dispute.disputed_amount
        : outcome === "split"
          ? carrierAmount
          : 0;
    const shipper =
      outcome === "refund_to_shipper"
        ? dispute.disputed_amount
        : outcome === "split"
          ? shipperAmount
          : 0;

    const { error: rpcErr } = await supabase.rpc("decide_dispute_case", {
      p_case_id: dispute.id,
      p_outcome: outcome,
      p_decided_amount: decidedAmount,
      p_carrier_amount: carrier,
      p_shipper_amount: shipper,
      p_platform_amount: 0,
      p_rationale: rationale,
      p_supersedes_decision_id: current?.id,
      p_request_id: decideRequestId.current,
    });
    setBusy(false);

    // NENHUMA MENSAGEM DE SUCESSO SEM VERIFICAR O RETORNO.
    if (rpcErr) {
      setError(`A decisão NÃO foi registrada. ${rpcErr.message}`);
      toast.error("A decisão não foi registrada");
      return;
    }
    toast.success("Decisão registrada.");
    decideRequestId.current = null;
    qc.invalidateQueries({ queryKey: ["admin-disputes"] });
    qc.invalidateQueries({ queryKey: ["dispute-detail", dispute.id] });
  }

  async function close() {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (closeRequestId.current === null) closeRequestId.current = crypto.randomUUID();
    const { error: rpcErr } = await supabase.rpc("close_dispute_case", {
      p_case_id: dispute.id,
      p_note: "Caso encerrado conforme a decisão vigente.",
      p_request_id: closeRequestId.current,
    });
    setBusy(false);
    if (rpcErr) {
      setError(`O caso NÃO foi encerrado. ${rpcErr.message}`);
      toast.error("O caso não foi encerrado");
      return;
    }
    toast.success("Caso encerrado.");
    qc.invalidateQueries({ queryKey: ["admin-disputes"] });
  }

  return (
    <div className="rounded-[16px] border border-graphite-600 bg-bg-surface p-5">
      <button onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-medium text-graphite-50">{dispute.case_number}</span>
            <Badge variant={dispute.status === "closed" ? "green" : "danger"}>
              {dispute.status}
            </Badge>
            <Badge>{dispute.reason_code}</Badge>
            <span className={cn("text-xs", days > 3 ? "text-red-400" : "text-graphite-400")}>
              {days} dias abertos
            </span>
          </div>
          <p className="mt-1 text-xs text-graphite-400">
            Valor contestado:{" "}
            <span className="font-semibold text-graphite-200">{BRL(dispute.disputed_amount)}</span>
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-graphite-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-graphite-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-5 space-y-4 border-t border-graphite-700 pt-5">
          <p className="text-xs text-graphite-300">{dispute.description}</p>

          <section className="rounded-md border border-graphite-700 p-4">
            <h4 className="text-sm font-semibold text-graphite-200">Alegações das partes</h4>
            {(detail?.claims.length ?? 0) === 0 ? (
              <p className="mt-2 text-xs text-graphite-400">Nenhuma alegação registrada.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {detail?.claims.map((c) => (
                  <li key={c.id} className="text-xs text-graphite-400">
                    <span className="font-semibold text-graphite-200">{c.claimed_by_role}</span> ·{" "}
                    {c.reason_code} — {c.statement}
                    {c.claimed_amount != null && <> · {BRL(c.claimed_amount)}</>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border border-graphite-700 p-4">
            <h4 className="text-sm font-semibold text-graphite-200">Evidências</h4>
            {(detail?.evidence.length ?? 0) === 0 ? (
              <p className="mt-2 text-xs text-graphite-400">Nenhuma evidência apresentada.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {detail?.evidence.map((e) => (
                  <li key={e.id} className="text-xs text-graphite-400">
                    <span className="font-semibold text-graphite-200">{e.kind}</span> —{" "}
                    {e.description}{" "}
                    <span className="font-mono text-[10px] text-graphite-500">
                      {e.content_hash.slice(0, 12)}…
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-graphite-500">
              Evidências são imutáveis: não podem ser alteradas nem apagadas por nenhuma parte.
            </p>
          </section>

          {(detail?.decisions.length ?? 0) > 0 && (
            <section className="rounded-md border border-graphite-700 p-4">
              <h4 className="text-sm font-semibold text-graphite-200">Histórico de decisões</h4>
              <ul className="mt-2 space-y-2">
                {detail?.decisions.map((d) => (
                  <li key={d.id} className="text-xs text-graphite-400">
                    <span
                      className={cn(
                        "font-semibold",
                        d.is_current ? "text-esg-green-400" : "text-graphite-500",
                      )}
                    >
                      {d.is_current ? "vigente" : "superada"}
                    </span>{" "}
                    · {d.outcome} · {BRL(d.decided_amount)} — {d.rationale}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dispute.status !== "closed" && dispute.status !== "withdrawn" && (
            <div className="rounded-md border-t border-graphite-700 pt-4">
              <h4 className="text-sm font-semibold text-graphite-50">
                {current ? "Corrigir a decisão" : "Decisão do administrador"}
              </h4>
              {current && (
                <p className="mt-2 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <Info className="h-4 w-4 flex-shrink-0" />A decisão vigente não é sobrescrita: uma
                  nova decisão é registrada citando a anterior.
                </p>
              )}

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                {(
                  [
                    { id: "release_to_carrier", title: "Liberar à transportadora" },
                    { id: "refund_to_shipper", title: "Reembolsar embarcador" },
                    { id: "split", title: "Divisão parcial" },
                    { id: "dismissed", title: "Improcedente" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setOutcome(opt.id)}
                    className={cn(
                      "rounded-md border p-3 text-left text-xs transition-colors",
                      outcome === opt.id
                        ? "border-steel-blue-400 bg-steel-blue-100"
                        : "border-graphite-700 hover:bg-bg-elevated",
                    )}
                  >
                    <div className="font-semibold text-graphite-50">{opt.title}</div>
                  </button>
                ))}
              </div>

              {outcome === "split" && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-graphite-400">
                    À transportadora
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={carrierAmount}
                      onChange={(e) => setCarrierAmount(+e.target.value)}
                      className="mt-1 w-full rounded-md border border-graphite-700 bg-bg-input px-2 py-1 text-graphite-50"
                    />
                  </label>
                  <label className="text-xs text-graphite-400">
                    Ao embarcador
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={shipperAmount}
                      onChange={(e) => setShipperAmount(+e.target.value)}
                      className="mt-1 w-full rounded-md border border-graphite-700 bg-bg-input px-2 py-1 text-graphite-50"
                    />
                  </label>
                  <p
                    className={cn(
                      "md:col-span-2 text-xs",
                      sumOk ? "text-graphite-400" : "text-red-400",
                    )}
                  >
                    Soma: {BRL(carrierAmount + shipperAmount)} — a divisão precisa fechar exatamente
                    o valor decidido, e o servidor recusa qualquer soma diferente.
                  </p>
                </div>
              )}

              <Textarea
                className="mt-3"
                placeholder="Fundamentação (mínimo 20 caracteres) — obrigatória e registrada na trilha."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />

              {error && (
                <p role="alert" className="mt-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  onClick={decide}
                  disabled={busy || !outcome || rationale.trim().length < 20 || !sumOk}
                >
                  {busy ? "Registrando..." : current ? "Registrar correção" : "Registrar decisão"}
                </Button>
                {dispute.status === "decided" && (
                  <Button variant="ghost" onClick={close} disabled={busy}>
                    Encerrar caso
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
