import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  FileText,
  CreditCard,
  Leaf,
  Store,
  Gavel,
  Truck,
  Users,
  Car,
  Shield,
  ScrollText,
  Building2,
  Gavel as GavelIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ShellRole = "shipper" | "carrier" | "admin";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: Record<ShellRole, NavItem[]> = {
  shipper: [
    { to: "/shipper", label: "Dashboard", icon: LayoutDashboard },
    { to: "/shipper/freights", label: "Meus fretes", icon: Package },
    { to: "/shipper/contracts", label: "Contratos", icon: FileText },
    { to: "/shipper/payments", label: "Pagamentos", icon: CreditCard },
    { to: "/shipper/esg", label: "ESG", icon: Leaf },
  ],
  carrier: [
    { to: "/carrier", label: "Dashboard", icon: LayoutDashboard },
    { to: "/carrier/marketplace", label: "Marketplace", icon: Store },
    { to: "/carrier/bids", label: "Minhas ofertas", icon: Gavel },
    { to: "/carrier/trips", label: "Viagens", icon: Truck },
    { to: "/carrier/contracts", label: "Contratos", icon: FileText },
    { to: "/carrier/drivers", label: "Motoristas", icon: Users },
    { to: "/carrier/vehicles", label: "Veículos", icon: Car },
    { to: "/carrier/payments", label: "Pagamentos", icon: CreditCard },
  ],
  admin: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/users", label: "Usuários", icon: Users },
    { to: "/admin/carriers", label: "Transportadoras", icon: Building2 },
    { to: "/admin/freights", label: "Fretes", icon: Package },
    { to: "/admin/disputes", label: "Disputas", icon: GavelIcon },
    { to: "/admin/security", label: "Segurança", icon: Shield },
    { to: "/admin/esg", label: "ESG", icon: Leaf },
    { to: "/admin/audit", label: "Auditoria", icon: ScrollText },
    { to: "/admin/settings", label: "Configurações", icon: SettingsIcon },
  ],
};

export function Sidebar({ role }: { role: ShellRole }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV[role];
  return (
    <aside className="hidden w-60 shrink-0 border-r border-graphite-800 bg-bg-surface md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-graphite-800 px-5">
        <div className="h-7 w-7 rounded bg-steel-blue-400" />
        <span className="text-lg font-bold text-graphite-50">SteelGo</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active =
            item.to === `/${role}` ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-steel-blue-100 text-steel-blue-400"
                  : "text-graphite-200 hover:bg-bg-elevated hover:text-graphite-50",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
