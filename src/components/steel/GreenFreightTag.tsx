import { cn } from "@/lib/utils";

export function GreenFreightTag({ category, className }: { category?: string | null; className?: string }) {
  const isGreen = category === "green" || category === "green_low_carbon" || category === "green_ev";
  const isEv = category === "green_ev";
  if (isGreen) {
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-esg-green/15 text-esg-green-400", className)}>
        {isEv ? "⚡ Verde EV" : "🌿 Verde"}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-graphite-700 text-graphite-200", className)}>
      Tradicional
    </span>
  );
}
