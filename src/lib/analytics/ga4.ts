const GA_MEASUREMENT_ID = "G-RP8TNSYVW1";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

// Only called after the user grants analytics consent.
export function loadGoogleAnalytics() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  window.gtag("js", new Date());
  // send_page_view=false: page views are sent manually on route change (see trackPageView) to avoid
  // duplicates in this SPA. allow_google_signals/allow_ad_personalization_signals=false: no cross-device
  // or ads tracking. No PII (name, email, CPF, phone, plate, user id, etc.) is ever sent to GA4.
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function isGoogleAnalyticsLoaded() {
  return initialized;
}

export function trackPageView(path: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: document.title,
  });
}
