import { useEffect, useState } from "react";

// LGPD-style opt-in gate for analytics cookies (GA4). "unset" shows the consent banner.
export type ConsentStatus = "granted" | "denied" | "unset";

const CONSENT_STORAGE_KEY = "steelgo.analytics_consent";

const listeners = new Set<(status: ConsentStatus) => void>();

function readConsent(): ConsentStatus {
  if (typeof window === "undefined") return "unset";
  const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return stored === "granted" || stored === "denied" ? stored : "unset";
}

export function getConsent(): ConsentStatus {
  return readConsent();
}

export function setConsent(status: "granted" | "denied") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, status);
  listeners.forEach((listener) => listener(status));
}

export function subscribeConsent(listener: (status: ConsentStatus) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConsent(): ConsentStatus {
  const [status, setStatus] = useState<ConsentStatus>("unset");

  useEffect(() => {
    setStatus(readConsent());
    return subscribeConsent(setStatus);
  }, []);

  return status;
}
