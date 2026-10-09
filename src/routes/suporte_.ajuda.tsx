import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/suporte_/ajuda")({
  component: () => <InnerPage path="suporte/ajuda"/>,
});
