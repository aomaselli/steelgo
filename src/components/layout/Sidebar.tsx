import { Link, useRouterState } from "@tanstack/react-router";
import {
  Zap,
  LayoutDashboard,
  Package,
  Plus,
  FileText,
  CreditCard,
  Leaf,
  Settings,
  Search,
  Send,
  Truck,
  Wallet,
  Star,
  Users,
  AlertTriangle,
  Shield,
  ClipboardList,
  LogOut,
  LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";

export type UserRole = "shipper" | "carrier" | "driver" | "admin";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: Record<Exclude<UserRole, "driver">, NavSection[]> = {
  shipper: [
    {
      label: "Operações",
      items: [
        { label: "Dashboard", to: "/shipper", icon: LayoutDashboard },
        { label: "Meus Fretes", to: "/shipper/freights", icon: Package },
        { label: "Novo Frete", to: "/shipper/freights/new", icon: Plus },
        { label: "Contratos", to: "/shipper/contracts", icon: FileText },
      ],
    },
    {
      label: "Financeiro",
      items: [
        { label: "Pagamentos", to: "/shipper/payments", icon: CreditCard },
        { label: "ESG", to: "/shipper/esg", icon: Leaf },
      ],
    },
    {
      label: "Conta",
      items: [{ label: "Configurações", to: "/shipper/settings", icon: Settings }],
    },
  ],
  carrier: [
    {
      label: "Operações",
      items: [
        { label: "Dashboard", to: "/carrier", icon: LayoutDashboard },
        { label: "Marketplace", to: "/carrier/marketplace", icon: Search },
        { label: "Minhas Propostas", to: "/carrier/bids", icon: Send },
        { label: "Fretes Ativos", to: "/carrier/active", icon: Truck },
        { label: "Contratos", to: "/carrier/contracts", icon: FileText },
      ],
    },
    {
      label: "Gestão",
      items: [
        { label: "Recebimentos", to: "/carrier/payouts", icon: Wallet },
        { label: "Minha Frota", to: "/carrier/fleet", icon: Truck },
        { label: "Meu Score", to: "/carrier/score", icon: Star },
      ],
    },
    {
      label: "Conta",
      items: [{ label: "Configurações", to: "/carrier/settings", icon: Settings }],
    },
  ],
  admin: [
    {
      label: "Plataforma",
      items: [
        { label: "Visão Geral", to: "/admin", icon: LayoutDashboard },
        { label: "Usuários", to: "/admin/users", icon: Users },
        { label: "Fretes", to: "/admin/freights", icon: Package },
        { label: "Transportadoras", to: "/admin/carriers", icon: Truck },
        { label: "Contratos", to: "/admin/contracts", icon: FileText },
      ],
    },
    {
      label: "Financeiro",
      items: [
        { label: "Pagamentos", to: "/admin/payments", icon: CreditCard },
        { label: "Disputas", to: "/admin/disputes", icon: AlertTriangle },
      ],
    },
    {
      label: "Sistema",
      items: [
        { label: "Segurança", to: "/admin/security", icon: Shield },
        { label: "ESG", to: "/admin/esg", icon: Leaf },
        { label: "Auditoria", to: "/admin/audit", icon: ClipboardList },
        { label: "Configurações", to: "/admin/settings", icon: Settings },
      ],
    },
  ],
};

export interface SidebarProps {
  userRole: UserRole;
  className?: string;
}

export function Sidebar({ userRole, className = "" }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, signOut } = useAuth();
  const sections = userRole === "driver" ? [] : SECTIONS[userRole];

  const isActive = (to: string) =>
    to === pathname || (to !== "/" && pathname.startsWith(to + "/"));

  return (
    <aside
      className={`fixed left-0 top-0 h-screen w-[220px] bg-[#161B22] border-r border-[#30363D] flex flex-col z-40 ${className}`}
    >
      {/* Logo */}
      <div className="flex flex-row gap-2 items-center" style={{ padding: "20px 16px 16px" }}>
        <div className="w-8 h-8 bg-[#1B6CB8] rounded-[8px] flex items-center justify-center">
          <Zap size={18} className="text-white" />
        </div>
        <span className="text-[#E6EDF3] font-bold text-lg">SteelGo</span>
        <span className="text-[9px] bg-[#1B6CB8]/20 text-[#79B8F8] border border-[#1B6CB8]/30 rounded-full px-2 py-0.5">
          Beta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] text-[#484F58] uppercase tracking-widest px-2 pt-4 pb-1 font-medium">
              {section.label}
            </div>
            {section.items.map(({ label, to, icon: Icon }) => {
              const active = isActive(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm cursor-pointer transition-all w-full text-left ${
                    active
                      ? "bg-[#1B6CB8]/15 text-[#3B89D4] font-medium"
                      : "text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D]"
                  }`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-[#30363D] p-3 flex flex-row gap-2 items-center">
        <Avatar name={profile?.full_name ?? "User"} src={profile?.avatar_url ?? undefined} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-[#C9D1D9] truncate">
            {profile?.full_name ?? "Usuário"}
          </div>
          <div className="text-[10px] text-[#484F58] uppercase tracking-wide">{userRole}</div>
        </div>
        <button
          onClick={() => signOut()}
          className="text-[#484F58] hover:text-red-400 transition-colors"
          aria-label="Sair"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
