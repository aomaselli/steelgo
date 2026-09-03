import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useConsent } from "@/lib/consent";
import { loadGoogleAnalytics, trackPageView } from "@/lib/analytics/ga4";

// Renders nothing; wires GA4 loading + SPA page_view tracking to the consent state and router.
export function GoogleAnalytics() {
  const consent = useConsent();
  const href = useRouterState({ select: (s) => s.location.href });
  const lastTrackedHref = useRef<string | null>(null);

  useEffect(() => {
    if (consent !== "granted") return;
    loadGoogleAnalytics();
  }, [consent]);

  useEffect(() => {
    if (consent !== "granted") return;
    if (lastTrackedHref.current === href) return;
    lastTrackedHref.current = href;
    trackPageView(window.location.pathname + window.location.search);
  }, [consent, href]);

  return null;
}
