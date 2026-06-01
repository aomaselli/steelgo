import { createFileRoute, useParams } from "@tanstack/react-router";
import { ContractDetailPage } from "@/pages/shared/ContractDetailPage";

export const Route = createFileRoute("/shipper/contracts/$id")({
  component: Page,
});

function Page() {
  const { id } = useParams({ from: "/shipper/contracts/$id" });
  return <ContractDetailPage contractId={id} viewerRole="shipper" />;
}
