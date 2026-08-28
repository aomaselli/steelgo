import { ContractDetailView } from "@/components/contract/ContractDetailView";

interface Props {
  contractId: string;
  viewerRole: "shipper" | "carrier";
}

export function ContractDetailPage({ contractId, viewerRole }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#10274A]">Detalhe do Contrato</h1>
      <ContractDetailView contractId={contractId} viewerRole={viewerRole} />
    </div>
  );
}
