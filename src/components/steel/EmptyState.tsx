import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * `tone` é OPT-IN (mesmo contrato de <Card variant>): o padrão continua "dark"
 * para os usos legados dentro de cards escuros. "light" reproduz o padrão das
 * telas carrier/shipper/admin (fundo branco, borda #DDE7F2, título #10274A e
 * descrição #5B6B80 — ambos com contraste AA sobre branco). `inset` remove
 * borda e fundo quando o estado vazio já está dentro de um card com borda.
 */
export type EmptyStateTone = "light" | "dark";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: EmptyStateTone;
  inset?: boolean;
}

const TONES: Record<
  EmptyStateTone,
  { box: string; icon: string; title: string; description: string }
> = {
  dark: {
    box: "border border-dashed border-graphite-700 bg-bg-surface/50",
    icon: "bg-bg-elevated text-steel-blue-400",
    title: "text-graphite-50",
    description: "text-graphite-400",
  },
  light: {
    box: "border border-[#DDE7F2] bg-white",
    icon: "bg-[#EAF2FB] text-[#1B6CB8]",
    title: "text-[#10274A]",
    description: "text-[#5B6B80]",
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "dark",
  inset = false,
}: EmptyStateProps) {
  const s = TONES[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg px-6 py-10 text-center",
        !inset && s.box,
      )}
    >
      {Icon && (
        <div className={cn("mb-3 rounded-full p-2.5", s.icon)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <h3 className={cn("text-base font-semibold", s.title)}>{title}</h3>
      {description && <p className={cn("mt-1 max-w-sm text-sm", s.description)}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
