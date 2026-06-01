import { createFileRoute } from "@tanstack/react-router";
import { AdminESGPage } from "@/pages/admin/AdminESGPage";

export const Route = createFileRoute("/admin/esg")({
  component: AdminESGPage,
});
