import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/sobre")({
  component: () => <InnerPage path="sobre"/>,
});
