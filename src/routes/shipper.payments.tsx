import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPage } from "@/pages/shipper/PaymentsPage";

export const Route = createFileRoute("/shipper/payments")({
  component: PaymentsPage,
});
