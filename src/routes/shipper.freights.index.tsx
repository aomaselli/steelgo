import { createFileRoute } from "@tanstack/react-router";
import { FreightsPage } from "@/pages/shipper/FreightsPage";

export const Route = createFileRoute("/shipper/freights/")({
  component: FreightsPage,
});
