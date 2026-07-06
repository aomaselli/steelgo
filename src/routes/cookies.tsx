import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { useLanguage } from "@/lib/i18n";

const CONTENT = {
  pt: {
    title: "Política de Cookies",
    intro: [
      "Esta Política de Cookies é um modelo inicial para revisão e não constitui aconselhamento jurídico definitivo.",
      "A SteelGo pode utilizar cookies e tecnologias similares para manter a sessão, lembrar preferências e melhorar a experiência de uso da plataforma.",
    ],
    sections: [
      {
        title: "Cookies essenciais",
        body: [
          "Cookies essenciais e armazenamento local podem ser usados para manter a sessão do usuário, proteger a experiência de login e preservar preferências básicas de navegação.",
        ],
      },
      {
        title: "Preferência de idioma",
        body: [
          "A plataforma pode armazenar a preferência de idioma no armazenamento local do navegador, incluindo a chave steelgo.language, para proporcionar uma experiência consistente ao acessar a aplicação.",
        ],
      },
      {
        title: "Analytics e consentimento",
        body: [
          "Analytics ou cookies adicionais podem ser implementados no futuro apenas com aviso adequado e, quando exigido, com consentimento do usuário. Nenhuma prática de rastreamento adicional deve ser assumida neste momento sem a devida notificação e revisão legal.",
        ],
      },
      {
        title: "Gerenciamento",
        body: [
          "Usuários podem gerenciar cookies e armazenamento local pelo navegador, removendo preferências ou bloqueando determinados tipos de dados. O bloqueio de cookies essenciais pode impactar a funcionalidade de login e sessão da plataforma.",
        ],
      },
    ],
    note: "Este documento é um modelo preliminar e deve ser revisado por assessoria jurídica antes do uso em produção.",
    lastUpdated: "Placeholder — revisar antes de publicar",
  },
  en: {
    title: "Cookie Policy",
    intro: [
      "This Cookie Policy is an initial template for review and does not constitute final legal advice.",
      "SteelGo may use cookies and similar technologies to maintain the session, remember preferences and improve the user experience of the platform.",
    ],
    sections: [
      {
        title: "Essential cookies",
        body: [
          "Essential cookies and browser storage may be used to maintain the user's session, protect the sign-in experience and preserve basic browsing preferences.",
        ],
      },
      {
        title: "Language preference",
        body: [
          "The platform may store the language preference in the browser's local storage, including the steelgo.language key, to provide a consistent experience when accessing the application.",
        ],
      },
      {
        title: "Analytics and consent",
        body: [
          "Analytics or additional cookies may be implemented later only with appropriate notice and, where required, with user consent. No additional tracking practices should be assumed at this stage without proper notification and legal review.",
        ],
      },
      {
        title: "Management",
        body: [
          "Users can manage cookies and local storage through the browser by removing preferences or blocking certain data types. Blocking essential cookies may affect the platform's login and session functionality.",
        ],
      },
    ],
    note: "This document is a preliminary template and should be reviewed by legal counsel before production use.",
    lastUpdated: "Placeholder — review before publishing",
  },
  es: {
    title: "Política de Cookies",
    intro: [
      "Esta Política de Cookies es una plantilla inicial para revisión y no constituye asesoramiento legal definitivo.",
      "SteelGo puede utilizar cookies y tecnologías similares para mantener la sesión, recordar preferencias y mejorar la experiencia de uso de la plataforma.",
    ],
    sections: [
      {
        title: "Cookies esenciales",
        body: [
          "Se pueden usar cookies esenciales y almacenamiento local para mantener la sesión del usuario, proteger la experiencia de inicio de sesión y preservar preferencias básicas de navegación.",
        ],
      },
      {
        title: "Preferencia de idioma",
        body: [
          "La plataforma puede almacenar la preferencia de idioma en el almacenamiento local del navegador, incluyendo la clave steelgo.language, para ofrecer una experiencia consistente al acceder a la aplicación.",
        ],
      },
      {
        title: "Analytics y consentimiento",
        body: [
          "Los analytics o cookies adicionales pueden implementarse en el futuro solo con aviso adecuado y, cuando sea requerido, con consentimiento del usuario. No se debe asumir ninguna práctica de seguimiento adicional en este momento sin la notificación adecuada y la revisión legal correspondiente.",
        ],
      },
      {
        title: "Gestión",
        body: [
          "Los usuarios pueden gestionar cookies y almacenamiento local desde el navegador eliminando preferencias o bloqueando determinados tipos de datos. Bloquear cookies esenciales puede afectar la funcionalidad de acceso y sesión de la plataforma.",
        ],
      },
    ],
    note: "Este documento es una plantilla preliminar y debe revisarse por asesoría legal antes del uso en producción.",
    lastUpdated: "Marcador — revisar antes de publicar",
  },
};

export const Route = createFileRoute("/cookies")({
  component: CookiesPage,
});

function CookiesPage() {
  const { language } = useLanguage();
  const c = CONTENT[language] ?? CONTENT.en;

  return (
    <LegalPage
      title={c.title}
      intro={c.intro}
      sections={c.sections}
      lastUpdated={c.lastUpdated}
      note={c.note}
      icon="cookies"
      language={language}
    />
  );
}
