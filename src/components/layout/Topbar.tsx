import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Search, Bell, Menu, X } from "lucide-react";
import { Avatar, Modal, Input } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface TopbarProps {
  title?: string;
  breadcrumb?: BreadcrumbItem[];
  unreadCount?: number;
  onMenuClick?: () => void;
  showMenu?: boolean;
}

export function Topbar({
  title,
  breadcrumb,
  unreadCount = 0,
  onMenuClick,
  showMenu,
}: TopbarProps) {
  const { profile, signOut } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="h-14 bg-[#161B22] border-b border-[#30363D] flex items-center px-6 gap-4 sticky top-0 z-40">
        {showMenu && (
          <button
            onClick={onMenuClick}
            className="text-[#8B949E] hover:text-[#E6EDF3] md:hidden"
            aria-label="Menu"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Left */}
        <div className="flex items-center min-w-0">
          {breadcrumb && breadcrumb.length > 0 ? (
            <nav className="flex items-center gap-1 text-sm">
              {breadcrumb.map((c, i) => {
                const last = i === breadcrumb.length - 1;
                const cls = last ? "text-[#E6EDF3]" : "text-[#484F58]";
                return (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={14} className="text-[#484F58]" />}
                    {c.href && !last ? (
                      <Link to={c.href} className={`${cls} hover:text-[#E6EDF3]`}>
                        {c.label}
                      </Link>
                    ) : (
                      <span className={cls}>{c.label}</span>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : (
            <h1 className="text-lg font-semibold text-[#E6EDF3] truncate">{title}</h1>
          )}
        </div>

        {/* Center — search */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => setSearchOpen(true)}
            className="bg-[#21262D] border border-[#30363D] rounded-[10px] px-3 py-1.5 flex items-center gap-2 w-full max-w-xs cursor-pointer hover:border-[#484F58] transition"
          >
            <Search size={16} className="text-[#484F58]" />
            <span className="text-sm text-[#484F58]">Buscar...</span>
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <div className="flex border border-[#30363D] rounded-full overflow-hidden">
            {(["pt", "en"] as const).map((lng) => {
              const active = language === lng;
              return (
                <button
                  key={lng}
                  onClick={() => setLanguage(lng)}
                  className={`text-xs px-3 py-1 transition ${
                    active
                      ? "bg-[#1B6CB8] text-white"
                      : "text-[#8B949E] hover:text-[#E6EDF3]"
                  }`}
                >
                  {lng.toUpperCase()}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative text-[#8B949E] hover:text-[#E6EDF3]"
            aria-label="Notificações"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>

          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} aria-label="Perfil">
              <Avatar name={profile?.full_name ?? "User"} src={profile?.avatar_url ?? undefined} size="md" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-44 bg-[#1C2128] border border-[#30363D] rounded-[10px] shadow-2xl z-50 py-1">
                  <Link
                    to="/shipper/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-[#C9D1D9] hover:bg-[#21262D]"
                  >
                    Ver perfil
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#21262D]"
                  >
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Search modal */}
      <Modal isOpen={searchOpen} onClose={() => setSearchOpen(false)} title="Buscar" size="lg">
        <Input
          autoFocus
          placeholder="Buscar fretes, contratos, transportadoras..."
          leftIcon={<Search size={16} />}
        />
      </Modal>

      {/* Notification panel */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setNotifOpen(false)} />
          <aside className="bg-[#1C2128] border-l border-[#30363D] w-80 fixed top-0 right-0 h-full z-50 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[#30363D]">
              <h2 className="text-lg font-semibold text-[#E6EDF3]">Notificações</h2>
              <button
                onClick={() => setNotifOpen(false)}
                className="text-[#8B949E] hover:text-[#E6EDF3]"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-sm text-[#8B949E]">
              Nenhuma notificação ainda.
            </div>
          </aside>
        </>
      )}
    </>
  );
}
