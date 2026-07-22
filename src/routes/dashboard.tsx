import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

const ROLE_HOME: Record<string, string> = {
    shipper: "/shipper",
    carrier: "/carrier",
    driver: "/driver",
    admin: "/admin",
};

function DashboardRedirect() {
    const { userRole } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
          const home = userRole ? (ROLE_HOME[userRole] ?? "/") : "/";
          void navigate({ to: home, replace: true });
    }, [userRole, navigate]);

    return null;
}

export const Route = createFileRoute("/dashboard")({
    component: () => (
          <ProtectedRoute>
            <DashboardRedirect />
          </ProtectedRoute>
        ),
});
