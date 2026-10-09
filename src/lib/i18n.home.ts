// Home v5 translations — PT / EN / ES.
// Register this dictionary in the existing mechanism (src/lib/i18n.tsx) under the `home` namespace:
//   import { HOME_I18N } from "./i18n.home";
//   pt: { ...existing pt keys, home: HOME_I18N.pt }, en: { ..., home: HOME_I18N.en }, es: { ..., home: HOME_I18N.es }
// Components read it with useHomeCopy(); t("home.hero.title1") also resolves through the existing getByPath.
// Keys (route paths, trip ids) are internal identifiers and are NOT translated.

export const HOME_I18N = {
  "pt": {
    "nav": [
      "Soluções",
      "Tecnologia",
      "Indústrias",
      "Recursos",
      "Transportadoras",
      "ESG",
      "Sobre",
      "Contato",
      "Suporte"
    ],
    "navLabel": "Principal",
    "langLabel": "Idioma",
    "signIn": "Entrar",
    "cta": "Solicitar acesso",
    "open": "Abrir menu",
    "close": "Fechar menu",
    "hero": {
      "eyebrow": "Tecnologia para logística industrial",
      "title1": "Conectando a logística industrial",
      "title2": " na América Latina.",
      "sub": "Fretes, documentos, pagamentos e rastreamento em uma única operação para embarcadores, transportadoras e motoristas.",
      "primary": "Solicitar acesso",
      "secondary": "Entrar"
    },
    "map": {
      "product": "Central de Operações",
      "title": "Rastreamento ao vivo",
      "live": "GPS a cada 30 s",
      "trips": "Fretes em trânsito",
      "progress": "Progresso",
      "next": "Próximo checkpoint",
      "eta": "Chegada prevista",
      "zoomIn": "Aproximar",
      "zoomOut": "Afastar",
      "deviation": "Sem desvio de rota",
      "updated": "Posição atualizada há {s} s",
      "illustrative": "Visualização ilustrativa · dados fictícios",
      "aria": "Mapa da rota {r}, {p} concluído"
    },
    "sol": {
      "eyebrow": "Soluções SteelGo",
      "title": "Controle integrado da sua operação logística.",
      "sub": "Conecte viagens, documentos, conformidade e pagamentos, com inteligência e rastreabilidade em uma única plataforma.",
      "all": "Explorar todas as soluções",
      "action": "Conhecer solução",
      "audiences": "Para quem",
      "groups": {
        "base": "Base",
        "ops": "Operação",
        "trust": "Confiança e conformidade",
        "value": "Valor e integração"
      },
      "aud": [
        "Embarcadores",
        "Transportadoras",
        "Motoristas",
        "Indústrias"
      ]
    },
    "calc": {
      "eyebrow": "SteelGo ESG · Ambiental",
      "title": "Estime o CO₂ antes de contratar.",
      "sub": "Compare combustíveis por tonelada-quilômetro e escolha o cenário de menor impacto para cada rota.",
      "link": "Conhecer SteelGo ESG",
      "distance": "Distância",
      "weight": "Peso da carga",
      "fuel": "Combustível",
      "fuels": [
        "Diesel",
        "Biodiesel B100",
        "Elétrico (EV)"
      ],
      "result": "CO₂ estimado",
      "reference": "Referência diesel",
      "reduction": "Redução vs. diesel",
      "trees": "Equivale a {n} árvores absorvendo CO₂ por 1 ano.",
      "treesNone": "Cenário de referência.",
      "distErr": "Informe entre 1 e 5.000 km",
      "weightErr": "Informe entre 1 e 74 t",
      "ok": "Valor válido",
      "empty": "Preencha este campo",
      "negative": "Use um valor positivo",
      "invalid": "Use apenas números (ex.: 620 ou 42,5)",
      "suspended": "Corrija os campos para ver a estimativa.",
      "note": "Estimativa ilustrativa da dimensão ambiental; não constitui avaliação ESG nem certificação. Fórmula: distância × peso × fator de emissão. Fatores ilustrativos (kg CO₂/t·km): Diesel 0,0892 · Biodiesel B100 0,0321 · Elétrico 0,0107."
    },
    "foot": {
      "tagline": "A infraestrutura digital logística da América Latina.",
      "contact": "Fale conosco",
      "cols": [
        "Plataforma",
        "Empresa",
        "Legal"
      ],
      "legal": [
        "Termos de uso",
        "Privacidade",
        "Cookies"
      ]
    },
    "ui": {
      "overviewOf": "Visão geral de",
      "overview": "Visão geral"
    },
    "langNames": {
      "pt": "Português",
      "en": "English",
      "es": "Español"
    },
    "pages": {
      "titles": {
        "solucoes/steelgo-platform": "Plataforma SteelGo",
        "solucoes/control-tower": "Central de Operações",
        "solucoes/steelgo-network": "Rede SteelGo",
        "solucoes/steelgo-pay": "SteelGo Pay",
        "solucoes/managed-logistics": "Apoio Operacional",
        "tecnologia/compliance-suite": "Documentação e Conformidade",
        "tecnologia/driver-app": "App do Motorista",
        "tecnologia/steel-cargo-passport": "Passaporte Digital da Carga",
        "tecnologia/ai-orchestration-engine": "Automação Inteligente",
        "tecnologia/open-api-ecosystem": "Integrações e APIs",
        "esg/steelgo-green": "SteelGo ESG",
        "industrias/siderurgicas": "Siderúrgicas",
        "industrias/distribuidores": "Distribuidores",
        "industrias/industria": "Indústrias",
        "industrias/varejo": "Varejo",
        "recursos/guias": "Guias da plataforma",
        "recursos/integracoes": "Documentação de integrações",
        "esg/calculadora": "Calculadora de CO₂",
        "transportadoras/homologacao": "Homologação e requisitos",
        "transportadoras/viagens": "Operação de viagens",
        "esg/eficiencia": "Eficiência e retorno vazio",
        "esg/indicadores": "Indicadores e evidências ESG",
        "sobre/visao": "Visão da SteelGo",
        "sobre/pilares": "Arquitetura dos 11 pilares",
        "contato/comercial": "Contato comercial",
        "suporte/ajuda": "Ajuda por perfil",
        "suporte/canais": "Canais de atendimento",
        "register": "Solicitar acesso"
      },
      "descriptions": {
        "solucoes/steelgo-platform": "A base que conecta embarcadores, transportadoras e motoristas em uma única operação.",
        "solucoes/control-tower": "Visibilidade de viagens, prazos, ocorrências, documentos e desempenho.",
        "solucoes/steelgo-network": "Rede privada de transportadoras homologadas.",
        "solucoes/steelgo-pay": "Pagamentos, split, antecipação, seguro e crédito por parceiros autorizados.",
        "solucoes/managed-logistics": "Tecnologia acompanhada por operação humana em situações críticas.",
        "tecnologia/compliance-suite": "Homologação, requisitos regulatórios e bloqueios preventivos.",
        "tecnologia/driver-app": "Execução da viagem com GPS, checkpoints, fotos, documentos, POD e modo offline.",
        "tecnologia/steel-cargo-passport": "Histórico digital e auditável da carga e da viagem.",
        "tecnologia/ai-orchestration-engine": "Agentes para viagens, documentos, compliance, pátio, finanças e exceções.",
        "tecnologia/open-api-ecosystem": "Integrações com ERP, TMS, telemetria, documentos, pagamentos e validações.",
        "esg/steelgo-green": "Indicadores ambientais, sociais e de governança para a operação logística.",
        "industrias/siderurgicas": "Escoamento de bobinas, chapas e vergalhões com rastreabilidade.",
        "industrias/distribuidores": "Transferências entre unidades e entregas a clientes.",
        "industrias/industria": "Recebimento de insumos e envio de produtos com documentos vinculados.",
        "industrias/varejo": "Abastecimento de lojas e centros de distribuição.",
        "recursos/guias": "Passo a passo por perfil: embarcador, transportadora e motorista.",
        "recursos/integracoes": "Referência técnica para ERP, TMS, telemetria e pagamentos.",
        "esg/calculadora": "Estime emissões por distância, peso e combustível.",
        "transportadoras/homologacao": "Documentos e critérios para operar na rede SteelGo.",
        "transportadoras/viagens": "Propostas, motoristas, veículos e acompanhamento das viagens.",
        "esg/eficiencia": "Ocupação, rotas e redução de quilômetros sem carga.",
        "esg/indicadores": "Histórico por período, rota e parceiro para relatórios.",
        "sobre/visao": "A infraestrutura digital logística da América Latina.",
        "sobre/pilares": "Como os pilares da plataforma se organizam e se conectam.",
        "contato/comercial": "Fale com a equipe sobre a sua operação.",
        "suporte/ajuda": "Respostas para embarcadores, transportadoras e motoristas.",
        "suporte/canais": "WhatsApp, e-mail e central de ajuda.",
        "register": "Cadastre sua empresa como embarcador, transportadora ou motorista."
      },
      "menuDescriptions": {
        "solucoes/steelgo-platform": "Conecta embarcadores, transportadoras e motoristas.",
        "solucoes/control-tower": "Viagens, prazos, ocorrências e documentos em tempo real.",
        "solucoes/steelgo-network": "Rede privada de transportadoras homologadas.",
        "solucoes/steelgo-pay": "Pagamentos e crédito via parceiros autorizados.",
        "solucoes/managed-logistics": "Operação humana nas situações críticas.",
        "tecnologia/compliance-suite": "Homologação, requisitos e bloqueios preventivos.",
        "tecnologia/driver-app": "GPS, checkpoints, fotos, POD e modo offline.",
        "tecnologia/steel-cargo-passport": "Histórico auditável da carga e da viagem.",
        "tecnologia/ai-orchestration-engine": "Agentes para viagens, documentos e exceções.",
        "tecnologia/open-api-ecosystem": "Integra ERP, TMS, telemetria e pagamentos.",
        "esg/steelgo-green": "Indicadores ambientais, sociais e de governança.",
        "industrias/siderurgicas": "Bobinas, chapas e vergalhões rastreados.",
        "industrias/distribuidores": "Transferências e entregas a clientes.",
        "industrias/industria": "Insumos e produtos com documentos vinculados.",
        "industrias/varejo": "Abastecimento de lojas e centros de distribuição.",
        "recursos/guias": "Passo a passo por perfil de usuário.",
        "recursos/integracoes": "Referência técnica para ERP, TMS e telemetria.",
        "esg/calculadora": "Estime as emissões de uma viagem.",
        "transportadoras/homologacao": "Documentos e critérios para operar na rede.",
        "transportadoras/viagens": "Propostas, motoristas e acompanhamento.",
        "esg/eficiencia": "Ocupação e menos quilômetros vazios.",
        "esg/indicadores": "Histórico para relatórios ESG.",
        "sobre/visao": "Infraestrutura logística digital da América Latina.",
        "sobre/pilares": "Como os 11 pilares se organizam e conectam.",
        "contato/comercial": "Fale com a equipe sobre sua operação.",
        "register": "Cadastro de embarcador, transportadora ou motorista.",
        "suporte/ajuda": "Respostas para cada tipo de usuário.",
        "suporte/canais": "WhatsApp, e-mail e central de ajuda."
      },
      "menuLabels": {
        "solucoes/steelgo-network": "Rede homologada",
        "esg/calculadora": "Estimativa de CO₂"
      },
      "categoryOverview": {
        "solucoes": "Plataforma, visibilidade, rede, pagamentos e operação gerenciada.",
        "tecnologia": "Conformidade, app do motorista, rastreabilidade, IA e integrações.",
        "industrias": "Como a SteelGo atende cada segmento industrial.",
        "recursos": "Guias, documentação e ferramentas da plataforma.",
        "transportadoras": "Rede, homologação e operação para transportadoras.",
        "esg": "Emissões, eficiência e evidências ESG.",
        "sobre": "Visão da SteelGo e arquitetura da plataforma.",
        "contato": "Fale com a equipe comercial ou solicite acesso.",
        "suporte": "Ajuda por perfil e canais de atendimento."
      }
    },
    "cargo": {
      "SG-24817": "Bobinas laminadas a quente",
      "SG-24809": "Chapas grossas",
      "SG-24802": "Vergalhão CA-50"
    }
  },
  "en": {
    "nav": [
      "Solutions",
      "Technology",
      "Industries",
      "Resources",
      "Carriers",
      "ESG",
      "About",
      "Contact",
      "Support"
    ],
    "navLabel": "Main",
    "langLabel": "Language",
    "signIn": "Sign in",
    "cta": "Request access",
    "open": "Open menu",
    "close": "Close menu",
    "hero": {
      "eyebrow": "Technology for industrial logistics",
      "title1": "Connecting industrial logistics",
      "title2": " across Latin America.",
      "sub": "Freight, documents, payments and tracking in one operation for shippers, carriers and drivers.",
      "primary": "Request access",
      "secondary": "Sign in"
    },
    "map": {
      "product": "Control Tower",
      "title": "Live tracking",
      "live": "GPS every 30 s",
      "trips": "Freight in transit",
      "progress": "Progress",
      "next": "Next checkpoint",
      "eta": "Estimated arrival",
      "zoomIn": "Zoom in",
      "zoomOut": "Zoom out",
      "deviation": "No route deviation",
      "updated": "Position updated {s} s ago",
      "illustrative": "Illustrative view · sample data",
      "aria": "Route map {r}, {p} complete"
    },
    "sol": {
      "eyebrow": "SteelGo solutions",
      "title": "Integrated control of your logistics operation.",
      "sub": "Connect trips, documents, compliance and payments, with intelligence and traceability on a single platform.",
      "all": "Explore all solutions",
      "action": "Explore solution",
      "audiences": "Who it’s for",
      "groups": {
        "base": "Foundation",
        "ops": "Operations",
        "trust": "Trust and compliance",
        "value": "Value and integration"
      },
      "aud": [
        "Shippers",
        "Carriers",
        "Drivers",
        "Industries"
      ]
    },
    "calc": {
      "eyebrow": "SteelGo ESG · Environmental",
      "title": "Estimate CO₂ before you hire.",
      "sub": "Compare fuels per tonne-kilometre and choose the lowest-impact scenario for each route.",
      "link": "Explore SteelGo ESG",
      "distance": "Distance",
      "weight": "Cargo weight",
      "fuel": "Fuel",
      "fuels": [
        "Diesel",
        "Biodiesel B100",
        "Electric (EV)"
      ],
      "result": "Estimated CO₂",
      "reference": "Diesel reference",
      "reduction": "Reduction vs. diesel",
      "trees": "Equal to {n} trees absorbing CO₂ for 1 year.",
      "treesNone": "Reference scenario.",
      "distErr": "Enter 1 to 5,000 km",
      "weightErr": "Enter 1 to 74 t",
      "ok": "Valid value",
      "empty": "Fill in this field",
      "negative": "Use a positive value",
      "invalid": "Use numbers only (e.g. 620 or 42.5)",
      "suspended": "Fix the fields to see the estimate.",
      "note": "Illustrative estimate of the environmental dimension; not an ESG assessment or certification. Formula: distance × weight × emission factor. Illustrative factors (kg CO₂/t·km): Diesel 0.0892 · Biodiesel B100 0.0321 · Electric 0.0107."
    },
    "foot": {
      "tagline": "Latin America’s digital logistics infrastructure.",
      "contact": "Contact us",
      "cols": [
        "Platform",
        "Company",
        "Legal"
      ],
      "legal": [
        "Terms of use",
        "Privacy",
        "Cookies"
      ]
    },
    "ui": {
      "overviewOf": "Overview of",
      "overview": "Overview"
    },
    "langNames": {
      "pt": "Português",
      "en": "English",
      "es": "Español"
    },
    "pages": {
      "titles": {
        "solucoes/steelgo-platform": "SteelGo Platform",
        "solucoes/control-tower": "Control Tower",
        "solucoes/steelgo-network": "SteelGo Network",
        "solucoes/steelgo-pay": "SteelGo Pay",
        "solucoes/managed-logistics": "Managed Logistics",
        "tecnologia/compliance-suite": "Compliance Suite",
        "tecnologia/driver-app": "Driver App",
        "tecnologia/steel-cargo-passport": "Steel Cargo Passport",
        "tecnologia/ai-orchestration-engine": "AI Orchestration Engine",
        "tecnologia/open-api-ecosystem": "Open API Ecosystem",
        "esg/steelgo-green": "SteelGo ESG",
        "industrias/siderurgicas": "Steelmakers",
        "industrias/distribuidores": "Distributors",
        "industrias/industria": "Manufacturers",
        "industrias/varejo": "Retail",
        "recursos/guias": "Platform guides",
        "recursos/integracoes": "Integration documentation",
        "esg/calculadora": "CO₂ calculator",
        "transportadoras/homologacao": "Approval and requirements",
        "transportadoras/viagens": "Trip operations",
        "esg/eficiencia": "Efficiency and empty backhaul",
        "esg/indicadores": "ESG indicators and evidence",
        "sobre/visao": "SteelGo’s vision",
        "sobre/pilares": "The 11-pillar architecture",
        "contato/comercial": "Sales contact",
        "suporte/ajuda": "Help by role",
        "suporte/canais": "Support channels",
        "register": "Request access"
      },
      "descriptions": {
        "solucoes/steelgo-platform": "The foundation connecting shippers, carriers and drivers in a single operation.",
        "solucoes/control-tower": "Visibility into trips, deadlines, incidents, documents and performance.",
        "solucoes/steelgo-network": "A private network of approved carriers.",
        "solucoes/steelgo-pay": "Payments, split, advances, insurance and credit through authorized partners.",
        "solucoes/managed-logistics": "Technology backed by human operations in critical situations.",
        "tecnologia/compliance-suite": "Carrier approval, regulatory requirements and preventive blocks.",
        "tecnologia/driver-app": "Trip execution with GPS, checkpoints, photos, documents, POD and offline mode.",
        "tecnologia/steel-cargo-passport": "A digital, auditable history of the cargo and the trip.",
        "tecnologia/ai-orchestration-engine": "Agents for trips, documents, compliance, yard, finance and exceptions.",
        "tecnologia/open-api-ecosystem": "Integrations with ERP, TMS, telematics, documents, payments and validations.",
        "esg/steelgo-green": "Environmental, social and governance indicators for logistics operations.",
        "industrias/siderurgicas": "Outbound coils, plates and rebar with traceability.",
        "industrias/distribuidores": "Transfers between sites and customer deliveries.",
        "industrias/industria": "Inbound materials and outbound products with linked documents.",
        "industrias/varejo": "Replenishment of stores and distribution centers.",
        "recursos/guias": "Step-by-step by role: shipper, carrier and driver.",
        "recursos/integracoes": "Technical reference for ERP, TMS, telematics and payments.",
        "esg/calculadora": "Estimate emissions by distance, weight and fuel.",
        "transportadoras/homologacao": "Documents and criteria to operate on the SteelGo network.",
        "transportadoras/viagens": "Bids, drivers, vehicles and trip tracking.",
        "esg/eficiencia": "Load factor, routes and fewer empty kilometres.",
        "esg/indicadores": "History by period, route and partner for reporting.",
        "sobre/visao": "Latin America’s digital logistics infrastructure.",
        "sobre/pilares": "How the platform pillars are organized and connected.",
        "contato/comercial": "Talk to the team about your operation.",
        "suporte/ajuda": "Answers for shippers, carriers and drivers.",
        "suporte/canais": "WhatsApp, email and help center.",
        "register": "Register your company as a shipper, carrier or driver."
      },
      "menuDescriptions": {
        "solucoes/steelgo-platform": "Connects shippers, carriers and drivers.",
        "solucoes/control-tower": "Trips, deadlines, incidents and documents in real time.",
        "solucoes/steelgo-network": "Private network of approved carriers.",
        "solucoes/steelgo-pay": "Payments and credit through authorized partners.",
        "solucoes/managed-logistics": "Human operations for critical situations.",
        "tecnologia/compliance-suite": "Approval, requirements and preventive blocks.",
        "tecnologia/driver-app": "GPS, checkpoints, photos, POD and offline mode.",
        "tecnologia/steel-cargo-passport": "Auditable history of cargo and trip.",
        "tecnologia/ai-orchestration-engine": "Agents for trips, documents and exceptions.",
        "tecnologia/open-api-ecosystem": "Connects ERP, TMS, telematics and payments.",
        "esg/steelgo-green": "Environmental, social and governance indicators.",
        "industrias/siderurgicas": "Tracked coils, plates and rebar.",
        "industrias/distribuidores": "Transfers and customer deliveries.",
        "industrias/industria": "Inputs and products with linked documents.",
        "industrias/varejo": "Store and distribution center replenishment.",
        "recursos/guias": "Step-by-step guides by user role.",
        "recursos/integracoes": "Technical reference for ERP, TMS and telematics.",
        "esg/calculadora": "Estimate the emissions of a trip.",
        "transportadoras/homologacao": "Documents and criteria to join the network.",
        "transportadoras/viagens": "Bids, drivers and trip tracking.",
        "esg/eficiencia": "Load factor and fewer empty kilometres.",
        "esg/indicadores": "History for ESG reporting.",
        "sobre/visao": "Latin America’s digital logistics infrastructure.",
        "sobre/pilares": "How the 11 pillars fit together.",
        "contato/comercial": "Talk to the team about your operation.",
        "register": "Sign up as a shipper, carrier or driver.",
        "suporte/ajuda": "Answers for each type of user.",
        "suporte/canais": "WhatsApp, email and help center."
      },
      "menuLabels": {
        "solucoes/steelgo-network": "Approved network",
        "esg/calculadora": "CO₂ estimate"
      },
      "categoryOverview": {
        "solucoes": "Platform, visibility, network, payments and managed operations.",
        "tecnologia": "Compliance, driver app, traceability, AI and integrations.",
        "industrias": "How SteelGo serves each industrial segment.",
        "recursos": "Platform guides, documentation and tools.",
        "transportadoras": "Network, approval and operations for carriers.",
        "esg": "Emissions, efficiency and ESG evidence.",
        "sobre": "SteelGo’s vision and platform architecture.",
        "contato": "Talk to sales or request access.",
        "suporte": "Help by role and support channels."
      }
    },
    "cargo": {
      "SG-24817": "Hot-rolled coils",
      "SG-24809": "Heavy plates",
      "SG-24802": "CA-50 rebar"
    }
  },
  "es": {
    "nav": [
      "Soluciones",
      "Tecnología",
      "Industrias",
      "Recursos",
      "Transportistas",
      "ESG",
      "Nosotros",
      "Contacto",
      "Soporte"
    ],
    "navLabel": "Principal",
    "langLabel": "Idioma",
    "signIn": "Iniciar sesión",
    "cta": "Solicitar acceso",
    "open": "Abrir menú",
    "close": "Cerrar menú",
    "hero": {
      "eyebrow": "Tecnología para logística industrial",
      "title1": "Conectando la logística industrial",
      "title2": " en América Latina.",
      "sub": "Fletes, documentos, pagos y seguimiento en una sola operación para cargadores, transportistas y conductores.",
      "primary": "Solicitar acceso",
      "secondary": "Iniciar sesión"
    },
    "map": {
      "product": "Central de Operaciones",
      "title": "Seguimiento en vivo",
      "live": "GPS cada 30 s",
      "trips": "Fletes en tránsito",
      "progress": "Progreso",
      "next": "Próximo punto de control",
      "eta": "Llegada estimada",
      "zoomIn": "Acercar",
      "zoomOut": "Alejar",
      "deviation": "Sin desvío de ruta",
      "updated": "Posición actualizada hace {s} s",
      "illustrative": "Visualización ilustrativa · datos ficticios",
      "aria": "Mapa de la ruta {r}, {p} completado"
    },
    "sol": {
      "eyebrow": "Soluciones SteelGo",
      "title": "Control integrado de su operación logística.",
      "sub": "Conecte viajes, documentos, cumplimiento y pagos, con inteligencia y trazabilidad en una única plataforma.",
      "all": "Explorar todas las soluciones",
      "action": "Conocer solución",
      "audiences": "Para quién",
      "groups": {
        "base": "Base",
        "ops": "Operación",
        "trust": "Confianza y cumplimiento",
        "value": "Valor e integración"
      },
      "aud": [
        "Cargadores",
        "Transportistas",
        "Conductores",
        "Industrias"
      ]
    },
    "calc": {
      "eyebrow": "SteelGo ESG · Ambiental",
      "title": "Estime el CO₂ antes de contratar.",
      "sub": "Compare combustibles por tonelada-kilómetro y elija el escenario de menor impacto para cada ruta.",
      "link": "Conocer SteelGo ESG",
      "distance": "Distancia",
      "weight": "Peso de la carga",
      "fuel": "Combustible",
      "fuels": [
        "Diésel",
        "Biodiésel B100",
        "Eléctrico (EV)"
      ],
      "result": "CO₂ estimado",
      "reference": "Referencia diésel",
      "reduction": "Reducción vs. diésel",
      "trees": "Equivale a {n} árboles absorbiendo CO₂ durante 1 año.",
      "treesNone": "Escenario de referencia.",
      "distErr": "Ingrese entre 1 y 5.000 km",
      "weightErr": "Ingrese entre 1 y 74 t",
      "ok": "Valor válido",
      "empty": "Complete este campo",
      "negative": "Use un valor positivo",
      "invalid": "Use solo números (ej.: 620 o 42,5)",
      "suspended": "Corrija los campos para ver la estimación.",
      "note": "Estimación ilustrativa de la dimensión ambiental; no constituye una evaluación ESG ni una certificación. Fórmula: distancia × peso × factor de emisión. Factores ilustrativos (kg CO₂/t·km): Diésel 0,0892 · Biodiésel B100 0,0321 · Eléctrico 0,0107."
    },
    "foot": {
      "tagline": "La infraestructura logística digital de América Latina.",
      "contact": "Contáctenos",
      "cols": [
        "Plataforma",
        "Empresa",
        "Legal"
      ],
      "legal": [
        "Términos de uso",
        "Privacidad",
        "Cookies"
      ]
    },
    "ui": {
      "overviewOf": "Visión general de",
      "overview": "Visión general"
    },
    "langNames": {
      "pt": "Português",
      "en": "English",
      "es": "Español"
    },
    "pages": {
      "titles": {
        "solucoes/steelgo-platform": "Plataforma SteelGo",
        "solucoes/control-tower": "Central de Operaciones",
        "solucoes/steelgo-network": "Red SteelGo",
        "solucoes/steelgo-pay": "SteelGo Pay",
        "solucoes/managed-logistics": "Apoyo Operativo",
        "tecnologia/compliance-suite": "Documentación y Cumplimiento",
        "tecnologia/driver-app": "App del Conductor",
        "tecnologia/steel-cargo-passport": "Pasaporte Digital de la Carga",
        "tecnologia/ai-orchestration-engine": "Automatización Inteligente",
        "tecnologia/open-api-ecosystem": "Integraciones y API",
        "esg/steelgo-green": "SteelGo ESG",
        "industrias/siderurgicas": "Siderúrgicas",
        "industrias/distribuidores": "Distribuidores",
        "industrias/industria": "Industrias",
        "industrias/varejo": "Comercio minorista",
        "recursos/guias": "Guías de la plataforma",
        "recursos/integracoes": "Documentación de integraciones",
        "esg/calculadora": "Calculadora de CO₂",
        "transportadoras/homologacao": "Homologación y requisitos",
        "transportadoras/viagens": "Operación de viajes",
        "esg/eficiencia": "Eficiencia y retorno vacío",
        "esg/indicadores": "Indicadores y evidencias ESG",
        "sobre/visao": "Visión de SteelGo",
        "sobre/pilares": "Arquitectura de los 11 pilares",
        "contato/comercial": "Contacto comercial",
        "suporte/ajuda": "Ayuda por perfil",
        "suporte/canais": "Canales de atención",
        "register": "Solicitar acceso"
      },
      "descriptions": {
        "solucoes/steelgo-platform": "La base que conecta cargadores, transportistas y conductores en una sola operación.",
        "solucoes/control-tower": "Visibilidad de viajes, plazos, incidencias, documentos y desempeño.",
        "solucoes/steelgo-network": "Red privada de transportistas homologados.",
        "solucoes/steelgo-pay": "Pagos, split, anticipos, seguros y crédito mediante socios autorizados.",
        "solucoes/managed-logistics": "Tecnología acompañada por operación humana en situaciones críticas.",
        "tecnologia/compliance-suite": "Homologación, requisitos regulatorios y bloqueos preventivos.",
        "tecnologia/driver-app": "Ejecución del viaje con GPS, puntos de control, fotos, documentos, POD y modo offline.",
        "tecnologia/steel-cargo-passport": "Historial digital y auditable de la carga y del viaje.",
        "tecnologia/ai-orchestration-engine": "Agentes para viajes, documentos, cumplimiento, patio, finanzas y excepciones.",
        "tecnologia/open-api-ecosystem": "Integraciones con ERP, TMS, telemetría, documentos, pagos y validaciones.",
        "esg/steelgo-green": "Indicadores ambientales, sociales y de gobernanza para la operación logística.",
        "industrias/siderurgicas": "Despacho de bobinas, chapas y varillas con trazabilidad.",
        "industrias/distribuidores": "Transferencias entre unidades y entregas a clientes.",
        "industrias/industria": "Recepción de insumos y envío de productos con documentos vinculados.",
        "industrias/varejo": "Abastecimiento de tiendas y centros de distribución.",
        "recursos/guias": "Paso a paso por perfil: cargador, transportista y conductor.",
        "recursos/integracoes": "Referencia técnica para ERP, TMS, telemetría y pagos.",
        "esg/calculadora": "Estime emisiones por distancia, peso y combustible.",
        "transportadoras/homologacao": "Documentos y criterios para operar en la red SteelGo.",
        "transportadoras/viagens": "Propuestas, conductores, vehículos y seguimiento de viajes.",
        "esg/eficiencia": "Ocupación, rutas y menos kilómetros sin carga.",
        "esg/indicadores": "Historial por período, ruta y socio para informes.",
        "sobre/visao": "La infraestructura logística digital de América Latina.",
        "sobre/pilares": "Cómo se organizan y conectan los pilares de la plataforma.",
        "contato/comercial": "Hable con el equipo sobre su operación.",
        "suporte/ajuda": "Respuestas para cargadores, transportistas y conductores.",
        "suporte/canais": "WhatsApp, correo y centro de ayuda.",
        "register": "Registre su empresa como cargador, transportista o conductor."
      },
      "menuDescriptions": {
        "solucoes/steelgo-platform": "Conecta cargadores, transportistas y conductores.",
        "solucoes/control-tower": "Viajes, plazos, incidencias y documentos en tiempo real.",
        "solucoes/steelgo-network": "Red privada de transportistas homologados.",
        "solucoes/steelgo-pay": "Pagos y crédito a través de socios autorizados.",
        "solucoes/managed-logistics": "Operación humana en situaciones críticas.",
        "tecnologia/compliance-suite": "Homologación, requisitos y bloqueos preventivos.",
        "tecnologia/driver-app": "GPS, checkpoints, fotos, POD y modo offline.",
        "tecnologia/steel-cargo-passport": "Historial auditable de carga y viaje.",
        "tecnologia/ai-orchestration-engine": "Agentes para viajes, documentos y excepciones.",
        "tecnologia/open-api-ecosystem": "Integra ERP, TMS, telemetría y pagos.",
        "esg/steelgo-green": "Indicadores ambientales, sociales y de gobernanza.",
        "industrias/siderurgicas": "Bobinas, chapas y varillas rastreadas.",
        "industrias/distribuidores": "Transferencias y entregas a clientes.",
        "industrias/industria": "Insumos y productos con documentos vinculados.",
        "industrias/varejo": "Abastecimiento de tiendas y centros de distribución.",
        "recursos/guias": "Paso a paso por perfil de usuario.",
        "recursos/integracoes": "Referencia técnica para ERP, TMS y telemetría.",
        "esg/calculadora": "Estime las emisiones de un viaje.",
        "transportadoras/homologacao": "Documentos y criterios para operar en la red.",
        "transportadoras/viagens": "Propuestas, conductores y seguimiento.",
        "esg/eficiencia": "Ocupación y menos kilómetros vacíos.",
        "esg/indicadores": "Historial para informes ESG.",
        "sobre/visao": "Infraestructura logística digital de América Latina.",
        "sobre/pilares": "Cómo se organizan y conectan los 11 pilares.",
        "contato/comercial": "Hable con el equipo sobre su operación.",
        "register": "Registro de cargador, transportista o conductor.",
        "suporte/ajuda": "Respuestas para cada tipo de usuario.",
        "suporte/canais": "WhatsApp, correo y centro de ayuda."
      },
      "menuLabels": {
        "solucoes/steelgo-network": "Red homologada",
        "esg/calculadora": "Estimación de CO₂"
      },
      "categoryOverview": {
        "solucoes": "Plataforma, visibilidad, red, pagos y operación gestionada.",
        "tecnologia": "Cumplimiento, app del conductor, trazabilidad, IA e integraciones.",
        "industrias": "Cómo SteelGo atiende cada segmento industrial.",
        "recursos": "Guías, documentación y herramientas de la plataforma.",
        "transportadoras": "Red, homologación y operación para transportistas.",
        "esg": "Emisiones, eficiencia y evidencias ESG.",
        "sobre": "Visión de SteelGo y arquitectura de la plataforma.",
        "contato": "Hable con el equipo comercial o solicite acceso.",
        "suporte": "Ayuda por perfil y canales de atención."
      }
    },
    "cargo": {
      "SG-24817": "Bobinas laminadas en caliente",
      "SG-24809": "Chapas gruesas",
      "SG-24802": "Varilla CA-50"
    }
  }
};

export type HomeDict = (typeof HOME_I18N)["pt"];
