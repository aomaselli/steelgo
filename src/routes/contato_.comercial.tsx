import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/contato_/comercial")({
  component: () => <InnerPage path="contato/comercial"/>,
});
