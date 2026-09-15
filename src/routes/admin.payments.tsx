import { createFileRoute } from "@tanstack/react-router";
import { AdminFinanceOps } from "@/components/finance/AdminFinanceOps";

export const Route = createFileRoute("/admin/payments")({
  component: () => <AdminFinanceOps />,
});
