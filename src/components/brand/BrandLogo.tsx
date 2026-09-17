// Logotipo INLINE (sem requisicao HTTP a /brand/*.svg).
//
// Diagnostico (2026-09-17): o <img src="/brand/steelgo-logo*.svg"> resolvia
// (200, image/svg+xml, 569 B, 170x40) em dev, em dist/ e em .output/public. O
// defeito visual nao era a requisicao: o wordmark "SteelGo" dentro do SVG usa
// font-family "IBM Plex Sans", e um SVG carregado por <img> e um documento
// isolado - nao enxerga as fontes da pagina e nao pode baixar fontes externas.
// O texto caia na fonte generica do sistema (metricas diferentes por maquina)
// e o <img> nao tinha largura intrinseca ate o SVG chegar. Renderizado inline,
// o SVG herda a fonte ja carregada pela pagina, tem viewBox/dimensao fixos e
// nao depende de rede. A geometria e as cores sao as mesmas dos arquivos em
// public/brand (mantidos para uso externo: manifest, e-mails, materiais).
type BrandLogoProps = {
  surface?: "light" | "dark";
  markOnly?: boolean;
  className?: string;
};

const COLORS = {
  light: { blue: "#1B6CB8", green: "#1A9B5E", text: "#16263F" },
  dark: { blue: "#79B8F8", green: "#2ECC8A", text: "#E6EDF3" },
} as const;

function Mark({ blue, green }: { blue: string; green: string }) {
  return (
    <>
      <path
        d="M78 10H34c-12.7 0-23 10.3-23 23s10.3 23 23 23h28"
        fill="none"
        stroke={blue}
        strokeWidth="15"
        strokeLinecap="square"
      />
      <path
        d="M18 86h44c12.7 0 23-10.3 23-23S74.7 40 62 40H34"
        fill="none"
        stroke={green}
        strokeWidth="15"
        strokeLinecap="square"
      />
    </>
  );
}

export function BrandLogo({ surface = "light", markOnly = false, className = "" }: BrandLogoProps) {
  const c = COLORS[surface];
  if (markOnly) {
    return (
      <svg
        viewBox="0 0 96 96"
        width="96"
        height="96"
        role="img"
        aria-label="SteelGo"
        className={className}
        focusable="false"
      >
        <Mark blue={c.blue} green={c.green} />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 170 40"
      width="170"
      height="40"
      role="img"
      aria-label="SteelGo"
      className={className}
      focusable="false"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <g transform="translate(0,4) scale(0.33333)">
        <Mark blue={c.blue} green={c.green} />
      </g>
      <text x="44" y="27" fontSize="21" fontWeight="700" letterSpacing="-0.02em" fill={c.text}>
        SteelGo
      </text>
    </svg>
  );
}
