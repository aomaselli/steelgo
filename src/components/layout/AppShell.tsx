import { ReactNode, useState } from "react";
import { Sidebar, type UserRole } from "./Sidebar";
import { Topbar, type BreadcrumbItem } from "./Topbar";
import { useAuth } from "@/contexts/AuthContext";

export interface AppShellProps {
  children: ReactNode;
  title?: string;
  breadcrumb?: BreadcrumbItem[];
}

export function AppShell({ children, title, breadcrumb }: AppShellProps) {
  const { role } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const effectiveRole: UserRole = (role as UserRole) ?? "shipper";
  const isCarrierShell = effectiveRole === "carrier";

  if (effectiveRole === "driver") {
    return <>{children}</>;
  }

  return (
    <div className={`flex h-screen overflow-hidden ${isCarrierShell ? "bg-[#F4F7FB]" : "bg-[#0D1117]"}`}>
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar userRole={effectiveRole} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full animate-in slide-in-from-left">
            <Sidebar userRole={effectiveRole} />
          </div>
        </div>
      )}

      <div className={`flex flex-col flex-1 md:ml-[220px] min-w-0 ${isCarrierShell ? "bg-[#F4F7FB]" : "bg-transparent"}`}>
        <Topbar
          title={title}
          breadcrumb={breadcrumb}
          showMenu
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className={`flex-1 overflow-y-auto p-6 ${isCarrierShell ? "bg-[#F4F7FB]" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
