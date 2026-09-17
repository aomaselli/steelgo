// Governanca operacional (Modulo 3): scheduler, push (gates e homologacao real),
// flags, politica versionada, aviso de privacidade e tabelas legadas congeladas.
// Nada aqui "liga" push ou SOS sem os gates do servidor.
import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, Card, Input, Textarea } from "@/components/steel";
import { sha256Hex } from "@/lib/sha256";
import {
  fetchCurrentPrivacyNotice,
  fetchLegacyRecords,
  fetchPushActivationGates,
  fetchSchedulerHealth,
  rpcEnablePushDispatch,
  rpcPublishOperationalPolicy,
  rpcPublishPrivacyNotice,
  rpcSetOperationalFlag,
} from "@/lib/trips";
import { fmtDateTime } from "@/lib/tripStatus";

export const Route = createFileRoute("/admin/operations/governance")({ component: GovernancePage });

function GovernancePage() {
  const qc = useQueryClient();
  const { data: health = [] } = useQuery({
    queryKey: ["scheduler-health"],
    queryFn: fetchSchedulerHealth,
    refetchInterval: 30_000,
  });
  const { data: gates } = useQuery({
    queryKey: ["push-gates"],
    queryFn: fetchPushActivationGates,
    refetchInterval: 30_000,
  });
  const { data: notice } = useQuery({
    queryKey: ["privacy-notice", "current"],
    queryFn: fetchCurrentPrivacyNotice,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["push-gates"] });
    qc.invalidateQueries({ queryKey: ["privacy-notice"] });
    qc.invalidateQueries({ queryKey: ["scheduler-health"] });
  };
  const g = (gates ?? {}) as Record<string, unknown>;
  const platforms = (g.required_platforms ?? []) as {
    platform?: string;
    homologated_recently?: boolean;
    homologated_at?: string | null;
    publishable?: boolean;
    required?: boolean;
  }[];

  return (
    <div className="p-6 space-y-6">
      <Link
        to="/admin/operations"
        className="inline-flex items-center gap-1 text-sm text-[#1B6CB8] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" /> Control Tower
      </Link>
      <h1 className="text-2xl font-bold text-[#10274A]">Governança operacional</h1>

      <Card variant="light" className="p-4 space-y-2 text-sm">
        <h2 className="font-medium text-[#10274A]">Scheduler (pg_cron)</h2>
        {health.map((h) => (
          <div key={h.kind} className="flex items-center justify-between gap-2">
            <span className="text-[#54657C]">{h.kind}</span>
            <span className="text-[#10274A]">
              {h.last_started_at
                ? `${fmtDateTime(h.last_started_at)} · ${h.last_outcome}`
                : "nunca executou"}{" "}
              {h.stale ? <Badge variant="danger">parado</Badge> : <Badge variant="green">ok</Badge>}
              {h.last_error ? <span className="text-red-600 text-xs"> {h.last_error}</span> : null}
            </span>
          </div>
        ))}
        <div className="text-xs text-[#54657C]">
          O tick operacional roda a cada minuto (alertas, escalonamento de SOS, retenção, purga). O
          despacho de push fica inativo até a homologação real.
        </div>
      </Card>

      <Card variant="light" className="p-4 space-y-3 text-sm">
        <h2 className="font-medium text-[#10274A]">Push e alerta crítico — gates de ativação</h2>
        <pre className="text-xs bg-[#F7F9FB] p-3 rounded-[8px] overflow-x-auto text-[#10274A]">
          {JSON.stringify(gates ?? {}, null, 2)}
        </pre>
        <div className="text-xs text-[#54657C]">
          Sucesso de homologação = ACK do próprio aparelho (homologation_id + nonce), não "aceito
          pelo FCM". Sem ACK real na plataforma exigida (Android), <b>enable_push_dispatch</b> e{" "}
          <b>sos_operational</b> ficam bloqueados. iOS não está homologado nem publicável.
        </div>
        {platforms.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {platforms.map((p, i) => (
              <Badge key={i} variant={p.homologated_recently ? "green" : "gray"}>
                {p.platform}:{" "}
                {p.homologated_at
                  ? `ACK do aparelho em ${fmtDateTime(p.homologated_at)}${p.homologated_recently ? "" : " (expirado: > 30 dias)"}`
                  : "não homologado"}
                {p.publishable === false ? " · não publicável" : ""}
                {p.required ? " · exigido" : ""}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <GateButton
            label="Habilitar despacho de push"
            onRun={(rid) => rpcEnablePushDispatch(rid)}
            onDone={refresh}
          />
          <FlagButton
            flagKey="sos_operational"
            label="Marcar SOS como operacional"
            onDone={refresh}
          />
          <FlagButton
            flagKey="push_dispatch_enabled"
            label="Desligar despacho de push"
            value={false}
            onDone={refresh}
          />
        </div>
      </Card>

      <PolicyCard onDone={refresh} />
      <NoticeCard notice={notice} onDone={refresh} />
      <LegacyCard />
    </div>
  );
}

function GateButton({
  label,
  onRun,
  onDone,
}: {
  label: string;
  onRun: (rid: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const rid = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await onRun(rid.current);
          toast.success(`OK: ${JSON.stringify(r)}`);
          onDone();
        } catch (e) {
          toast.error((e as Error).message);
          rid.current = crypto.randomUUID();
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

function FlagButton({
  flagKey,
  label,
  value = true,
  onDone,
}: {
  flagKey: string;
  label: string;
  value?: boolean;
  onDone: () => void;
}) {
  const rid = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        const reason = window.prompt(`Motivo para ${label} (mínimo 20 caracteres):`) ?? "";
        if (reason.trim().length < 20) return;
        setBusy(true);
        try {
          await rpcSetOperationalFlag(flagKey, value, reason.trim(), rid.current);
          toast.success("Flag atualizada");
          onDone();
        } catch (e) {
          toast.error((e as Error).message);
          rid.current = crypto.randomUUID();
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

function PolicyCard({ onDone }: { onDone: () => void }) {
  const [json, setJson] = useState('{\n  "geofence_radius_m": 300\n}');
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  async function publish() {
    let values: Record<string, unknown>;
    try {
      values = JSON.parse(json);
    } catch {
      toast.error("JSON inválido");
      return;
    }
    setBusy(true);
    try {
      const r = await rpcPublishOperationalPolicy(values, reason.trim(), rid.current);
      toast.success(`Política v${r?.version} publicada`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card variant="light" className="p-4 space-y-3 text-sm">
      <h2 className="font-medium text-[#10274A]">Política operacional (versionada, append-only)</h2>
      <div className="text-xs text-[#54657C]">
        Publicar uma nova versão congela os valores para viagens NOVAS; viagens em andamento mantêm
        a versão em que nasceram. Informe apenas as chaves a alterar.
      </div>
      <Textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        className="font-mono text-xs"
        rows={6}
      />
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (mínimo 20 caracteres)"
      />
      <Button size="sm" disabled={busy || reason.trim().length < 20} onClick={() => void publish()}>
        Publicar nova versão
      </Button>
    </Card>
  );
}

function NoticeCard({
  notice,
  onDone,
}: {
  notice: Awaited<ReturnType<typeof fetchCurrentPrivacyNotice>> | undefined;
  onDone: () => void;
}) {
  const [version, setVersion] = useState("1.0");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("https://steelgobr.com.br/privacidade/motorista/v1");
  const [effective, setEffective] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  async function publish() {
    if (body.trim().length < 500) {
      toast.error("O texto precisa ter ao menos 500 caracteres.");
      return;
    }
    if (/placeholder|rascunho|todo/i.test(body)) {
      toast.error("O texto não pode conter placeholder/rascunho/TODO.");
      return;
    }
    setBusy(true);
    try {
      const local = await sha256Hex(body);
      const r = await rpcPublishPrivacyNotice(
        version.trim(),
        body,
        new Date(effective).toISOString(),
        url.trim() || null,
        rid.current,
      );
      setHash(r?.body_sha256 ?? null);
      toast.success(
        `Aviso v${r?.version} publicado · SHA-256 ${r?.body_sha256?.slice(0, 12)}… (local ${local.slice(0, 12)}…)`,
      );
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card variant="light" className="p-4 space-y-3 text-sm">
      <h2 className="font-medium text-[#10274A]">Aviso de privacidade do motorista</h2>
      {notice?.published ? (
        <div className="text-xs text-[#54657C]">
          Vigente: v{notice.version} desde {fmtDateTime(notice.effective_from)} · SHA-256{" "}
          {notice.sha256.slice(0, 16)}…{" "}
          {notice.url ? (
            <a className="underline" href={notice.url} target="_blank" rel="noreferrer">
              URL
            </a>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-red-700">
          Nenhum aviso publicado. Enquanto isso: sem sessão de rastreamento, sem reconhecimento e
          sem ingestão de localização.
        </div>
      )}
      <div className="text-xs text-[#54657C]">
        Cole aqui SOMENTE o texto final aprovado pela fundadora
        (docs/lgpd/aviso-privacidade-motorista-v1.md, sem os marcadores de rascunho). O servidor
        grava o SHA-256 do corpo.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="Versão (ex.: 1.0)"
        />
        <Input
          type="datetime-local"
          value={effective}
          onChange={(e) => setEffective(e.target.value)}
        />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL pública" />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        placeholder="Texto final (Markdown), mínimo 500 caracteres"
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={busy || !effective || body.trim().length < 500}
          onClick={() => void publish()}
        >
          Publicar aviso
        </Button>
        {hash && <span className="text-xs text-[#54657C]">SHA-256 gravado: {hash}</span>}
      </div>
    </Card>
  );
}

function LegacyCard() {
  const [kind, setKind] = useState<
    "checkpoints" | "driver_positions" | "security_alerts" | "security_alerts_tracking"
  >("security_alerts");
  const { data = [] } = useQuery({
    queryKey: ["legacy", kind],
    queryFn: () => fetchLegacyRecords(kind, 50),
  });
  return (
    <Card variant="light" className="p-4 space-y-2 text-sm">
      <h2 className="font-medium text-[#10274A]">
        Tabelas legadas (congeladas, somente leitura administrativa)
      </h2>
      <div className="flex gap-2 flex-wrap">
        {(
          [
            "checkpoints",
            "driver_positions",
            "security_alerts",
            "security_alerts_tracking",
          ] as const
        ).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "primary" : "outline"}
            onClick={() => setKind(k)}
          >
            {k}
          </Button>
        ))}
      </div>
      <div className="text-xs text-[#54657C]">
        Registros anteriores ao Módulo 3. Nenhuma escrita é aceita nestas tabelas; os fluxos novos
        usam operational_trips e derivadas.
      </div>
      <pre className="text-xs bg-[#F7F9FB] p-3 rounded-[8px] overflow-x-auto max-h-64 text-[#10274A]">
        {JSON.stringify(data, null, 1)}
      </pre>
    </Card>
  );
}
