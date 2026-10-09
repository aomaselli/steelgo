import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/recursos_/guias")({
  component: () => <InnerPage path="recursos/guias"/>,
});
