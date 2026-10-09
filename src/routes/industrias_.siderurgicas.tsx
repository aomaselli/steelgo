import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/industrias_/siderurgicas")({
  component: () => <InnerPage path="industrias/siderurgicas"/>,
});
