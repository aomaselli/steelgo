import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Star, BadgeCheck, Truck, Settings, ChevronRight } from "lucide-react";
import { DriverShell } from "@/components/driver/DriverShell";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/driver/profile")({ component: ProfilePage });

function ProfilePage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name ?? "Motorista";
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <DriverShell activeTab="profile">
      <header className="px-4 pt-5 pb-3">
        <h1 className="text-[18px] font-medium text-graphite-50">Perfil</h1>
      </header>

      <div className="mx-4 rounded-[16px] bg-bg-surface p-5 flex items-center gap-4">
        <div
          className="rounded-full flex items-center justify-center bg-steel-blue/15 border-2 border-steel-blue text-steel-blue-400 font-semibold"
          style={{ width: 64, height: 64, fontSize: 22 }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] text-graphite-50 font-medium truncate">{name}</div>
          <div className="text-[13px] text-graphite-200 truncate">{profile?.email}</div>
          <div className="flex items-center gap-1 mt-1">
            <BadgeCheck size={14} className="text-steel-blue-400" />
            <span className="text-[12px] text-steel-blue-400">Motorista verificado</span>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <Stat icon={<Star size={20} className="text-amber-400 fill-amber-400" />} value="4.9" label="Avaliação" />
        <Stat icon={<Truck size={20} className="text-steel-blue-400" />} value="127" label="Entregas" />
      </div>

      <nav className="mx-4 mt-4 rounded-[14px] bg-bg-surface overflow-hidden">
        <Row icon={<BadgeCheck size={20} />} label="Meus documentos" onClick={() => navigate({ to: "/driver/docs" })} />
        <Row icon={<Settings size={20} />} label="Preferências" />
        <Row icon={<LogOut size={20} />} label="Sair" danger onClick={() => signOut().then(() => navigate({ to: "/login" }))} last />
      </nav>
    </DriverShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-[12px] bg-bg-surface p-3.5 text-center">
      <div className="flex items-center justify-center gap-1.5">
        {icon}
        <span className="text-[20px] font-medium text-graphite-50 tabular-nums">{value}</span>
      </div>
      <div className="text-[12px] text-graphite-200 mt-0.5">{label}</div>
    </div>
  );
}

function Row({
  icon, label, onClick, danger, last,
}: { icon: React.ReactNode; label: string; onClick?: () => void; danger?: boolean; last?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 text-left"
      style={{
        minHeight: 56,
        borderBottom: last ? undefined : "1px solid #21262D",
        color: danger ? "#F87171" : "#E6EDF3",
      }}
    >
      <span style={{ color: danger ? "#F87171" : "#8B949E" }}>{icon}</span>
      <span className="flex-1 text-[15px]">{label}</span>
      <ChevronRight size={18} className="text-graphite-400" />
    </button>
  );
}
