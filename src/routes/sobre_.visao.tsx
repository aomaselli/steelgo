import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/sobre_/visao")({
  component: () => <InnerPage path="sobre/visao"/>,
});
