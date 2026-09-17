// Disposicao da carga (Modulo 3): carga embarcada com contrato encerrado.
// Encerramento SOMENTE por resolucao administrativa explicita, com motivo,
// nota, evidencias (obrigatorias na liberacao de emergencia) e evento proprio.
//
// Evidencia: sobe no bucket privado trip-media, pasta <trip>/<request_id>/,
// kind "evidence", sem upsert; o servidor confere prefixo, hash, MIME e tamanho
// (assert_trip_media) e recusa a RPC sem ela. O request_id e mantido entre
// tentativas: retry nao repete upload (409 com o mesmo sha256 = sucesso) e nao
// duplica a resolucao (idempotencia). A opcao emergency_release so fica
// utilizavel com evidencia anexada.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Trash2 } from "lucide-react";
import { Button, Card, Input, Modal, Select, Textarea } from "@/components/steel";
import { rpcResolveCargoDisposition, uploadTripMedia, type TripDetail } from "@/lib/trips";
import { CARGO_DISPOSITION_LABEL, type CargoDisposition } from "@/lib/tripStatus";
import { detectEvidenceType, EVIDENCE_MAX_BYTES, sha256HexOfBuffer } from "@/lib/sha256";

type Picked = {
  key: string;
  file: File;
  sha256: string;
  mime: string;
  uploaded: { path: string; sha256: string } | null;
  error: string | null;
};

const MIN_BYTES = 1024;

export function CargoDispositionPanel({ trip, onDone }: { trip: TripDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [disp, setDisp] = useState<CargoDisposition>("returned_to_origin");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [place, setPlace] = useState("");
  const [custodian, setCustodian] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "resolving" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // request_id estavel entre tentativas: pasta da evidencia + idempotencia da RPC
  const rid = useRef(crypto.randomUUID());
  // occurred_at entra no fingerprint de idempotencia: fixado na 1a tentativa
  const occurredAt = useRef<string | null>(null);

  const isEmergency = disp === "emergency_release";
  const minReason = isEmergency ? 50 : 20;
  const evidenceReady = files.length > 0 && files.every((f) => !f.error);
  const canSubmit =
    confirm &&
    reason.trim().length >= minReason &&
    note.trim().length >= 20 &&
    (!isEmergency || evidenceReady) &&
    (disp !== "transferred_to_custodian" || custodian.trim().length >= 3);

  async function pick(list: FileList | null) {
    if (!list) return;
    const next: Picked[] = [];
    for (const file of Array.from(list)) {
      const buf = await file.arrayBuffer();
      const type = detectEvidenceType(buf);
      const sha256 = await sha256HexOfBuffer(buf);
      let error: string | null = null;
      if (!type) error = "Tipo não permitido (somente JPEG, PNG ou PDF, pelos bytes do arquivo).";
      else if (file.size < MIN_BYTES) error = "Arquivo muito pequeno (mínimo 1 KB).";
      else if (file.size > EVIDENCE_MAX_BYTES) error = "Arquivo acima de 10 MB.";
      next.push({
        key: crypto.randomUUID(),
        file,
        sha256,
        mime: type?.mime ?? file.type,
        uploaded: null,
        error,
      });
    }
    setFiles((prev) => [...prev, ...next]);
  }

  async function uploadAll(): Promise<{ path: string; sha256: string }[] | null> {
    const out: { path: string; sha256: string }[] = [];
    for (const f of files) {
      if (f.error) return null;
      if (f.uploaded) {
        out.push(f.uploaded);
        continue; // retry: nao repete upload
      }
      try {
        const blob = new Blob([await f.file.arrayBuffer()], { type: f.mime });
        const r = await uploadTripMedia({
          tripId: trip.id,
          commandId: rid.current,
          kind: "evidence",
          blob,
          sha256: f.sha256,
        });
        const uploaded = { path: r.path, sha256: r.sha256 };
        setFiles((prev) => prev.map((x) => (x.key === f.key ? { ...x, uploaded } : x)));
        out.push(uploaded);
      } catch (e) {
        setFiles((prev) =>
          prev.map((x) => (x.key === f.key ? { ...x, error: (e as Error).message } : x)),
        );
        return null;
      }
    }
    return out;
  }

  async function submit() {
    setBusy(true);
    setErrorMsg(null);
    try {
      setPhase("uploading");
      const evidence = await uploadAll();
      if (evidence === null) {
        setPhase("error");
        setErrorMsg(
          "Falha no envio da evidência. Corrija e tente de novo (o que já subiu não é reenviado).",
        );
        return;
      }
      if (isEmergency && evidence.length < 1) {
        setPhase("error");
        setErrorMsg("Liberação de emergência exige ao menos uma evidência.");
        return;
      }
      setPhase("resolving");
      const r = await rpcResolveCargoDisposition({
        tripId: trip.id,
        disposition: disp,
        reason: reason.trim(),
        note: note.trim(),
        occurredAt: (occurredAt.current ??= new Date().toISOString()),
        lat: null,
        lng: null,
        locationText: place.trim() || null,
        custodianLabel: custodian.trim() || null,
        evidence,
        isEmergency,
        requestId: rid.current,
      });
      setPhase("done");
      toast.success(
        r?.was_replayed
          ? "Disposição já estava registrada (retentativa idempotente)."
          : `Disposição registrada: ${CARGO_DISPOSITION_LABEL[disp]}. Viagem encerrada.`,
      );
      setOpen(false);
      onDone();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setPhase("error");
      setErrorMsg((e as Error).message);
      // recusa definitiva (validacao/permissao): nova tentativa exige novo request_id
      // e, portanto, nova pasta de evidencia -> descarta os uploads (mantem os arquivos).
      if (code === "22023" || code === "42501" || code === "23505" || code === "P0002") {
        rid.current = crypto.randomUUID();
        occurredAt.current = null;
        setFiles((prev) => prev.map((x) => ({ ...x, uploaded: null })));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="light" className="p-4 border-red-300 bg-red-50 space-y-2 text-sm">
      <div className="font-semibold text-red-800">
        Carga embarcada com contrato encerrado — disposição obrigatória
      </div>
      <div className="text-red-900">
        A viagem permanece viva e rastreável. O encerramento só acontece por esta resolução
        explícita, com motivo, nota, evidência (obrigatória na liberação de emergência) e evento
        próprio.
      </div>
      <Button
        size="sm"
        variant="danger"
        onClick={() => setOpen(true)}
        data-testid="open-disposition"
      >
        Registrar disposição da carga
      </Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Disposição da carga">
        <div className="space-y-3">
          <Select
            value={disp}
            onChange={(e) => setDisp(e.target.value as CargoDisposition)}
            data-testid="disposition-select"
          >
            {Object.entries(CARGO_DISPOSITION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
                {k === "emergency_release" ? " (exige evidência)" : ""}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Local (texto)"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
          {disp === "transferred_to_custodian" && (
            <Input
              placeholder="Custodiante (rótulo, sem dados pessoais)"
              value={custodian}
              onChange={(e) => setCustodian(e.target.value)}
            />
          )}
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isEmergency ? "Motivo forte (mínimo 50 caracteres)" : "Motivo (mínimo 20 caracteres)"
            }
            data-testid="disposition-reason"
          />
          <div className="text-[11px] text-[#54657C]">
            {reason.trim().length}/{minReason} caracteres mínimos
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota operacional (mínimo 20 caracteres)"
            data-testid="disposition-note"
          />

          <div className="rounded-[8px] border border-[#DDE7F2] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#10274A]">
                Evidências {isEmergency ? "(obrigatórias)" : "(opcionais)"} — JPEG, PNG ou PDF, 1 KB
                a 10 MB
              </span>
              <label className="inline-flex items-center gap-1 text-xs text-[#1B6CB8] cursor-pointer">
                <FileUp className="w-3 h-3" /> anexar
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  data-testid="evidence-input"
                  onChange={(e) => void pick(e.target.files)}
                />
              </label>
            </div>
            {files.length === 0 && (
              <div className="text-xs text-[#54657C]">Nenhuma evidência anexada.</div>
            )}
            {files.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {f.uploaded ? (
                    <CheckCircle2 className="inline w-3 h-3 text-emerald-600 mr-1" />
                  ) : f.error ? (
                    <AlertTriangle className="inline w-3 h-3 text-red-600 mr-1" />
                  ) : null}
                  {f.file.name} · {Math.round(f.file.size / 1024)} KB · {f.mime} · sha{" "}
                  {f.sha256.slice(0, 12)}…
                  {f.error ? (
                    <span className="text-red-600"> {f.error}</span>
                  ) : f.uploaded ? (
                    <span className="text-emerald-700"> enviado</span>
                  ) : null}
                </span>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                    className="text-[#54657C]"
                    aria-label="remover"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {isEmergency && !evidenceReady && (
            <div className="text-xs text-red-700">
              Liberação de emergência: anexe ao menos uma evidência válida para habilitar a
              confirmação.
            </div>
          )}
          <label className="flex items-start gap-2 text-xs text-[#10274A]">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              data-testid="disposition-confirm"
            />
            <span>
              Confirmo que esta disposição encerra a viagem <b>{trip.trip_number}</b> de forma
              irreversível, com registro do meu usuário, data e evidências.
            </span>
          </label>
          {phase === "error" && errorMsg && (
            <div className="text-xs text-red-700" data-testid="disposition-error">
              {errorMsg}
            </div>
          )}
          {phase === "uploading" && (
            <div className="text-xs text-[#54657C]">Enviando evidências…</div>
          )}
          {phase === "resolving" && (
            <div className="text-xs text-[#54657C]">Registrando disposição…</div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy || !canSubmit}
              onClick={() => void submit()}
              data-testid="disposition-submit"
            >
              {busy ? "Registrando…" : "Confirmar disposição"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
