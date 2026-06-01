import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/payments")({
  component: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <h1 className="text-2xl font-semibold text-[#E6EDF3]">Pagamentos</h1>
    </div>
  ),
});
