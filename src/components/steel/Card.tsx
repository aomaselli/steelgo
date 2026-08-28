import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * `variant` é OPT-IN. O padrão continua "dark" — nenhum dos 61 usos existentes
 * de <Card> muda de aparência. A variante "light" reproduz o padrão visual já
 * aprovado nas telas carrier (branco, borda #DDE7F2, sombra discreta).
 */
export type CardVariant = "dark" | "light";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const CARD_VARIANTS: Record<CardVariant, string> = {
  dark: "border-graphite-700 bg-bg-surface text-graphite-100 shadow-sm",
  light: "border-[#DDE7F2] bg-white text-[#10274A] shadow-[0_8px_18px_rgba(16,39,74,0.04)]",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "dark", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border p-6", CARD_VARIANTS[variant], className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-4 flex flex-col gap-1", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold text-graphite-50", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-graphite-400", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("", className)} {...props} />,
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-4 flex items-center gap-2", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
