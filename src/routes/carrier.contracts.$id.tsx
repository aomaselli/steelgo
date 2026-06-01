import { createFileRoute, useParams } from "@tanstack/react-router";
import { ContractDetailPage } from "@/pages/shared/ContractDetailPage";

export const Route = createFileRoute("/carrier/contracts/$id")({
  component: Page,
});

function Page() {
  const { id } = useParams({ from: "/carrier/contracts/$id" });
  return <ContractDetailPage contractId={id} viewerRole="carrier" />;
}
