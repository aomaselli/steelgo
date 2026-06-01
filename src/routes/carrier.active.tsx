import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/carrier/active")({
  component: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <h1 className="text-2xl font-semibold text-[#E6EDF3]">Fretes Ativos</h1>
    </div>
  ),
});
