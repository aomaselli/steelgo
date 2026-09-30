// Secao reutilizavel "Compliance do Frete".
//
// Somente apresentacao. Nao calcula piso, nao decide conformidade e nao
// interpreta norma: consome o resultado ja decidido pelo banco.
// Na Fase 1 e informativa — nunca bloqueia nem declara CIOT emitido.

import { AlertTriangle, CircleHelp } from "lucide-react";
import { complianceView, type ComplianceResult, type ReasonCode } from "@/lib/complianceGate";
import { complianceTexts, type Idioma } from "@/lib/complianceGateI18n";

type Props = {
  resultado: ComplianceResult | null | undefined;
  idioma?: Idioma;
};

function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FreightComplianceSection({ resultado, idioma }: Props) {
  const t = complianceTexts(idioma);
  const vista = complianceView(resultado);

  const motivos: ReasonCode[] =
    vista.kind === "incomputable" || vista.kind === "pending" ? vista.reasons : [];

  const temValores = vista.kind === "compliant" || vista.kind === "non_compliant";

  return (
    <section className="rounded-[16px] border border-[#29405F] bg-[#0B1628] p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-[#E6EDF3]">{t.sectionTitle}</h2>
      </div>

      <p className="mt-1 text-xs text-[#8B949E]">{t.observationalNotice}</p>

      <p className="mt-4 text-sm font-medium text-[#E6EDF3]">{t.state[vista.kind]}</p>

      {temValores && (
        <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <dt className="text-[#8B949E]">{t.evaluatedAmount}</dt>
            <dd className="mt-0.5 text-[#E6EDF3]">{formatarBRL(vista.evaluated)}</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">{t.floorAmount}</dt>
            <dd className="mt-0.5 text-[#E6EDF3]">{formatarBRL(vista.floor)}</dd>
          </div>
          <div>
            <dt className="text-[#8B949E]">{t.difference}</dt>
            <dd className="mt-0.5 text-[#E6EDF3]">{formatarBRL(vista.difference)}</dd>
          </div>
        </dl>
      )}

      {motivos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {motivos.map((codigo) => (
            <li key={codigo} className="flex items-start gap-2 text-xs text-[#8B949E]">
              <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t.reason[codigo]}</span>
            </li>
          ))}
        </ul>
      )}

      {vista.kind === "non_compliant" && (
        <p className="mt-3 flex items-start gap-2 text-xs text-[#B74545]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t.observationalNotice}</span>
        </p>
      )}
    </section>
  );
}
