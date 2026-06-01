import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/driver")({
  component: () => (
    <ProtectedRoute role={["driver", "carrier"]}>
      <Outlet />
    </ProtectedRoute>
  ),
});
