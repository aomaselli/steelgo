import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { DisputeCaseView } from "@/components/dispute/DisputeCaseView";

export const Route = createFileRoute("/shipper/disputes/$id")({
  component: Page,
});

function Page() {
  const { id } = useParams({ from: "/shipper/disputes/$id" });
  return (
    <div className="space-y-4">
      <Link to="/shipper/disputes" className="text-xs text-steel-blue-300 hover:underline">
        ← Disputas
      </Link>
      <DisputeCaseView
        caseId={id}
        contractLink={(contractId, label) => (
          <Link to="/shipper/contracts/$id" params={{ id: contractId }}>
            {label}
          </Link>
        )}
      />
    </div>
  );
}
