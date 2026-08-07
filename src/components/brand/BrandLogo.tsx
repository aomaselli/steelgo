type BrandLogoProps = {
  surface?: "light" | "dark";
  markOnly?: boolean;
  className?: string;
};

export function BrandLogo({
  surface = "light",
  markOnly = false,
  className = "",
}: BrandLogoProps) {
  const variant = surface === "dark" ? "-dark" : "";
  const asset = markOnly
    ? `/brand/steelgo-mark${variant}.svg`
    : `/brand/steelgo-logo${variant}.svg`;

  return (
    <img
      src={asset}
      alt="SteelGo"
      className={className}
      draggable={false}
    />
  );
}
