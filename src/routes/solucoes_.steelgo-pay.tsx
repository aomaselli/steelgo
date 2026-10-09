import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/solucoes_/steelgo-pay")({
  component: () => <InnerPage path="solucoes/steelgo-pay"/>,
});
