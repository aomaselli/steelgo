import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/shipper")({
  component: () => (
    <ProtectedRoute role="shipper">
      <AppShell role="shipper">
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  ),
});
