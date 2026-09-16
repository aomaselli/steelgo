import { createFileRoute, Link } from "@tanstack/react-router";
import { DisputeListPage } from "@/pages/shared/DisputeListPage";

export const Route = createFileRoute("/carrier/disputes/")({
  component: () => (
    <DisputeListPage
      title="Disputas"
      scope="mine"
      renderLink={(r) => (
        <Link
          to="/carrier/disputes/$id"
          params={{ id: r.case_id }}
          className="font-mono font-semibold text-steel-blue-300 hover:underline"
        >
          {r.case_number}
        </Link>
      )}
    />
  ),
});
