import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CompanyGate } from "@/components/shell/CompanyGate";

export const Route = createFileRoute("/shipper")({
  component: () => (
    <ProtectedRoute role="shipper">
      <CompanyGate>
        <AppShell role="shipper">
          <Outlet />
        </AppShell>
      </CompanyGate>
    </ProtectedRoute>
  ),
});
