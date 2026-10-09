import { useLanguage } from "@/lib/i18n";
import { HOME_I18N, type HomeDict } from "@/lib/i18n.home";

/** Typed access to the `home` namespace for the active language. Language comes from the existing LanguageProvider. */
export function useHomeCopy(): { lang: "pt" | "en" | "es"; c: HomeDict } {
  const { language } = useLanguage();
  return { lang: language, c: (HOME_I18N[language] ?? HOME_I18N.pt) as HomeDict };
}
