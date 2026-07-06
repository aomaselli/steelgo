import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { useLanguage } from "@/lib/i18n";

const CONTENT = {
  pt: {
    title: "Política de Privacidade",
    intro: [
      "Esta Política de Privacidade é um modelo inicial para revisão e não constitui aconselhamento jurídico definitivo.",
      "A SteelGo Tecnologia Ltda. pode atuar como plataforma tecnológica para operações logísticas e pode processar dados pessoais de embarcadores, transportadoras, motoristas, parceiros e usuários da plataforma.",
    ],
    sections: [
      {
        title: "Controlador e canal de contato",
        body: [
          "O controlador responsável pelo tratamento dos dados pessoais, quando aplicável, é a SteelGo Tecnologia Ltda. ou a entidade indicada no contrato aplicável. Para contato, utilize legal@steelgobr.com.br ou o canal jurídico configurado pela empresa antes da utilização em produção.",
        ],
      },
      {
        title: "Dados coletados",
        body: [
          "Podemos coletar dados fornecidos diretamente por você ou por seus representantes, incluindo nome, e-mail, telefone, CPF/CNPJ, dados cadastrais da empresa, dados de motoristas, CNH/EAR, RNTRC/ANTT, dados de veículos, certificados, documentos, fotos, evidências de entrega, dados de localização/GPS, logs de acesso e metadados relacionados a pagamentos e operações.",
        ],
      },
      {
        title: "Finalidades do tratamento",
        body: [
          "Os dados podem ser utilizados para criação e gestão de conta, execução de operações logísticas, compliance, gestão de risco, rastreamento e visibilidade operacional, validação documental, prova de entrega, suporte a pagamentos e liquidação, segurança da plataforma, atendimento, suporte e cumprimento de obrigações legais e regulatórias.",
        ],
      },
      {
        title: "Compartilhamento",
        body: [
          "Os dados podem ser compartilhados com embarcadores, transportadoras, motoristas, parceiros financeiros e de pagamento, prestadores de compliance e risco, seguradoras, provedores de hospedagem/cloud, autoridades quando exigido por lei e outros fornecedores necessários para a operação.",
        ],
      },
      {
        title: "Localização e segurança",
        body: [
          "Dados de localização podem ser coletados apenas quando necessários para rastreamento de cargas e visibilidade operacional. Medidas de segurança, controles de acesso, criptografia quando aplicável, logs de auditoria e princípios de menor privilégio devem ser adotados conforme o estágio da operação e a capacidade técnica da plataforma.",
        ],
      },
      {
        title: "Retenção e direitos",
        body: [
          "Os dados serão mantidos pelo tempo necessário para fins operacionais, contratuais, legais e regulatórios. Usuários podem, dentro do limite aplicável, solicitar acesso, correção, exclusão ou anonimização, portabilidade, informações sobre compartilhamentos e revogação de consentimentos, sempre mediante validação da identidade e observância das obrigações legais.",
        ],
      },
    ],
    note: "Este documento é um modelo preliminar e deve ser revisado por assessoria jurídica antes do uso em produção.",
    lastUpdated: "Placeholder — revisar antes de publicar",
  },
  en: {
    title: "Privacy Policy",
    intro: [
      "This Privacy Policy is an initial template for review and does not constitute final legal advice.",
      "SteelGo may operate as a technology platform for logistics operations and may process personal data of shippers, carriers, drivers, partners and platform users.",
    ],
    sections: [
      {
        title: "Controller and contact",
        body: [
          "The responsible controller for personal data processing, where applicable, is SteelGo Tecnologia Ltda. or the entity indicated in the applicable contract. For contact, use legal@steelgobr.com.br or the legal channel configured by the company before production use.",
        ],
      },
      {
        title: "Data collected",
        body: [
          "We may collect data provided directly by you or your representatives, including name, email, phone, CPF/CNPJ, company registration details, driver data, CNH/EAR, RNTRC/ANTT, vehicle data, certificates, documents, photos, delivery evidence, GPS/location data, access logs and payment-related metadata.",
        ],
      },
      {
        title: "Purposes of processing",
        body: [
          "The data may be used for account creation and management, execution of logistics operations, compliance, risk management, tracking and operational visibility, document validation, delivery proof, payment and settlement support, platform security, support and compliance with legal obligations.",
        ],
      },
      {
        title: "Sharing",
        body: [
          "The data may be shared with shippers, carriers, drivers, financial and payment partners, compliance and risk providers, insurers, hosting/cloud providers, authorities when legally required and other operationally necessary suppliers.",
        ],
      },
      {
        title: "Location and security",
        body: [
          "Location data may be collected only when needed for shipment tracking and operational visibility. Security measures, access controls, encryption where applicable, audit logs and least-privilege principles should be applied according to the operation stage and the platform’s technical capabilities.",
        ],
      },
      {
        title: "Retention and rights",
        body: [
          "Data will be kept for as long as needed for operational, contractual, legal and regulatory purposes. Users may, where applicable, request access, correction, deletion or anonymization, portability, information about sharing and revocation of consent, subject to identity verification and legal obligations.",
        ],
      },
    ],
    note: "This document is a preliminary template and should be reviewed by legal counsel before production use.",
    lastUpdated: "Placeholder — review before publishing",
  },
  es: {
    title: "Política de Privacidad",
    intro: [
      "Esta Política de Privacidad es una plantilla inicial para revisión y no constituye asesoramiento legal definitivo.",
      "SteelGo puede operar como una plataforma tecnológica para operaciones logísticas y puede procesar datos personales de embarcadores, transportistas, conductores, socios y usuarios de la plataforma.",
    ],
    sections: [
      {
        title: "Responsable y canal de contacto",
        body: [
          "El responsable del tratamiento de datos personales, cuando corresponda, es SteelGo Tecnologia Ltda. o la entidad indicada en el contrato aplicable. Para contacto, utilice legal@steelgobr.com.br o el canal jurídico configurado por la empresa antes del uso en producción.",
        ],
      },
      {
        title: "Datos recopilados",
        body: [
          "Podemos recopilar datos proporcionados directamente por usted o por sus representantes, incluyendo nombre, correo electrónico, teléfono, CPF/CNPJ, datos de la empresa, datos de conductores, CNH/EAR, RNTRC/ANTT, datos del vehículo, certificados, documentos, fotos, evidencia de entrega, datos de ubicación/GPS, registros de acceso y metadatos relacionados con pagos y operaciones.",
        ],
      },
      {
        title: "Finalidades del tratamiento",
        body: [
          "Los datos pueden utilizarse para creación y gestión de cuentas, ejecución de operaciones logísticas, cumplimiento regulatorio, gestión de riesgos, seguimiento y visibilidad operativa, validación documental, prueba de entrega, soporte a pagos y liquidación, seguridad de la plataforma, atención, soporte y cumplimiento de obligaciones legales.",
        ],
      },
      {
        title: "Compartición",
        body: [
          "Los datos pueden compartirse con embarcadores, transportistas, conductores, socios financieros y de pago, proveedores de compliance y riesgo, aseguradoras, proveedores de hosting/cloud, autoridades cuando sea legalmente requerido y otros proveedores necesarios para la operación.",
        ],
      },
      {
        title: "Ubicación y seguridad",
        body: [
          "Los datos de ubicación solo pueden recopilarse cuando sean necesarios para el seguimiento de cargas y la visibilidad operativa. Se deben aplicar medidas de seguridad, controles de acceso, cifrado cuando sea aplicable, registros de auditoría y principios de mínimo privilegio conforme al estado de la operación y a las capacidades técnicas de la plataforma.",
        ],
      },
      {
        title: "Retención y derechos",
        body: [
          "Los datos se conservarán durante el tiempo necesario para fines operativos, contractuales, legales y regulatorios. Los usuarios pueden, cuando sea aplicable, solicitar acceso, corrección, eliminación o anonimización, portabilidad, información sobre comparticiones y revocación del consentimiento, sujeto a verificación de identidad y obligaciones legales.",
        ],
      },
    ],
    note: "Este documento es una plantilla preliminar y debe revisarse por asesoría legal antes del uso en producción.",
    lastUpdated: "Marcador — revisar antes de publicar",
  },
};

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  const { language } = useLanguage();
  const c = CONTENT[language] ?? CONTENT.en;

  return (
    <LegalPage
      title={c.title}
      intro={c.intro}
      sections={c.sections}
      lastUpdated={c.lastUpdated}
      note={c.note}
      icon="privacy"
      language={language}
    />
  );
}
