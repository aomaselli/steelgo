import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/carrier")({
  component: () => (
    <ProtectedRoute role={["carrier", "driver"]}>
      <AppShell role="carrier">
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  ),
});
