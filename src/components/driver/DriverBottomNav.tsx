import { Link } from "@tanstack/react-router";
import { Home, FileText, AlertTriangle, List, User } from "lucide-react";

type Tab = "home" | "docs" | "sos" | "history" | "profile";

const tabs: { id: Tab; to: string; label: string; Icon: typeof Home; size: number }[] = [
  { id: "home", to: "/driver", label: "Início", Icon: Home, size: 26 },
  { id: "docs", to: "/driver/docs", label: "Docs", Icon: FileText, size: 26 },
  { id: "sos", to: "/driver/panic", label: "SOS", Icon: AlertTriangle, size: 30 },
  { id: "history", to: "/driver/history", label: "Histórico", Icon: List, size: 26 },
  { id: "profile", to: "/driver/profile", label: "Perfil", Icon: User, size: 26 },
];

export function DriverBottomNav({ active }: { active: Tab }) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex items-stretch border-t border-graphite-700 bg-bg-surface z-50"
      style={{
        height: 68,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map(({ id, to, label, Icon, size }) => {
        const isSos = id === "sos";
        const isActive = active === id;
        const color = isSos
          ? "#C23333"
          : isActive
            ? "var(--steel-blue)"
            : "var(--graphite-400)";
        return (
          <Link
            key={id}
            to={to}
            className="flex-1 flex flex-col items-center justify-center gap-1 select-none"
            style={{ color, WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
          >
            <Icon size={size} strokeWidth={isSos ? 2.4 : 2} />
            <span style={{ fontSize: 10, fontWeight: isSos || isActive ? 600 : 500 }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
