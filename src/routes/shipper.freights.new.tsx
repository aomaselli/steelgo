import { createFileRoute } from "@tanstack/react-router";
import { NewFreightPage } from "@/pages/shipper/NewFreightPage";

export const Route = createFileRoute("/shipper/freights/new")({
  component: NewFreightPage,
});
