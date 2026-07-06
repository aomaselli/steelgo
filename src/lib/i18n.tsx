import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "pt" | "en" | "es";

const translations = {
  pt: {
    nav: {
      howItWorks: "Como funciona",
      forCompanies: "Para empresas",
      forCarriers: "Transportadoras",
      greenLogistics: "Logística Verde",
      security: "Segurança",
      pricing: "Preços",
      login: "Entrar",
      cta: "Começar grátis →",
    },
    hero: {
      eyebrow: "🇧🇷 Plataforma brasileira de fretes de aço",
      headline: "Transporte de aço.",
      headlineAccent: "Seguro, digital e rastreável.",
      subheadline:
        "Conecte siderúrgicas, distribuidores e indústrias a transportadoras verificadas, com contrato digital, conta protegida e rastreamento ponta a ponta.",
      ctaPrimary: "Publicar meu frete →",
      ctaSecondary: "Sou transportadora",
      trustLine: "Sem taxa de cadastro. Pague apenas quando fechar um frete.",
      stats: {
        tons: { value: "12.400+", label: "Toneladas movimentadas" },
        carriers: { value: "340+", label: "Transportadoras ativas" },
        theft: { value: "R$ 0", label: "Em roubos (2024)" },
        green: { value: "34%", label: "Fretes verdes" },
      },
    },
    howItWorks: {
      sectionLabel: "Como funciona",
      headline: "Da publicação à entrega, em uma plataforma",
      tabShipper: "Para embarcadores",
      tabCarrier: "Para transportadoras",
    },
    common: {
      save: "Salvar",
      cancel: "Cancelar",
      confirm: "Confirmar",
      loading: "Carregando...",
      success: "Sucesso",
      error: "Erro",
      required: "Obrigatório",
      optional: "Opcional",
      back: "Voltar",
      next: "Próximo",
      finish: "Concluir",
      publish: "Publicar",
      draft: "Rascunho",
      viewDetails: "Ver detalhes",
      signOut: "Sair",
      search: "Buscar",
      filter: "Filtrar",
      clear: "Limpar",
      apply: "Aplicar",
    },
    freight: {
      newFreight: "Novo frete",
      postFreight: "Publicar frete",
      myFreights: "Meus fretes",
      freightBoard: "Marketplace",
      status: {
        draft: "Rascunho",
        published: "Publicado",
        bidding: "Recebendo propostas",
        matched: "Matched",
        contract_pending: "Contrato pendente",
        contracted: "Contratado",
        in_transit: "Em trânsito",
        delivered: "Entregue",
        completed: "Concluído",
        cancelled: "Cancelado",
        disputed: "Em disputa",
      },
      category: {
        traditional: "Tradicional",
        green_low_carbon: "Verde — baixo carbono",
        green_ev: "Verde — elétrico",
      },
      steel: {
        bobina_laminada_frio: "Bobina laminada a frio",
        bobina_laminada_quente: "Bobina laminada a quente",
        chapa_grossa: "Chapa grossa",
        perfil_estrutural: "Perfil estrutural",
        cano_sem_costura: "Cano sem costura",
        barra_redonda: "Barra redonda",
        vergalhao: "Vergalhão",
        tubo_galvanizado: "Tubo galvanizado",
        blank_estampagem: "Blank para estampagem",
        outro: "Outro",
      },
      truck: {
        truck_simples: "Truck simples (23t)",
        toco: "Toco (15t)",
        truck: "Truck (23t)",
        bitruck: "Bitruck (28t)",
        carreta: "Carreta (33t)",
        carreta_extendida: "Carreta estendida (45t)",
        rodotrem: "Rodotrem (74t)",
        bitrem: "Bitrem (57t)",
        ev_carreta: "Carreta elétrica (33t)",
        ev_truck: "Truck elétrico (23t)",
      },
    },
    auth: {
      login: "Entrar",
      register: "Cadastrar",
      email: "E-mail",
      password: "Senha",
      confirmPassword: "Confirmar senha",
      forgotPassword: "Esqueci a senha",
      noAccount: "Não tem conta?",
      haveAccount: "Já tem conta?",
      createAccount: "Criar conta",
      welcomeBack: "Bem-vindo de volta",
      roleSelector: "Sou...",
      roleShipper: "Embarcador",
      roleCarrier: "Transportadora",
      roleDriver: "Motorista",
      roleShipperDesc: "Quero publicar fretes de aço",
      roleCarrierDesc: "Quero oferecer transporte",
      roleDriverDesc: "Sou motorista de uma transportadora",
    },
    contract: {
      generate: "Gerar contrato",
      preview: "Pré-visualizar",
      sign: "Assinar",
      signed: "Assinado",
      awaitingSignature: "Aguardando assinatura",
      active: "Ativo",
      completed: "Concluído",
      downloadPdf: "Baixar PDF",
    },
    payment: {
      escrowHeld: "Protegido",
      released: "Liberado",
      refunded: "Reembolsado",
      releasePayment: "Liberar pagamento",
      confirmRelease: "Confirmar liberação",
      amount: "Valor",
      platformFee: "Taxa SteelGo",
      total: "Total",
    },
  },
  en: {
    nav: {
      howItWorks: "How it works",
      forCompanies: "For companies",
      forCarriers: "For carriers",
      greenLogistics: "Green logistics",
      security: "Security",
      pricing: "Pricing",
      login: "Sign in",
      cta: "Get started free →",
    },
    hero: {
      eyebrow: "🇧🇷 Brazil's steel freight platform",
      headline: "Steel transport.",
      headlineAccent: "Secure, digital and traceable.",
      subheadline:
        "Connect steel mills, distributors and industries to verified carriers, with digital contracts, escrow and end-to-end tracking.",
      ctaPrimary: "Post my freight →",
      ctaSecondary: "I'm a carrier",
      trustLine: "No sign-up fee. Pay only when you close a freight.",
      stats: {
        tons: { value: "12,400+", label: "Tons moved" },
        carriers: { value: "340+", label: "Active carriers" },
        theft: { value: "$0", label: "Theft losses (2024)" },
        green: { value: "34%", label: "Green freights" },
      },
    },
    howItWorks: {
      sectionLabel: "How it works",
      headline: "From posting to delivery, in one platform",
      tabShipper: "For shippers",
      tabCarrier: "For carriers",
    },
    common: {
      save: "Save",
      cancel: "Cancel",
      confirm: "Confirm",
      loading: "Loading...",
      success: "Success",
      error: "Error",
      required: "Required",
      optional: "Optional",
      back: "Back",
      next: "Next",
      finish: "Finish",
      publish: "Publish",
      draft: "Draft",
      viewDetails: "View details",
      signOut: "Sign out",
      search: "Search",
      filter: "Filter",
      clear: "Clear",
      apply: "Apply",
    },
    freight: {
      newFreight: "New freight",
      postFreight: "Post freight",
      myFreights: "My freights",
      freightBoard: "Marketplace",
      status: {
        draft: "Draft",
        published: "Published",
        bidding: "Receiving bids",
        matched: "Matched",
        contract_pending: "Contract pending",
        contracted: "Contracted",
        in_transit: "In transit",
        delivered: "Delivered",
        completed: "Completed",
        cancelled: "Cancelled",
        disputed: "Disputed",
      },
      category: {
        traditional: "Traditional",
        green_low_carbon: "Green — low carbon",
        green_ev: "Green — electric",
      },
      steel: {
        bobina_laminada_frio: "Cold rolled coil",
        bobina_laminada_quente: "Hot rolled coil",
        chapa_grossa: "Heavy plate",
        perfil_estrutural: "Structural profile",
        cano_sem_costura: "Seamless pipe",
        barra_redonda: "Round bar",
        vergalhao: "Rebar",
        tubo_galvanizado: "Galvanized tube",
        blank_estampagem: "Stamping blank",
        outro: "Other",
      },
      truck: {
        truck_simples: "Light truck (23t)",
        toco: "Toco (15t)",
        truck: "Truck (23t)",
        bitruck: "Bitruck (28t)",
        carreta: "Trailer (33t)",
        carreta_extendida: "Extended trailer (45t)",
        rodotrem: "Road train (74t)",
        bitrem: "Bitrem (57t)",
        ev_carreta: "EV trailer (33t)",
        ev_truck: "EV truck (23t)",
      },
    },
    auth: {
      login: "Sign in",
      register: "Sign up",
      email: "Email",
      password: "Password",
      confirmPassword: "Confirm password",
      forgotPassword: "Forgot password",
      noAccount: "No account?",
      haveAccount: "Already have an account?",
      createAccount: "Create account",
      welcomeBack: "Welcome back",
      roleSelector: "I am a...",
      roleShipper: "Shipper",
      roleCarrier: "Carrier",
      roleDriver: "Driver",
      roleShipperDesc: "I want to post steel freights",
      roleCarrierDesc: "I want to offer transport",
      roleDriverDesc: "I drive for a carrier",
    },
    contract: {
      generate: "Generate contract",
      preview: "Preview",
      sign: "Sign",
      signed: "Signed",
      awaitingSignature: "Awaiting signature",
      active: "Active",
      completed: "Completed",
      downloadPdf: "Download PDF",
    },
    payment: {
      escrowHeld: "In escrow",
      released: "Released",
      refunded: "Refunded",
      releasePayment: "Release payment",
      confirmRelease: "Confirm release",
      amount: "Amount",
      platformFee: "SteelGo fee",
      total: "Total",
    },
  },
} as const;

type Translations = typeof translations;
type TranslationDict = Translations[keyof Translations];

function getByPath(obj: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === "string" ? cur : path;
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  raw: TranslationDict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "steelgo.language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("pt");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en" || stored === "es") {
      setLanguageState(stored as Language);
      return;
    }

    const isHomePage = window.location.pathname === "/" || window.location.pathname === "";
    if (isHomePage) {
      setLanguageState("en");
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  };

  const value = useMemo<LanguageContextValue>(() => {
    const dict = language === "es" ? translations.pt : translations[language as "pt" | "en"];
    return {
      language,
      setLanguage,
      t: (key: string) => getByPath(dict, key),
      raw: dict,
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
