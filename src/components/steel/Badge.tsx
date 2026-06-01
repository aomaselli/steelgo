import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-bg-elevated text-graphite-100",
        blue: "bg-steel-blue-100 text-steel-blue-400",
        green: "bg-esg-green-100 text-esg-green",
        amber: "bg-amber-100 text-amber-400",
        gray: "bg-graphite-700 text-graphite-200",
        danger: "bg-red-500/15 text-red-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
