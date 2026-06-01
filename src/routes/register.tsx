import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import type { UserRole } from "@/types/database";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({
    role: (s.role as UserRole | undefined) ?? undefined,
  }),
  component: RegisterRoute,
});

function RegisterRoute() {
  const { role } = Route.useSearch();
  const initial =
    role === "shipper" || role === "carrier" || role === "driver" ? role : undefined;
  return <RegisterPage initialRole={initial} />;
}
