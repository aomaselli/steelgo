import { createFileRoute } from "@tanstack/react-router";
import { CarrierDashboardPage } from "@/pages/carrier/CarrierDashboardPage";

export const Route = createFileRoute("/carrier/")({
  component: CarrierDashboardPage,
});
