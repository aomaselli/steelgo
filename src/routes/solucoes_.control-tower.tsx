import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/solucoes_/control-tower")({
  component: () => <InnerPage path="solucoes/control-tower"/>,
});
