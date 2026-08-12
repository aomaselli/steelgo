import { createFileRoute } from "@tanstack/react-router";
import { FinanceCenter } from "@/components/finance/FinanceCenter";

export const Route = createFileRoute("/shipper/payments")({
  component: () => <FinanceCenter scope="shipper" />,
});
