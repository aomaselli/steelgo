// Membros operacionais da empresa (alternativa B do Modulo 3): o proprietario
// convida operadores/leitores por e-mail; o token aparece UMA vez e so o
// e-mail convidado consegue aceitar. Sem escrita direta em company_members.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "@/components/steel";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchCompanyMembers,
  rpcAcceptCompanyInvitation,
  rpcChangeCompanyMemberRole,
  rpcInviteCompanyMember,
  rpcRevokeCompanyMember,
  rpcSetCompanyOperationalContact,
} from "@/lib/trips";
import { fmtDateTime } from "@/lib/tripStatus";

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  operator: "Operador",
  viewer: "Leitor",
};

export function CompanyMembersPanel() {
  const { company, companyRole, refreshCompanies } = useAuth();
  const qc = useQueryClient();
  const companyId = company?.id ?? null;
  const isOwner = companyRole === "owner";
  // a listagem (list_company_members) e do proprietario; membros so aceitam convites
  const { data: members = [], error } = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId && isOwner,
    queryFn: () => fetchCompanyMembers(companyId!),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("operator");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rid = useRef(crypto.randomUUID());
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["company-members", companyId] });
    void refreshCompanies();
  };

  async function invite() {
    if (!companyId) return;
    setBusy(true);
    try {
      const r = await rpcInviteCompanyMember(
        companyId,
        email.trim().toLowerCase(),
        role,
        72,
        rid.current,
      );
      setToken(r?.invite_token ?? null);
      toast.success("Convite criado. Copie o token: ele não será exibido de novo.");
      setEmail("");
      rid.current = crypto.randomUUID();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
      rid.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <Card variant="light" className="p-4 space-y-4 text-sm">
        <h2 className="font-medium text-[#10274A] flex items-center gap-2">
          <Users className="w-4 h-4" /> Equipe operacional
        </h2>
        <div className="text-xs text-[#54657C]">
          Você é <b>{companyRole === "operator" ? "operador" : "leitor"}</b> de{" "}
          {company?.trade_name ?? company?.name}. Convites, papéis e contato operacional são
          administrados pelo proprietário.
        </div>
        <AcceptInvitation onDone={() => void refreshCompanies()} />
      </Card>
    );
  }

  return (
    <Card variant="light" className="p-4 space-y-4 text-sm">
      <h2 className="font-medium text-[#10274A] flex items-center gap-2">
        <Users className="w-4 h-4" /> Equipe operacional
      </h2>
      <div className="text-xs text-[#54657C]">
        <b>Operador</b>: designa e reatribui motoristas, informa ETA, reconhece e resolve
        ocorrências operacionais. <b>Leitor</b>: só acompanha. Nenhum deles assina contrato, abre
        disputa ou movimenta pagamento — isso é exclusivo do proprietário.
      </div>
      {error && <div className="text-xs text-red-600">{(error as Error).message}</div>}
      <ul className="divide-y divide-[#DDE7F2]">
        {members.map((m) => (
          <li key={m.member_id} className="py-2 flex items-center justify-between gap-2">
            <div>
              <span className="text-[#10274A]">{m.label ?? m.email_masked}</span>{" "}
              <span className="text-xs text-[#54657C]">{m.email_masked}</span>
              <Badge
                variant={
                  m.member_role === "owner"
                    ? "blue"
                    : m.member_role === "operator"
                      ? "green"
                      : "gray"
                }
                className="ml-2"
              >
                {ROLE_LABEL[m.member_role] ?? m.member_role}
              </Badge>
              <Badge
                variant={
                  m.status === "active" ? "green" : m.status === "invited" ? "amber" : "danger"
                }
                className="ml-1"
              >
                {m.status}
              </Badge>
              {m.is_me && (
                <Badge variant="gray" className="ml-1">
                  você
                </Badge>
              )}
              <div className="text-[11px] text-[#7A8AA0]">
                convidado {fmtDateTime(m.invited_at)}
                {m.accepted_at ? ` · aceito ${fmtDateTime(m.accepted_at)}` : ""}
                {m.revoked_at ? ` · revogado ${fmtDateTime(m.revoked_at)}` : ""}
              </div>
            </div>
            {isOwner && m.member_role !== "owner" && m.status !== "revoked" && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const next = m.member_role === "operator" ? "viewer" : "operator";
                    const reason =
                      window.prompt(
                        `Motivo para tornar ${next === "viewer" ? "leitor" : "operador"} (mínimo 10 caracteres):`,
                      ) ?? "";
                    if (reason.trim().length < 10) return;
                    try {
                      await rpcChangeCompanyMemberRole(
                        m.member_id,
                        next,
                        reason.trim(),
                        crypto.randomUUID(),
                      );
                      toast.success("Papel alterado");
                      refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  {m.member_role === "operator" ? "Tornar leitor" : "Tornar operador"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    const reason =
                      window.prompt("Motivo da revogação (mínimo 10 caracteres):") ?? "";
                    if (reason.trim().length < 10) return;
                    try {
                      await rpcRevokeCompanyMember(m.member_id, reason.trim(), crypto.randomUUID());
                      toast.success("Acesso revogado (dispositivos push desligados)");
                      refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Revogar
                </Button>
              </div>
            )}
          </li>
        ))}
        {!members.length && (
          <li className="py-2 text-xs text-[#54657C]">Nenhum membro além do proprietário.</li>
        )}
      </ul>
      {isOwner && (
        <div className="space-y-2 pt-2 border-t border-[#DDE7F2]">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="e-mail do convidado"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 min-w-[220px]"
            />
            <Select value={role} onChange={(e) => setRole(e.target.value as "operator" | "viewer")}>
              <option value="operator">Operador</option>
              <option value="viewer">Leitor</option>
            </Select>
            <Button
              size="sm"
              disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
              onClick={() => void invite()}
            >
              Convidar (72 h)
            </Button>
          </div>
          {token && (
            <div className="rounded-[8px] bg-[#F7F9FB] p-3 text-xs">
              <div className="text-[#54657C]">
                Token do convite (exibido uma única vez). Envie ao convidado por um canal seguro;
                ele aceita em "Configurações → Aceitar convite" com o mesmo e-mail:
              </div>
              <code className="block mt-1 break-all text-[#10274A]">{token}</code>
            </div>
          )}
        </div>
      )}
      <OperationalContact />
      <AcceptInvitation onDone={refresh} />
    </Card>
  );
}

function OperationalContact() {
  const { company, companyRole } = useAuth();
  const isOwner = companyRole === "owner";
  const c = company as {
    id?: string;
    operational_contact_email?: string | null;
    operational_contact_phone?: string | null;
  } | null;
  const [email, setEmail] = useState(c?.operational_contact_email ?? "");
  const [phone, setPhone] = useState(c?.operational_contact_phone ?? "");
  const [busy, setBusy] = useState(false);
  if (!isOwner || !c?.id) return null;
  return (
    <div className="space-y-2 pt-2 border-t border-[#DDE7F2]">
      <div className="text-xs text-[#54657C]">
        Contato operacional exibido ao embarcador durante a viagem (nunca o telefone pessoal do
        motorista).
      </div>
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="e-mail operacional"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <Input
          placeholder="telefone operacional"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 min-w-[160px]"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await rpcSetCompanyOperationalContact(
                c.id!,
                email.trim() || null,
                phone.trim() || null,
                crypto.randomUUID(),
              );
              toast.success("Contato operacional salvo");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Salvar contato
        </Button>
      </div>
    </div>
  );
}

export function AcceptInvitation({ onDone }: { onDone?: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 pt-2 border-t border-[#DDE7F2]">
      <div className="text-xs text-[#54657C]">
        Recebeu um convite de outra empresa? Cole o token aqui (o e-mail da sua conta precisa ser o
        convidado).
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="token do convite"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || token.trim().length < 20}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await rpcAcceptCompanyInvitation(token.trim());
              toast.success(
                `Convite aceito: ${ROLE_LABEL[r?.member_role ?? ""] ?? r?.member_role}`,
              );
              setToken("");
              onDone?.();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Aceitar convite
        </Button>
      </div>
    </div>
  );
}
