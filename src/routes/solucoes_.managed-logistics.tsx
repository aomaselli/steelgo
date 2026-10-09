import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/solucoes_/managed-logistics")({
  component: () => <InnerPage path="solucoes/managed-logistics"/>,
});
