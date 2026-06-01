import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/admin")({
  component: () => (
    <ProtectedRoute role="admin">
      <AppShell role="admin">
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  ),
});
