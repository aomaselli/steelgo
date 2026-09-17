import { Link } from "@tanstack/react-router";
import { LogOut, Globe } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Avatar } from "@/components/steel/Avatar";
import { Button } from "@/components/steel/Button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationsMenu } from "./NotificationsMenu";

export function Topbar() {
  const { profile, signOut, company, companyRole, companies, selectCompany } = useAuth();
  const roleLabel =
    companyRole === "owner"
      ? "Proprietário"
      : companyRole === "operator"
        ? "Operador"
        : companyRole === "viewer"
          ? "Leitor"
          : null;
  const { language, setLanguage, t } = useLanguage();

  return (
    <header
      className="flex h-14 items-center justify-between border-b border-[#E6EAF0] bg-[#F7F9FB] pl-4 md:pl-6"
      style={{ paddingRight: "max(1rem, env(safe-area-inset-right))" }}
    >
      <div className="md:hidden">
        <Link to="/" aria-label="SteelGo">
          <BrandLogo className="h-7 w-auto" />
        </Link>
      </div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        {/* Language switcher: secondary on mobile, restored from sm up */}
        <div className="hidden items-center overflow-hidden rounded-full border border-[#D4DAE3] bg-white sm:flex">
          <div className="border-r border-[#D4DAE3] px-2 text-[#5B6B80]">
            <Globe className="h-4 w-4" />
          </div>
          {(["pt", "en", "es"] as const).map((lng) => {
            const active = language === lng;
            return (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                className={
                  active
                    ? "px-3 py-1 text-xs font-semibold uppercase bg-[#16263F] text-[#E6EAF0]"
                    : "px-3 py-1 text-xs font-semibold uppercase text-[#5B6B80] hover:bg-[#EEF3F8]"
                }
                aria-label={t("admin.toggleLanguage")}
              >
                {lng}
              </button>
            );
          })}
        </div>
        {company && (
          <div className="hidden items-center gap-2 sm:flex" data-testid="company-context">
            {companies.length > 1 ? (
              <select
                aria-label="Empresa"
                value={company.id}
                onChange={(e) => selectCompany(e.target.value)}
                className="max-w-[220px] rounded-full border border-[#D4DAE3] bg-white px-3 py-1 text-xs text-[#1F2933]"
              >
                {companies.map((a) => (
                  <option key={a.company.id} value={a.company.id}>
                    {a.company.trade_name ?? a.company.name} ·{" "}
                    {a.role === "owner"
                      ? "proprietário"
                      : a.role === "operator"
                        ? "operador"
                        : "leitor"}
                  </option>
                ))}
              </select>
            ) : (
              <span className="max-w-[220px] truncate text-xs text-[#1F2933]">
                {company.trade_name ?? company.name}
              </span>
            )}
            {roleLabel && (
              <span
                data-testid="company-role"
                className={
                  companyRole === "owner"
                    ? "rounded-full bg-[#16263F] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#E6EAF0]"
                    : "rounded-full bg-[#E0A23A]/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#A5731D]"
                }
              >
                {roleLabel}
              </span>
            )}
          </div>
        )}
        <NotificationsMenu ariaLabel={t("admin.notifications")} />
        <div className="hidden items-center gap-2 sm:flex">
          <Avatar name={profile?.full_name ?? profile?.email ?? "?"} size="sm" />
          <span className="hidden text-sm text-[#1F2933] sm:inline">
            {profile?.full_name ?? profile?.email ?? "—"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void signOut()}
          aria-label={t("admin.signOut")}
          className="h-11 w-11 shrink-0 sm:h-8 sm:w-auto"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
