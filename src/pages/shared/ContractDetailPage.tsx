import { AppShell } from "@/components/layout/AppShell";
import { ContractDetailView } from "@/components/contract/ContractDetailView";

interface Props {
  contractId: string;
  viewerRole: "shipper" | "carrier";
}

export function ContractDetailPage({ contractId, viewerRole }: Props) {
  return (
    <AppShell title="Detalhe do Contrato">
      <ContractDetailView contractId={contractId} viewerRole={viewerRole} />
    </AppShell>
  );
}
