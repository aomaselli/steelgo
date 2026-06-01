import { createFileRoute } from "@tanstack/react-router";
import { ESGPage } from "@/pages/shipper/ESGPage";

export const Route = createFileRoute("/shipper/esg")({
  component: ESGPage,
});
