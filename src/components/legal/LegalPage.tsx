import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, Scale, Cookie } from "lucide-react";
import type { Language } from "@/lib/i18n";

type Section = {
  title: string;
  body: string[];
  bullets?: string[];
};

type LegalPageProps = {
  title: string;
  intro: string[];
  sections: Section[];
  lastUpdated: string;
  note: string;
  icon: "privacy" | "terms" | "cookies";
  language: Language;
};

const iconClasses = "h-12 w-12 rounded-2xl bg-[#1B6CB8]/10 text-[#1B6CB8] flex items-center justify-center";

export function LegalPage({ title, intro, sections, lastUpdated, note, icon, language }: LegalPageProps) {
  const Icon = icon === "privacy" ? ShieldCheck : icon === "terms" ? Scale : Cookie;

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#0F172A]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#1B6CB8] hover:underline">
          <ArrowLeft size={16} />
          {language === "pt" ? "Voltar ao início" : language === "es" ? "Volver al inicio" : "Back to home"}
        </Link>

        <div className="rounded-[24px] border border-[#D8E1EA] bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className={iconClasses}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1B6CB8]">
                  {language === "pt" ? "Modelo legal preliminar" : language === "es" ? "Plantilla legal preliminar" : "Preliminary legal template"}
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">{title}</h1>
                <div className="mt-4 space-y-2 text-sm leading-7 text-[#475569]">
                  {intro.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#D8E1EA] bg-[#F8FAFC] px-4 py-3 text-sm text-[#475569] md:min-w-[220px]">
              <div className="font-semibold text-[#0F172A]">
                {language === "pt" ? "Última atualização" : language === "es" ? "Última actualización" : "Last updated"}
              </div>
              <div className="mt-1">{lastUpdated}</div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {note}
          </div>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title} className="border-t border-[#E2E8F0] pt-6 first:border-t-0 first:pt-0">
                <h2 className="text-xl font-semibold text-[#0F172A]">{section.title}</h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-[#475569]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-4 list-disc space-y-2 pl-6 text-sm leading-7 text-[#475569]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
