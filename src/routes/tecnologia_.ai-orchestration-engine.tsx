import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/tecnologia_/ai-orchestration-engine")({
  component: () => <InnerPage path="tecnologia/ai-orchestration-engine"/>,
});
