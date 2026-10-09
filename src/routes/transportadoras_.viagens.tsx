import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/transportadoras_/viagens")({
  component: () => <InnerPage path="transportadoras/viagens"/>,
});
