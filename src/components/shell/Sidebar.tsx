import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Zap,
  LayoutDashboard,
  Package,
  Plus,
  FileText,
  CreditCard,
  Leaf,
  Truck,
  Users,
  Car,
  Shield,
  ScrollText,
  Building2,
  Gavel as GavelIcon,
  Settings as SettingsIcon,
  HandHelping,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

export type ShellRole = "shipper" | "carrier" | "admin";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const NAV: Record<ShellRole, NavItem[]> = {
  shipper: [
    { to: "/shipper", labelKey: "personaNav.shipper.dashboard", icon: LayoutDashboard },
    { to: "/shipper/freights/new", labelKey: "personaNav.shipper.requestFreight", icon: Plus },
    { to: "/shipper/freights", labelKey: "personaNav.shipper.shipments", icon: Package },
    { to: "/shipper/carriers", labelKey: "personaNav.shipper.carriers", icon: Building2, disabled: true },
    { to: "/shipper/contracts", labelKey: "personaNav.shipper.documents", icon: FileText },
    { to: "/shipper/esg", labelKey: "personaNav.shipper.esg", icon: Leaf },
    { to: "/shipper/payments", labelKey: "personaNav.shipper.payments", icon: CreditCard },
    { to: "/shipper/support", labelKey: "personaNav.shipper.support", icon: HandHelping, disabled: true },
  ],
  carrier: [
    { to: "/carrier", labelKey: "personaNav.carrier.dashboard", icon: LayoutDashboard },
    { to: "/carrier/marketplace", labelKey: "personaNav.carrier.availableFreights", icon: Package },
    { to: "/carrier/active", labelKey: "personaNav.carrier.activeLoads", icon: Truck },
    { to: "/carrier/drivers", labelKey: "personaNav.carrier.drivers", icon: Users },
    { to: "/carrier/vehicles", labelKey: "personaNav.carrier.trucks", icon: Car },
    { to: "/carrier/contracts", labelKey: "personaNav.carrier.documents", icon: FileText },
    { to: "/carrier/payouts", labelKey: "personaNav.carrier.receivables", icon: CreditCard },
    { to: "/carrier/score", labelKey: "personaNav.carrier.esg", icon: Leaf },
    { to: "/carrier/support", labelKey: "personaNav.carrier.support", icon: HandHelping, disabled: true },
  ],
  admin: [
    { to: "/admin", labelKey: "personaNav.admin.dashboard", icon: LayoutDashboard },
    { to: "/admin/users", labelKey: "personaNav.admin.users", icon: Users },
    { to: "/admin/carriers", labelKey: "personaNav.admin.companies", icon: Building2 },
    { to: "/admin/carriers", labelKey: "personaNav.admin.carriers", icon: Truck },
    { to: "/admin/drivers", labelKey: "personaNav.admin.drivers", icon: Car, disabled: true },
    { to: "/admin/freights", labelKey: "personaNav.admin.freights", icon: Package },
    { to: "/admin/disputes", labelKey: "personaNav.admin.disputes", icon: GavelIcon },
    { to: "/admin/payments", labelKey: "personaNav.admin.payments", icon: CreditCard },
    { to: "/admin/esg", labelKey: "personaNav.admin.esg", icon: Leaf },
    { to: "/admin/audit", labelKey: "personaNav.admin.audit", icon: ScrollText },
    { to: "/admin/settings", labelKey: "personaNav.admin.settings", icon: SettingsIcon },
    { to: "/admin/security", labelKey: "admin.security", icon: Shield },
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
            !item.disabled &&
            (item.to === `/${role}` ? pathname === item.to : pathname.startsWith(item.to));

          if (item.disabled) {
            return (
              <div
                key={`${item.to}-${item.labelKey}`}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[#6D7E94] opacity-65"
                title={t("personaNav.comingSoon")}
              >
                <item.icon className="h-4 w-4" />
                <span>{t(item.labelKey)}</span>
              </div>
            );
          }

          return (
            <Link
              key={`${item.to}-${item.labelKey}`}
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
