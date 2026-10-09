import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/tecnologia_/driver-app")({
  component: () => <InnerPage path="tecnologia/driver-app"/>,
});
