import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Zap,
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
import { useLanguage } from "@/lib/i18n";

export type ShellRole = "shipper" | "carrier" | "admin";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const NAV: Record<ShellRole, NavItem[]> = {
  shipper: [
    { to: "/shipper", labelKey: "Dashboard", icon: LayoutDashboard },
    { to: "/shipper/freights", labelKey: "Meus fretes", icon: Package },
    { to: "/shipper/contracts", labelKey: "Contratos", icon: FileText },
    { to: "/shipper/payments", labelKey: "Pagamentos", icon: CreditCard },
    { to: "/shipper/esg", labelKey: "ESG", icon: Leaf },
  ],
  carrier: [
    { to: "/carrier", labelKey: "Dashboard", icon: LayoutDashboard },
    { to: "/carrier/marketplace", labelKey: "Marketplace", icon: Store },
    { to: "/carrier/bids", labelKey: "Minhas ofertas", icon: Gavel },
    { to: "/carrier/trips", labelKey: "Viagens", icon: Truck },
    { to: "/carrier/contracts", labelKey: "Contratos", icon: FileText },
    { to: "/carrier/drivers", labelKey: "Motoristas", icon: Users },
    { to: "/carrier/vehicles", labelKey: "Veículos", icon: Car },
    { to: "/carrier/payments", labelKey: "Pagamentos", icon: CreditCard },
  ],
  admin: [
    { to: "/admin", labelKey: "admin.dashboard", icon: LayoutDashboard },
    { to: "/admin/users", labelKey: "admin.users", icon: Users },
    { to: "/admin/carriers", labelKey: "admin.carriers", icon: Building2 },
    { to: "/admin/freights", labelKey: "admin.freights", icon: Package },
    { to: "/admin/disputes", labelKey: "admin.disputes", icon: GavelIcon },
    { to: "/admin/security", labelKey: "admin.security", icon: Shield },
    { to: "/admin/esg", labelKey: "admin.esg", icon: Leaf },
    { to: "/admin/audit", labelKey: "admin.audit", icon: ScrollText },
    { to: "/admin/settings", labelKey: "admin.settings", icon: SettingsIcon },
  ],
};

export function Sidebar({ role }: { role: ShellRole }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useLanguage();
  const items = NAV[role];
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#22334A] bg-[#16263F] md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-[#22334A] px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#1A9B5E]">
          <Zap size={18} className="text-white" />
        </div>
        <span className="text-lg font-bold text-[#E6EAF0]">SteelGo</span>
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
                  ? "bg-[#2FA98A]/20 text-[#E6EAF0]"
                  : "text-[#B3C0CF] hover:bg-[#1F314D] hover:text-[#E6EAF0]",
              )}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
