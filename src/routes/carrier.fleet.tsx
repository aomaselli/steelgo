import { createFileRoute } from "@tanstack/react-router";
import { FleetPage } from "@/pages/carrier/FleetPage";

export const Route = createFileRoute("/carrier/fleet")({
  component: FleetPage,
});
