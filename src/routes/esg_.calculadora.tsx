import { createFileRoute } from "@tanstack/react-router";
import { InnerPage } from "@/components/home-v5/InnerPage";

export const Route = createFileRoute("/esg_/calculadora")({
  component: () => <InnerPage path="esg/calculadora"/>,
});
