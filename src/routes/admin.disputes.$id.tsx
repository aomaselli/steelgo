import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { DisputeCaseView } from "@/components/dispute/DisputeCaseView";

export const Route = createFileRoute("/admin/disputes/$id")({
  component: Page,
});

function Page() {
  const { id } = useParams({ from: "/admin/disputes/$id" });
  return (
    <div className="space-y-4">
      <Link to="/admin/disputes" className="text-xs text-steel-blue-300 hover:underline">
        ← Central de disputas
      </Link>
      <DisputeCaseView
        caseId={id}
        contractLink={(contractId, label) => <Link to="/admin/contracts">{label}</Link>}
      />
    </div>
  );
}
