import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-full bg-bg-elevated font-medium text-graphite-100",
        sizeMap[size],
        className,
      )}
    >
      {src ? <img src={src} alt={name ?? ""} className="h-full w-full object-cover" /> : initials}
    </div>
  );
}
