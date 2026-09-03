import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { ConsentPreferences } from "@/components/legal/ConsentPreferences";
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
          "A SteelGo utiliza o Google Analytics (GA4) para medir visitantes, páginas acessadas, origem do acesso e localização aproximada (cidade/região). Esses cookies só são carregados após o usuário aceitar no banner de consentimento exibido na primeira visita, podendo ser recusados a qualquer momento. Não enviamos nome, e-mail, CPF, telefone, placa, identificador de usuário ou qualquer outro dado pessoal identificável ao Google Analytics.",
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
          "SteelGo uses Google Analytics (GA4) to measure visitors, pages visited, traffic source and approximate location (city/region). These cookies are only loaded after the user accepts the consent banner shown on first visit, and can be declined at any time. We do not send name, email, national ID, phone, plate, user identifier or any other personally identifiable data to Google Analytics.",
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
          "SteelGo utiliza Google Analytics (GA4) para medir visitantes, páginas visitadas, origen del acceso y ubicación aproximada (ciudad/región). Estas cookies solo se cargan después de que el usuario acepte el banner de consentimiento mostrado en la primera visita, y pueden rechazarse en cualquier momento. No enviamos nombre, correo electrónico, documento, teléfono, placa, identificador de usuario ni ningún otro dato personal identificable a Google Analytics.",
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
    >
      <ConsentPreferences language={language} />
    </LegalPage>
  );
}
