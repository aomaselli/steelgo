import { createFileRoute } from "@tanstack/react-router";
import { FreightDetailPage } from "@/pages/shipper/FreightDetailPage";

export const Route = createFileRoute("/shipper/freights/$id")({
  component: FreightDetailPage,
});
