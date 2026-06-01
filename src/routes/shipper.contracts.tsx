import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "@/pages/shipper/ContractsPage";

export const Route = createFileRoute("/shipper/contracts")({
  component: ContractsPage,
});
