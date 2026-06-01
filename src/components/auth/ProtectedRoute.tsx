import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/steel/Spinner";
import { Zap } from "lucide-react";
import type { UserRole } from "@/types/database";

interface Props {
  children: ReactNode;
  role?: UserRole | UserRole[];
}

const ROLE_HOME: Record<UserRole, string> = {
  shipper: "/shipper",
  carrier: "/carrier",
  driver: "/carrier",
  admin: "/admin",
};

export function ProtectedRoute({ children, role }: Props) {
  const { isLoading, isAuthenticated, role: userRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: "/login" });
      return;
    }
    if (role && userRole) {
      const allowed = Array.isArray(role) ? role : [role];
      if (!allowed.includes(userRole)) {
        void navigate({ to: ROLE_HOME[userRole] });
      }
    }
  }, [isLoading, isAuthenticated, role, userRole, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[12px] bg-steel-blue animate-pulse">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <Spinner />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
