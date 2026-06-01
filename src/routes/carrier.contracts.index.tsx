import { createFileRoute } from "@tanstack/react-router";
import { CarrierContractsPage } from "@/pages/carrier/CarrierContractsPage";

export const Route = createFileRoute("/carrier/contracts/")({
  component: CarrierContractsPage,
});
