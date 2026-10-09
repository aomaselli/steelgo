import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/solucoes_/steelgo-network")({
  component: () => <InnerPage path="solucoes/steelgo-network"/>,
});
