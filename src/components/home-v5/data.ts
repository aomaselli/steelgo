// Non-translatable structure for Home v5 (ids, paths, geometry, factors). Texts live in src/lib/i18n.home.ts.
import type { Language } from "@/lib/i18n";

export const NAV_SLUGS = [
  "solucoes",
  "tecnologia",
  "industrias",
  "recursos",
  "transportadoras",
  "esg",
  "sobre",
  "contato",
  "suporte"
] as const;
export type NavSlug = (typeof NAV_SLUGS)[number];

/** Measured width (px) the one-row header needs per language (logo + 9 menus + actions). Below it → compact navigation. */
export const NAV_NEED: Record<Language, number> = {
  "pt": 1192,
  "en": 1156,
  "es": 1266
};

/** Internal pillar ids → planned public paths (ids and paths preserved; "green" is SteelGo ESG). */
export const PILLAR_PATH: Record<string, string> = {
  "platform": "solucoes/steelgo-platform",
  "control-tower": "solucoes/control-tower",
  "network": "solucoes/steelgo-network",
  "pay": "solucoes/steelgo-pay",
  "managed-logistics": "solucoes/managed-logistics",
  "compliance-suite": "tecnologia/compliance-suite",
  "driver-app": "tecnologia/driver-app",
  "cargo-passport": "tecnologia/steel-cargo-passport",
  "ai-orchestration": "tecnologia/ai-orchestration-engine",
  "open-api": "tecnologia/open-api-ecosystem",
  "green": "esg/steelgo-green"
};

export const HOME_SOLUTIONS: [pillar: string, group: "base" | "ops" | "trust" | "value"][] = [["platform","base"],["control-tower","ops"],["driver-app","ops"],["compliance-suite","trust"],["cargo-passport","trust"],["pay","value"]];
export const AUD_PATHS = ["industrias","transportadoras","tecnologia/driver-app","industrias/industria"];
export const MENU: Record<NavSlug, { path: string }[]> = {
  "solucoes": [
    {
      "path": "solucoes/steelgo-platform"
    },
    {
      "path": "solucoes/control-tower"
    },
    {
      "path": "solucoes/steelgo-network"
    },
    {
      "path": "solucoes/steelgo-pay"
    },
    {
      "path": "solucoes/managed-logistics"
    }
  ],
  "tecnologia": [
    {
      "path": "tecnologia/compliance-suite"
    },
    {
      "path": "tecnologia/driver-app"
    },
    {
      "path": "tecnologia/steel-cargo-passport"
    },
    {
      "path": "tecnologia/ai-orchestration-engine"
    },
    {
      "path": "tecnologia/open-api-ecosystem"
    }
  ],
  "industrias": [
    {
      "path": "industrias/siderurgicas"
    },
    {
      "path": "industrias/distribuidores"
    },
    {
      "path": "industrias/industria"
    },
    {
      "path": "industrias/varejo"
    }
  ],
  "recursos": [
    {
      "path": "recursos/guias"
    },
    {
      "path": "recursos/integracoes"
    },
    {
      "path": "esg/calculadora"
    }
  ],
  "transportadoras": [
    {
      "path": "solucoes/steelgo-network"
    },
    {
      "path": "transportadoras/homologacao"
    },
    {
      "path": "transportadoras/viagens"
    },
    {
      "path": "tecnologia/driver-app"
    }
  ],
  "esg": [
    {
      "path": "esg/steelgo-green"
    },
    {
      "path": "esg/calculadora"
    },
    {
      "path": "esg/eficiencia"
    },
    {
      "path": "esg/indicadores"
    }
  ],
  "sobre": [
    {
      "path": "sobre/visao"
    },
    {
      "path": "sobre/pilares"
    }
  ],
  "contato": [
    {
      "path": "contato/comercial"
    },
    {
      "path": "register"
    }
  ],
  "suporte": [
    {
      "path": "suporte/ajuda"
    },
    {
      "path": "suporte/canais"
    }
  ]
};

// ---- Control Tower map (illustrative, fictitious data) ----
export const CITIES: Record<string, [x: number, y: number, name: string]> = {"ipatinga":[434,57,"Ipatinga"],"bh":[358,83,"Belo Horizonte"],"betim":[344,86,"Betim"],"perdoes":[295,152,"Perdões"],"pouso":[249,219,"Pouso Alegre"],"sp":[211,296,"São Paulo"],"serra":[556,96,"Serra"],"venda":[511,108,"Venda Nova"],"manhuacu":[462,103,"Manhuaçu"],"ouro":[371,119,"Ouro Branco"],"registro":[145,351,"Registro"],"curitiba":[67,407,"Curitiba"]};
export const TRIPS: { id: string; path: string[]; p: number; km: number; t: number; eta: string; s: number }[] = [
  {
    "id": "SG-24817",
    "path": [
      "ipatinga",
      "bh",
      "perdoes",
      "pouso",
      "sp"
    ],
    "p": 0.62,
    "km": 842,
    "t": 33,
    "eta": "15:20",
    "s": 12
  },
  {
    "id": "SG-24809",
    "path": [
      "serra",
      "venda",
      "manhuacu",
      "betim"
    ],
    "p": 0.38,
    "km": 520,
    "t": 28,
    "eta": "17:05",
    "s": 8
  },
  {
    "id": "SG-24802",
    "path": [
      "ouro",
      "pouso",
      "sp",
      "registro",
      "curitiba"
    ],
    "p": 0.78,
    "km": 1010,
    "t": 32,
    "eta": "19:40",
    "s": 21
  }
];

// ---- CO2 calculator (illustrative factors; environmental dimension only) ----
export const FUELS: [key: "diesel" | "b100" | "ev", ratioToDiesel: number][] = [["diesel",1],["b100",0.36],["ev",0.12]];
export const KG_CO2_PER_TKM_DIESEL = 0.08921;
