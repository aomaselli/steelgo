import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/tecnologia_/steel-cargo-passport")({
  component: () => <InnerPage path="tecnologia/steel-cargo-passport"/>,
});
