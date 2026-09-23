import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CompanyGate } from "@/components/shell/CompanyGate";
import { OnboardingGate } from "@/components/shell/OnboardingGate";

export const Route = createFileRoute("/carrier")({
  component: () => (
    <ProtectedRoute role={["carrier", "driver"]}>
      <OnboardingGate>
        <CompanyGate>
          <AppShell role="carrier">
            <Outlet />
          </AppShell>
        </CompanyGate>
      </OnboardingGate>
    </ProtectedRoute>
  ),
});
