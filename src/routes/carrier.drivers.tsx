import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FileCheck2, Plus, ShieldCheck, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Button, Card, Input, Modal, Select, Spinner } from "@/components/steel";
import { maskCPF } from "@/lib/masks";

export const Route = createFileRoute("/carrier/drivers")({
  component: DriversPage,
});

const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];
type DriverTab = "drivers" | "invitations" | "requests";

type DriverRow = {
  id: string;
  full_name: string;
  cpf?: string | null;
  cnh_number?: string | null;
  cnh_category?: string | null;
  cnh_expiry?: string | null;
  has_mopp?: boolean | null;
  license_number?: string | null;
  license_issuer_country?: string | null;
  license_verification_status?: string | null;
};

type InvitationRow = {
  id: string;
  driver_id: string;
  status: string;
  invited_email?: string | null;
  invited_phone?: string | null;
  expires_at?: string | null;
};

type RequestRow = {
  id: string;
  status: string;
  submitted_license_number?: string | null;
  submitted_license_country?: string | null;
  message?: string | null;
  profiles?: { full_name?: string | null } | null;
};

function DriversPage() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [tab, setTab] = useState<DriverTab>("drivers");
  const [open, setOpen] = useState(false);
  const [inviteDriverId, setInviteDriverId] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", phone: "" });
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ id: string; type: "approved" | "rejected" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [form, setForm] = useState({ full_name: "", cpf: "", cnh_number: "", cnh_category: "C", cnh_expiry: "", has_mopp: false });

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase.from("carriers").select("id").eq("company_id", company!.id).maybeSingle();
      return data;
    },
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<DriverRow[]>({
    queryKey: ["carrier-drivers", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").eq("carrier_id", carrier!.id).order("created_at", { ascending: false });
      return (data ?? []) as DriverRow[];
    },
  });

  const { data: invitations = [] } = useQuery<InvitationRow[]>({
    queryKey: ["carrier-invitations", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase.from("driver_carrier_invitations").select("*").eq("carrier_id", carrier!.id).order("created_at", { ascending: false });
      return (data ?? []) as InvitationRow[];
    },
  });

  const { data: requests = [] } = useQuery<RequestRow[]>({
    queryKey: ["carrier-requests", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase.from("driver_carrier_requests").select("*, profiles(full_name)").eq("carrier_id", carrier!.id).order("created_at", { ascending: false });
      return (data ?? []) as RequestRow[];
    },
  });

  const driverLookup = useMemo(() => Object.fromEntries(drivers.map((driver) => [driver.id, driver])), [drivers]);

  const save = async () => {
    if (!carrier) return;
    if (!form.full_name) {
      toast.error(t("carrierDrivers.toastNameRequired"));
      return;
    }
    const { error } = await supabase.from("drivers").insert({
      carrier_id: carrier.id,
      full_name: form.full_name,
      cpf: form.cpf || null,
      cnh_number: form.cnh_number || null,
      cnh_category: form.cnh_category,
      cnh_expiry: form.cnh_expiry || null,
      has_mopp: form.has_mopp,
    } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("carrierDrivers.toastDriverCreated"));
    setOpen(false);
    setForm({ full_name: "", cpf: "", cnh_number: "", cnh_category: "C", cnh_expiry: "", has_mopp: false });
    qc.invalidateQueries({ queryKey: ["carrier-drivers", carrier.id] });
  };

  const createInvitation = async (driverId: string) => {
    if (!driverId) return;
    const email = inviteForm.email.trim();
    const phone = inviteForm.phone.replace(/\D/g, "");
    if (!email && !phone) {
      toast.error(t("carrierDrivers.toastNoContact"));
      return;
    }
    const { data, error } = await supabase.rpc("create_driver_invitation", {
      p_driver_id: driverId,
      p_email: email || undefined,
      p_phone: phone || undefined,
      p_expires_in_hours: 168,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const token = (data as Array<{ invitation_token?: string }> | null)?.[0]?.invitation_token ?? null;
    setInviteToken(token);
    setInviteDriverId(null);
    setInviteForm({ email: "", phone: "" });
    qc.invalidateQueries({ queryKey: ["carrier-invitations", carrier?.id] });
    toast.success(t("carrierDrivers.toastInviteCreated"));
  };

  const reviewRequest = async (requestId: string, decisionValue: "approved" | "rejected") => {
    if (!carrier) return;
    const { error } = await supabase.rpc("review_driver_carrier_request", {
      p_request_id: requestId,
      p_decision: decisionValue,
      p_driver_id: undefined,
      p_rejection_reason: decisionValue === "rejected" ? rejectReason || t("carrierDrivers.toastDefaultRejectReason") : undefined,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(decisionValue === "approved" ? t("carrierDrivers.toastRequestApproved") : t("carrierDrivers.toastRequestRejected"));
    setDecision(null);
    setRejectReason("");
    qc.invalidateQueries({ queryKey: ["carrier-requests", carrier.id] });
    qc.invalidateQueries({ queryKey: ["carrier-drivers", carrier.id] });
  };

  const reviewLicense = async (driverId: string, nextStatus: "approved" | "rejected") => {
    const { error } = await supabase.rpc("review_driver_license", {
      p_driver_id: driverId,
      p_status: nextStatus,
      p_reason: nextStatus === "rejected" ? t("carrierDrivers.toastLicenseRejectReason") : undefined,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(nextStatus === "approved" ? t("carrierDrivers.toastLicenseApproved") : t("carrierDrivers.toastLicenseRejected"));
    qc.invalidateQueries({ queryKey: ["carrier-drivers", carrier?.id] });
  };

  const renderTabButton = (key: DriverTab, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={`px-3 py-2 rounded-full text-sm font-medium transition ${
        tab === key ? "bg-[#1B6CB8] text-white" : "bg-[#161B22] text-[#8B949E]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-graphite-50">{t("carrierDrivers.title")}</h1>
          <p className="text-graphite-200 mt-1">{t("carrierDrivers.subtitle")}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> {t("carrierDrivers.addDriver")}</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {renderTabButton("drivers", t("carrierDrivers.tabDrivers"))}
        {renderTabButton("invitations", t("carrierDrivers.tabInvitations"))}
        {renderTabButton("requests", t("carrierDrivers.tabRequests"))}
      </div>

      {tab === "drivers" && (
        <>
          {driversLoading ? (
            <div className="flex justify-center p-12"><Spinner /></div>
          ) : !drivers.length ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[16px] border border-[#E3EAF3] bg-[#F8FAFD] px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF2FF] text-[#1B6CB8]">
                <UserIcon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-[#10274A]">{t("carrierDrivers.emptyDriversTitle")}</h3>
              <p className="max-w-md text-sm text-[#5B6B80]">{t("carrierDrivers.emptyDriversDesc")}</p>
              <Button onClick={() => setOpen(true)}>{t("carrierDrivers.addDriver")}</Button>
            </div>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated text-graphite-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">{t("carrierDrivers.colName")}</th>
                    <th className="text-left px-4 py-2">{t("carrierDrivers.colCpf")}</th>
                    <th className="text-left px-4 py-2">{t("carrierDrivers.colCnh")}</th>
                    <th className="text-left px-4 py-2">{t("carrierDrivers.colLicense")}</th>
                    <th className="text-left px-4 py-2">{t("carrierDrivers.colStatus")}</th>
                    <th className="text-left px-4 py-2">{t("carrierDrivers.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id} className="border-t border-graphite-700 align-top">
                      <td className="px-4 py-3 text-graphite-100">{d.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-graphite-200">{d.cpf ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-graphite-200">{d.cnh_number ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-graphite-200">{d.license_number ? `${d.license_number} · ${d.license_issuer_country ?? "BR"}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          d.license_verification_status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                          d.license_verification_status === "rejected" ? "bg-red-500/20 text-red-400" :
                          d.license_verification_status === "under_review" ? "bg-amber-500/20 text-amber-400" : "bg-slate-500/20 text-slate-300"}
                        `}>
                          {d.license_verification_status ?? "pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="ghost" onClick={() => setInviteDriverId(d.id)}>{t("carrierDrivers.invite")}</Button>
                          {d.license_number && (
                            <>
                              <Button variant="ghost" onClick={() => void reviewLicense(d.id, "approved")}>{t("carrierDrivers.approve")}</Button>
                              <Button variant="ghost" onClick={() => void reviewLicense(d.id, "rejected")}>{t("carrierDrivers.reject")}</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {tab === "invitations" && (
        <Card>
          {invitations.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[16px] border border-[#E3EAF3] bg-[#F8FAFD] px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF2FF] text-[#1B6CB8]">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-[#10274A]">{t("carrierDrivers.emptyInvitationsTitle")}</h3>
              <p className="max-w-md text-sm text-[#5B6B80]">{t("carrierDrivers.emptyInvitationsDesc")}</p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {invitations.map((inv) => {
                const driver = driverLookup[inv.driver_id];
                return (
                  <div key={inv.id} className="rounded-[12px] border border-[#30363D] bg-[#0D1117] p-3">
                    <div className="flex justify-between gap-2">
                      <div>
                        <div className="font-medium text-[#E6EDF3]">{driver?.full_name ?? t("carrierDrivers.driverFallback")}</div>
                        <div className="text-xs text-[#8B949E]">{inv.invited_email ?? inv.invited_phone ?? t("carrierDrivers.contactInInvite")}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-[#0D2744] text-[#5CB0FF]">{inv.status}</span>
                    </div>
                    <div className="mt-2 text-xs text-[#8B949E]">{t("carrierDrivers.expiresIn")} {inv.expires_at ? new Date(inv.expires_at).toLocaleString("pt-BR") : "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "requests" && (
        <Card>
          {requests.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[16px] border border-[#E3EAF3] bg-[#F8FAFD] px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF2FF] text-[#1B6CB8]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-[#10274A]">{t("carrierDrivers.emptyRequestsTitle")}</h3>
              <p className="max-w-md text-sm text-[#5B6B80]">{t("carrierDrivers.emptyRequestsDesc")}</p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {requests.map((req) => (
                <div key={req.id} className="rounded-[12px] border border-[#30363D] bg-[#0D1117] p-3">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-medium text-[#E6EDF3]">{req.profiles?.full_name ?? t("carrierDrivers.driverFallback")}</div>
                      <div className="text-xs text-[#8B949E]">{req.submitted_license_number ?? "—"} · {req.submitted_license_country ?? "BR"}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-[#1B6CB8]/20 text-[#64B5FF]">{req.status}</span>
                  </div>
                  {req.message && <div className="mt-2 text-sm text-[#C6CFD8]">{req.message}</div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => { setDecision({ id: req.id, type: "approved" }); setRejectReason(""); }}>{t("carrierDrivers.approve")}</Button>
                    <Button variant="ghost" onClick={() => { setDecision({ id: req.id, type: "rejected" }); setRejectReason(""); }}>{t("carrierDrivers.reject")}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal open={!!inviteDriverId} onClose={() => setInviteDriverId(null)} title={t("carrierDrivers.createInvitationModalTitle")}>
        <div className="space-y-3">
          <Input value={inviteForm.email} onChange={(e) => setInviteForm((s) => ({ ...s, email: e.target.value }))} placeholder={t("carrierDrivers.emailPlaceholder")} />
          <Input value={inviteForm.phone} onChange={(e) => setInviteForm((s) => ({ ...s, phone: e.target.value }))} placeholder={t("carrierDrivers.phonePlaceholder")} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteDriverId(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => inviteDriverId && void createInvitation(inviteDriverId)}>{t("carrierDrivers.generateInvite")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!inviteToken} onClose={() => setInviteToken(null)} title={t("carrierDrivers.invitationTokenModalTitle")}>
        <div className="space-y-3">
          <div className="rounded-[12px] border border-[#2F6BFF] bg-[#101827] p-3 font-mono text-xs break-all text-[#DDE8FF]">{inviteToken}</div>
          <Button
            onClick={() => {
              if (!inviteToken) return;
              void navigator.clipboard.writeText(inviteToken).catch(() => toast.error(t("carrierDrivers.toastCopyFail")));
            }}
          >
            <Copy className="w-4 h-4" /> {t("carrierDrivers.copyToken")}
          </Button>
        </div>
      </Modal>

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision?.type === "approved" ? t("carrierDrivers.approveRequestModalTitle") : t("carrierDrivers.rejectRequestModalTitle")}>
        <div className="space-y-3">
          {decision?.type === "rejected" && (
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t("carrierDrivers.rejectReasonPlaceholder")} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDecision(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => { if (!decision) return; void reviewRequest(decision.id, decision.type); }}>
              {decision?.type === "approved" ? t("common.confirm") : t("carrierDrivers.reject")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={t("carrierDrivers.addDriverModalTitle")}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-graphite-200 block mb-1">{t("carrierDrivers.fullName")}</label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">{t("carrierDrivers.colCpf")}</label>
            <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">{t("carrierDrivers.colCnh")}</label>
            <Input value={form.cnh_number} onChange={(e) => setForm({ ...form, cnh_number: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">{t("carrierDrivers.category")}</label>
            <Select value={form.cnh_category} onChange={(e) => setForm({ ...form, cnh_category: e.target.value })}>
              {CNH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">{t("carrierDrivers.cnhExpiry")}</label>
            <Input type="date" value={form.cnh_expiry} onChange={(e) => setForm({ ...form, cnh_expiry: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-graphite-100">
            <input type="checkbox" checked={form.has_mopp} onChange={(e) => setForm({ ...form, has_mopp: e.target.checked })} />
            {t("carrierDrivers.moppLabel")}
          </label>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void save()}>{t("common.save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
