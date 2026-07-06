import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { useLanguage } from "@/lib/i18n";

const CONTENT = {
  pt: {
    title: "Termos de Uso",
    intro: [
      "Estes Termos de Uso são um modelo inicial para revisão e não constituem aconselhamento jurídico definitivo.",
      "A SteelGo Tecnologia Ltda. pode disponibilizar uma plataforma tecnológica para conectar embarcadores, transportadoras, motoristas e parceiros em operações logísticas.",
    ],
    sections: [
      {
        title: "Função da plataforma",
        body: [
          "A SteelGo atua como plataforma tecnológica e operadora de infraestrutura digital para facilitar a publicação de fretes, contratação, rastreamento e comunicação entre partes. A plataforma não garante disponibilidade de frete, capacidade, preço ou execução da operação em qualquer momento.",
        ],
      },
      {
        title: "Responsabilidades do usuário",
        body: [
          "Usuários são responsáveis por fornecer informações verdadeiras, completas e atualizadas, por manter credenciais seguras e por cumprir leis aplicáveis, políticas da plataforma e obrigações contratuais. A declaração de documentos, dados de empresa, veículos, motoristas e certificados é de inteira responsabilidade do usuário que os informar.",
        ],
      },
      {
        title: "Conformidade e obrigações",
        body: [
          "Transportadoras e motoristas devem observar requisitos legais, regulatórios e operacionais aplicáveis, incluindo documentação, apólices, licenças, habilitações e obrigações de segurança. Embarcadores e empresas devem fornecer dados corretos e manter a operação em conformidade com contratos e normas aplicáveis.",
        ],
      },
      {
        title: "Uso proibido",
        body: [
          "É proibido usar a plataforma para atividades fraudulentas, ilegais, invasivas, de spam, de manipulação de dados, de obstrução da operação ou para qualquer atividade que viole direitos de terceiros, regulamentos aplicáveis ou os termos desta plataforma.",
        ],
      },
      {
        title: "Suspensão e encerramento",
        body: [
          "A SteelGo pode suspender, restringir ou encerrar o acesso do usuário em caso de violação destes termos, risco operacional, segurança, fraude, uso indevido ou obrigação legal, sem prejuízo de outras medidas cabíveis.",
        ],
      },
      {
        title: "Pagamentos, responsabilidade e propriedade",
        body: [
          "Integrações financeiras e/ou de pagamento podem ser tratadas por terceiros, conforme aplicável. A responsabilidade da SteelGo é limitada pelo que for permitido por lei e pelas obrigações contratuais aplicáveis. Direitos de propriedade intelectual relativos à marca, software, conteúdo e materiais da plataforma permanecem com a SteelGo ou com seus licenciadores.",
        ],
      },
      {
        title: "Alterações e lei aplicável",
        body: [
          "Estes termos podem ser alterados a qualquer momento para refletir melhorias operacionais, mudanças legais ou ajustes de produto. A interpretação e resolução de controvérsias serão regidas pela legislação brasileira, sujeitas a revisão jurídica antes da publicação em produção.",
        ],
      },
    ],
    note: "Este documento é um modelo preliminar e deve ser revisado por assessoria jurídica antes do uso em produção.",
    lastUpdated: "Placeholder — revisar antes de publicar",
  },
  en: {
    title: "Terms of Use",
    intro: [
      "These Terms of Use are an initial template for review and do not constitute final legal advice.",
      "SteelGo may provide a technology platform to connect shippers, carriers, drivers and partners in logistics operations.",
    ],
    sections: [
      {
        title: "Platform role",
        body: [
          "SteelGo acts as a technology platform and digital infrastructure provider to facilitate freight posting, contracting, tracking and communication between parties. The platform does not guarantee freight availability, capacity, pricing or execution at any given time.",
        ],
      },
      {
        title: "User responsibilities",
        body: [
          "Users are responsible for providing true, complete and up-to-date information, keeping credentials secure and complying with applicable laws, platform policies and contractual obligations. The accuracy of documents, company details, vehicles, drivers and certificates is the sole responsibility of the user providing them.",
        ],
      },
      {
        title: "Compliance and obligations",
        body: [
          "Carriers and drivers must comply with applicable legal, regulatory and operational requirements, including documentation, insurance, licenses, permits and safety obligations. Shippers and companies must provide accurate information and keep their operations compliant with applicable contracts and rules.",
        ],
      },
      {
        title: "Prohibited use",
        body: [
          "It is prohibited to use the platform for fraudulent, illegal, invasive, spam, data manipulation, operational obstruction or any activity that violates third-party rights, applicable regulations or the terms of this platform.",
        ],
      },
      {
        title: "Suspension and termination",
        body: [
          "SteelGo may suspend, restrict or terminate user access in the event of violation of these terms, operational risk, security, fraud, misuse or legal obligation, without prejudice to other remedies available.",
        ],
      },
      {
        title: "Payments, liability and intellectual property",
        body: [
          "Financial and payment integrations may be handled by third parties where applicable. SteelGo's liability is limited to the extent permitted by law and applicable contractual obligations. Intellectual property rights to the brand, software, content and materials of the platform remain with SteelGo or its licensors.",
        ],
      },
      {
        title: "Changes and governing law",
        body: [
          "These terms may be changed at any time to reflect operational improvements, legal changes or product adjustments. Interpretation and dispute resolution will be governed by Brazilian law and remain subject to legal review before production publication.",
        ],
      },
    ],
    note: "This document is a preliminary template and should be reviewed by legal counsel before production use.",
    lastUpdated: "Placeholder — review before publishing",
  },
  es: {
    title: "Términos de Uso",
    intro: [
      "Estos Términos de Uso son una plantilla inicial para revisión y no constituyen asesoramiento legal definitivo.",
      "SteelGo puede ofrecer una plataforma tecnológica para conectar a embarcadores, transportistas, conductores y socios en operaciones logísticas.",
    ],
    sections: [
      {
        title: "Rol de la plataforma",
        body: [
          "SteelGo actúa como plataforma tecnológica y proveedor de infraestructura digital para facilitar la publicación de cargas, contratación, seguimiento y comunicación entre partes. La plataforma no garantiza disponibilidad de carga, capacidad, precio ni ejecución en ningún momento.",
        ],
      },
      {
        title: "Responsabilidades del usuario",
        body: [
          "Los usuarios son responsables de proporcionar información verdadera, completa y actualizada, mantener credenciales seguras y cumplir con las leyes aplicables, políticas de la plataforma y obligaciones contractuales. La exactitud de documentos, datos de empresa, vehículos, conductores y certificados es responsabilidad exclusiva del usuario que los proporcione.",
        ],
      },
      {
        title: "Cumplimiento y obligaciones",
        body: [
          "Los transportistas y conductores deben cumplir con los requisitos legales, regulatorios y operativos aplicables, incluidos documentos, seguros, licencias, permisos y obligaciones de seguridad. Los embarcadores y empresas deben proporcionar información precisa y mantener sus operaciones en conformidad con los contratos y normas aplicables.",
        ],
      },
      {
        title: "Uso prohibido",
        body: [
          "Está prohibido usar la plataforma para actividades fraudulentas, ilegales, invasivas, de spam, manipulación de datos, obstrucción operativa o cualquier actividad que viole derechos de terceros, regulaciones aplicables o los términos de esta plataforma.",
        ],
      },
      {
        title: "Suspensión y terminación",
        body: [
          "SteelGo puede suspender, restringir o terminar el acceso del usuario en caso de violación de estos términos, riesgo operacional, seguridad, fraude, uso indebido u obligación legal, sin perjuicio de otras medidas aplicables.",
        ],
      },
      {
        title: "Pagos, responsabilidad y propiedad intelectual",
        body: [
          "Las integraciones financieras y de pago pueden ser gestionadas por terceros cuando proceda. La responsabilidad de SteelGo está limitada en la medida permitida por la ley y por las obligaciones contractuales aplicables. Los derechos de propiedad intelectual sobre la marca, el software, el contenido y los materiales de la plataforma permanecen en SteelGo o en sus licenciantes.",
        ],
      },
      {
        title: "Cambios y ley aplicable",
        body: [
          "Estos términos pueden modificarse en cualquier momento para reflejar mejoras operativas, cambios legales o ajustes del producto. La interpretación y resolución de controversias se regirán por la ley brasileña y seguirán sujetas a revisión legal antes de la publicación en producción.",
        ],
      },
    ],
    note: "Este documento es una plantilla preliminar y debe revisarse por asesoría legal antes del uso en producción.",
    lastUpdated: "Marcador — revisar antes de publicar",
  },
};

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  const { language } = useLanguage();
  const c = CONTENT[language] ?? CONTENT.en;

  return (
    <LegalPage
      title={c.title}
      intro={c.intro}
      sections={c.sections}
      lastUpdated={c.lastUpdated}
      note={c.note}
      icon="terms"
      language={language}
    />
  );
}
