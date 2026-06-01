import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Camera, CheckCircle2, Clock, Lock, BadgeCheck } from "lucide-react";
import { DriverShell } from "@/components/driver/DriverShell";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageUtils";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/driver/docs")({ component: DocsPage });

function DocsPage() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [docType, setDocType] = useState<"cnh" | "mopp" | "other">("cnh");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  const { data: driver, refetch } = useQuery({
    queryKey: ["driver-self", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("drivers")
        .select("*")
        .eq("profile_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const daysToExpiry = driver?.cnh_expiry
    ? Math.ceil((new Date(driver.cnh_expiry).getTime() - Date.now()) / 86400000)
    : null;
  const expiring = daysToExpiry != null && daysToExpiry < 30 && daysToExpiry > 0;

  async function handleFile(file: File) {
    const blob = await compressImage(file, 1200, 0.85);
    setPendingBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function upload() {
    if (!pendingBlob || !user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${docType}_${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("driver-docs")
        .upload(path, pendingBlob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      toast.success("Documento enviado");
      setPendingBlob(null);
      setPreviewUrl(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <DriverShell activeTab="docs">
      <header className="px-4 pt-5 pb-3">
        <h1 className="text-[18px] font-medium text-graphite-50">Documentos</h1>
      </header>

      {expiring && (
        <div
          className="mx-4 rounded-[14px] p-3.5 flex items-start gap-2.5"
          style={{ background: "#1F1500", border: "1px solid #CC8800" }}
        >
          <AlertCircle size={24} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-[13px] text-amber-400 font-medium">CNH vence em {daysToExpiry} dias</div>
            <div className="text-[12px] text-graphite-200">Renove antes de expirar</div>
          </div>
        </div>
      )}

      <div className="mt-3 mx-4 rounded-[14px] bg-bg-surface overflow-hidden">
        <DocRow
          label="CNH"
          subtitle={driver?.cnh_category ? `${driver.cnh_category} · vence ${driver?.cnh_expiry ?? "—"}` : "Não cadastrada"}
          status={driver?.cnh_doc_url ? "ok" : "missing"}
          color="#1B6CB8"
          icon={<BadgeCheck size={22} className="text-white" />}
        />
        <DocRow
          label="MOPP"
          subtitle={driver?.has_mopp ? "Habilitado" : "Não habilitado"}
          status={driver?.has_mopp ? "ok" : "warn"}
          color="#1A9B5E"
          icon={<BadgeCheck size={22} className="text-white" />}
          last
        />
      </div>

      {!previewUrl ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="block mx-4 mt-4 w-[calc(100%-2rem)] rounded-[14px] p-7 flex flex-col items-center"
          style={{ background: "#21262D", border: "2px dashed #30363D" }}
        >
          <Camera size={36} className="text-graphite-200" />
          <div className="text-[15px] text-graphite-50 mt-2">Fotografar documento</div>
          <div className="text-[13px] text-graphite-200">Toque para abrir a câmera</div>
        </button>
      ) : (
        <div className="mx-4 mt-4 rounded-[14px] bg-bg-surface p-3">
          <img src={previewUrl} alt="" className="rounded-[10px] w-full" />
          <div className="mt-3">
            <div className="text-[13px] text-graphite-200 mb-2">Qual documento é este?</div>
            <div className="grid grid-cols-3 gap-2">
              {(["cnh", "mopp", "other"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDocType(t)}
                  className="rounded-[10px] py-2 text-[13px]"
                  style={{
                    background: docType === t ? "#0D2744" : "#21262D",
                    border: `1px solid ${docType === t ? "#1B6CB8" : "#30363D"}`,
                    color: docType === t ? "#79B8F8" : "#C9D1D9",
                  }}
                >
                  {t === "cnh" ? "CNH" : t === "mopp" ? "MOPP" : "Outro"}
                </button>
              ))}
            </div>
            <button
              onClick={upload}
              disabled={uploading}
              className="mt-3 w-full rounded-[12px] bg-steel-blue text-white font-medium disabled:opacity-60"
              style={{ height: 52, fontSize: 15 }}
            >
              {uploading ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <div className="flex items-center justify-center gap-1 mt-6 px-4 text-graphite-400" style={{ fontSize: 11 }}>
        <Lock size={11} />
        Seus documentos ficam salvos com segurança
      </div>
    </DriverShell>
  );
}

function DocRow({
  label,
  subtitle,
  status,
  color,
  icon,
  last,
}: {
  label: string;
  subtitle: string;
  status: "ok" | "warn" | "missing";
  color: string;
  icon: React.ReactNode;
  last?: boolean;
}) {
  const StatusIcon = status === "ok" ? CheckCircle2 : status === "warn" ? Clock : AlertCircle;
  const statusColor = status === "ok" ? "#2ECC8A" : status === "warn" ? "#F0A500" : "#F87171";
  return (
    <div
      className="flex items-center gap-3 px-4"
      style={{ minHeight: 68, borderBottom: last ? undefined : "1px solid #21262D" }}
    >
      <div className="rounded-[12px] flex items-center justify-center" style={{ width: 44, height: 44, background: color }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-graphite-50">{label}</div>
        <div className="text-[12px] text-graphite-200 truncate">{subtitle}</div>
      </div>
      <StatusIcon size={22} style={{ color: statusColor }} />
    </div>
  );
}
