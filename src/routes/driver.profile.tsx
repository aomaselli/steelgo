import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Star, BadgeCheck, Truck, Settings, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DriverShell } from "@/components/driver/DriverShell";
import { useAuth } from "@/contexts/AuthContext";
import { DriverPrivacyCard } from "@/components/trip/DriverPrivacyCard";
import { unregisterPush } from "@/lib/pushClient";
import { clearOutbox, flushOutbox } from "@/lib/outbox";
import { tripTracker } from "@/lib/geoTracker";

export const Route = createFileRoute("/driver/profile")({ component: ProfilePage });

function ProfilePage() {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();

  // O selo dizia "Motorista verificado" para qualquer conta. Aqui ele passa a
  // repetir o que o banco registra sobre a CNH — inclusive quando é "pending".
  const { data: licenseStatus } = useQuery<string | null>({
    queryKey: ["driver-license-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("license_verification_status")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.license_verification_status as string | null) ?? null;
    },
  });
  const licenseApproved = licenseStatus === "approved";
  const licenseLabel =
    licenseStatus === "approved"
      ? "CNH verificada"
      : licenseStatus === "rejected"
        ? "CNH recusada"
        : licenseStatus
          ? "CNH em verificação"
          : "Sem registro de motorista";
  const name = profile?.full_name ?? "Motorista";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
            <BadgeCheck
              size={14}
              className={licenseApproved ? "text-steel-blue-400" : "text-graphite-200"}
            />
            <span
              className={`text-[12px] ${licenseApproved ? "text-steel-blue-400" : "text-graphite-200"}`}
            >
              {licenseLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 4.9 e 127 eram literais, iguais para toda conta. Enquanto não houver
          avaliação e contagem apuradas, a tela declara a ausência. */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <Stat
          icon={<Star size={20} className="text-graphite-200" />}
          value="—"
          label="Sem avaliação"
        />
        <Stat
          icon={<Truck size={20} className="text-graphite-200" />}
          value="—"
          label="Entregas não apuradas"
        />
      </div>

      <DriverPrivacyCard />

      <nav className="mx-4 mt-4 rounded-[14px] bg-bg-surface overflow-hidden">
        <Row
          icon={<BadgeCheck size={20} />}
          label="Meus documentos"
          onClick={() => navigate({ to: "/driver/docs" })}
        />
        <Row icon={<Settings size={20} />} label="Preferências" />
        <Row
          icon={<LogOut size={20} />}
          label="Sair"
          danger
          onClick={() =>
            tripTracker
              .dispose("logout")
              .then(() => flushOutbox().catch(() => undefined))
              .then(() => Promise.all([unregisterPush("logout"), clearOutbox()]))
              .then(() => signOut())
              .then(() => navigate({ to: "/login" }))
          }
          last
        />
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
  icon,
  label,
  onClick,
  danger,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
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
