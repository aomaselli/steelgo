import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Input, Textarea } from "@/components/steel";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-graphite-50">Configurações da plataforma</h1>

      <FeesSection />
      <ScoresSection />
      <EmissionsSection />
      <NotificationsSection />
      <SecuritySection />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-graphite-600 bg-bg-surface p-5">
      <h2 className="mb-4 text-lg font-semibold text-graphite-50">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-graphite-200">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-graphite-400">{hint}</p>}
    </div>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Button
      onClick={() => {
        onClick();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
    >
      {saved ? (
        <>
          <Check className="mr-2 h-4 w-4" /> Salvo
        </>
      ) : (
        "Salvar"
      )}
    </Button>
  );
}

function FeesSection() {
  const [platformFee, setPlatformFee] = useState(3.5);
  const [minFee, setMinFee] = useState(50);
  const [escrowHours, setEscrowHours] = useState(24);
  const [disputeDays, setDisputeDays] = useState(7);

  return (
    <Section title="Tarifas e comissões">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Taxa da plataforma (%)">
          <Input type="number" step={0.1} min={0} max={10} value={platformFee} onChange={(e) => setPlatformFee(+e.target.value)} />
        </Field>
        <Field label="Taxa mínima (R$)">
          <Input type="number" value={minFee} onChange={(e) => setMinFee(+e.target.value)} />
        </Field>
        <Field label="Liberação conta protegida (horas)">
          <Input type="number" value={escrowHours} onChange={(e) => setEscrowHours(+e.target.value)} />
        </Field>
        <Field label="Prazo máximo de disputa (dias)">
          <Input type="number" value={disputeDays} onChange={(e) => setDisputeDays(+e.target.value)} />
        </Field>
      </div>
      <SaveButton onClick={() => toast.success("Tarifas atualizadas")} />
    </Section>
  );
}

function ScoresSection() {
  const [weights, setWeights] = useState({ safety: 30, punctuality: 25, esg: 20, cargo: 15, reviews: 10 });
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <Section title="Scores de transportadoras">
      <Field label="Pesos dos componentes (devem somar 100%)">
        <div className="space-y-3">
          {(Object.keys(weights) as Array<keyof typeof weights>).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-32 text-xs capitalize text-graphite-300">{k}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: +e.target.value })}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm font-bold tabular-nums text-graphite-100">{weights[k]}%</span>
            </div>
          ))}
          <div className={cn("text-right text-xs font-bold", total === 100 ? "text-esg-green-400" : "text-red-400")}>
            Total: {total}%
          </div>
        </div>
      </Field>
      <SaveButton onClick={() => toast.success("Pesos atualizados")} />
    </Section>
  );
}

function EmissionsSection() {
  const factors = [
    { type: "Diesel B10", factor: 0.082 },
    { type: "Biodiesel B20", factor: 0.061 },
    { type: "Caminhão elétrico", factor: 0.012 },
  ];

  return (
    <Section title="Fatores de emissão de CO₂">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-graphite-400">
            <th className="py-2">Tipo</th>
            <th>Fator (kg CO₂/t·km)</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((f) => (
            <tr key={f.type} className="border-t border-graphite-800">
              <td className="py-2 text-graphite-200">{f.type}</td>
              <td className="py-2">
                <Input type="number" step={0.001} defaultValue={f.factor} className="max-w-[150px]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-graphite-400">Baseado em dados do IPCC e ANTT. Atualize quando novos dados forem publicados.</p>
      <SaveButton onClick={() => toast.success("Fatores atualizados")} />
    </Section>
  );
}

function NotificationsSection() {
  return (
    <Section title="Templates de notificação">
      <Field label="WhatsApp — Proposta aceita">
        <Textarea rows={3} defaultValue="Olá {{carrier_name}}, sua proposta para o frete {{freight_id}} foi aceita!" />
      </Field>
      <Field label="WhatsApp — Checkpoint atrasado">
        <Textarea rows={3} defaultValue="Atenção: checkpoint do frete {{freight_id}} está {{minutes}} min atrasado." />
      </Field>
      <p className="text-xs text-graphite-400">Templates devem ser aprovados pela Meta antes de entrar em produção.</p>
      <SaveButton onClick={() => toast.success("Templates atualizados")} />
    </Section>
  );
}

function SecuritySection() {
  const [twoFA, setTwoFA] = useState(true);
  return (
    <Section title="Segurança">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Raio de desvio para alerta (km)">
          <Input type="number" defaultValue={2} />
        </Field>
        <Field label="Minutos de atraso para alerta">
          <Input type="number" defaultValue={30} />
        </Field>
        <Field label="Tentativas de login antes de bloquear">
          <Input type="number" defaultValue={10} />
        </Field>
        <Field label="Duração do bloqueio (minutos)">
          <Input type="number" defaultValue={15} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-graphite-200">
        <input type="checkbox" checked={twoFA} onChange={(e) => setTwoFA(e.target.checked)} />
        Exigir 2FA para administradores
      </label>
      <SaveButton onClick={() => toast.success("Segurança atualizada")} />
    </Section>
  );
}
