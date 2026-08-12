import { createFileRoute } from "@tanstack/react-router";
import { FinanceCenter } from "@/components/finance/FinanceCenter";

export const Route = createFileRoute("/admin/payments")({
  component: () => <FinanceCenter scope="admin" />,
});
