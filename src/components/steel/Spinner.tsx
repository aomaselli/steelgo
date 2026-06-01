interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2", lg: "h-10 w-10 border-[3px]" };

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-graphite-600 border-t-steel-blue ${SIZE[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
