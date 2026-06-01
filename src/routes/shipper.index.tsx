import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/pages/shipper/DashboardPage";

export const Route = createFileRoute("/shipper/")({
  component: DashboardPage,
});
