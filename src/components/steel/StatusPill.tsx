import { cn } from "@/lib/utils";

const labels: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-graphite-700 text-graphite-100" },
  published: { label: "Publicado", cls: "bg-steel-blue/20 text-steel-blue-200" },
  bidding: { label: "Em leilão", cls: "bg-steel-blue/20 text-steel-blue-200" },
  matched: { label: "Matched", cls: "bg-amber/20 text-amber-400" },
  contract_pending: { label: "Contrato pendente", cls: "bg-amber/20 text-amber-400" },
  contracted: { label: "Contratado", cls: "bg-esg-green/20 text-esg-green-400" },
  in_transit: { label: "Em trânsito", cls: "bg-steel-blue/20 text-steel-blue-200" },
  delivered: { label: "Entregue", cls: "bg-esg-green/20 text-esg-green-400" },
  completed: { label: "Concluído", cls: "bg-esg-green/20 text-esg-green-400" },
  cancelled: { label: "Cancelado", cls: "bg-red-900/30 text-red-400" },
  pending: { label: "Pendente", cls: "bg-graphite-700 text-graphite-100" },
  accepted: { label: "Aceita", cls: "bg-esg-green/20 text-esg-green-400" },
  rejected: { label: "Rejeitada", cls: "bg-red-900/30 text-red-400" },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const it = labels[status] ?? { label: status, cls: "bg-graphite-700 text-graphite-100" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", it.cls, className)}>
      {it.label}
    </span>
  );
}
