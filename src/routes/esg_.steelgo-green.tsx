import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/esg_/steelgo-green")({
  component: () => <InnerPage path="esg/steelgo-green"/>,
});
