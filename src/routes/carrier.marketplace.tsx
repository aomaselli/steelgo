import { createFileRoute } from "@tanstack/react-router";
import { MarketplacePage } from "@/pages/carrier/MarketplacePage";

export const Route = createFileRoute("/carrier/marketplace")({
  component: MarketplacePage,
});
