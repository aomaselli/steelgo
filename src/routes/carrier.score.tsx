import { createFileRoute } from "@tanstack/react-router";
import { ScorePage } from "@/pages/carrier/ScorePage";

export const Route = createFileRoute("/carrier/score")({
  component: ScorePage,
});
