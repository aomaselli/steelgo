import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/industrias_/varejo")({
  component: () => <InnerPage path="industrias/varejo"/>,
});
