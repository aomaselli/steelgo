import { createFileRoute } from "@tanstack/react-router";
import { FinanceCenter } from "@/components/finance/FinanceCenter";

export const Route = createFileRoute("/carrier/payouts")({
  component: () => <FinanceCenter scope="carrier" />,
});
