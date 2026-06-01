import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  trendDirection?: "up" | "down" | "neutral";
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, trendDirection = "neutral", className }: StatCardProps) {
  const trendColor =
    trendDirection === "up"
      ? "text-esg-green"
      : trendDirection === "down"
        ? "text-red-400"
        : "text-graphite-400";
  return (
    <div className={cn("rounded-lg border border-graphite-700 bg-bg-surface p-5", className)}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-steel-blue-400" />}
      </div>
      <div className="mt-2 text-2xl font-bold text-graphite-50">{value}</div>
      {trend && <div className={cn("mt-1 text-xs", trendColor)}>{trend}</div>}
    </div>
  );
}
