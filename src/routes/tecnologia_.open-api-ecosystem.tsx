import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/tecnologia_/open-api-ecosystem")({
  component: () => <InnerPage path="tecnologia/open-api-ecosystem"/>,
});
