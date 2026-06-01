import { Link } from "@tanstack/react-router";
import { Bell, LogOut, Globe } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Avatar } from "@/components/steel/Avatar";
import { Button } from "@/components/steel/Button";

export function Topbar() {
  const { profile, signOut } = useAuth();
  const { language, setLanguage } = useLanguage();

  return (
    <header className="flex h-14 items-center justify-between border-b border-graphite-800 bg-bg-surface px-4 md:px-6">
      <div className="md:hidden">
        <Link to="/" className="text-lg font-bold text-graphite-50">
          SteelGo
        </Link>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setLanguage(language === "pt" ? "en" : "pt")}
          className="flex items-center gap-1 rounded-md p-2 text-sm text-graphite-200 hover:bg-bg-elevated"
          aria-label="Toggle language"
        >
          <Globe className="h-4 w-4" />
          <span className="uppercase">{language}</span>
        </button>
        <button
          className="rounded-md p-2 text-graphite-200 hover:bg-bg-elevated"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Avatar name={profile?.full_name ?? profile?.email ?? "?"} size="sm" />
          <span className="hidden text-sm text-graphite-100 sm:inline">
            {profile?.full_name ?? profile?.email ?? "—"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
