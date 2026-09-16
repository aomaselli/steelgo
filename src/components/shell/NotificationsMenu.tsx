import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Row = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/**
 * Notificacoes INTERNAS (in-app), lidas por RPC (list_my_notifications) e
 * marcadas como lidas por RPC (mark_notifications_read). Sem Realtime: a lista
 * e o contador sao reconsultados a cada 60 s e ao abrir o painel. Nao existe
 * e-mail nem push - e a interface nao sugere que exista.
 */
export function NotificationsMenu({ ariaLabel }: { ariaLabel: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("count_my_unread_notifications");
      if (error) throw error;
      return data ?? 0;
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications-list", user?.id],
    enabled: !!user && open,
    refetchInterval: open ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_notifications", {
        p_limit: 30,
        p_unread_only: false,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
    if (error) return; // silencioso: leitura continua valida; o contador reconsulta em 60 s
    qc.invalidateQueries({ queryKey: ["notifications-unread", user?.id] });
    qc.invalidateQueries({ queryKey: ["notifications-list", user?.id] });
  }

  if (!user) return null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="relative rounded-md p-2 text-[#5B6B80] hover:bg-[#EEF3F8]"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-[#B74545] px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-[12px] border border-[#D4DAE3] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[#E6EAF0] px-3 py-2">
            <span className="text-sm font-semibold text-[#10274A]">Notificações</span>
            <button
              type="button"
              className="text-xs text-[#1B6CB8] hover:underline disabled:opacity-40"
              disabled={items.every((i) => i.is_read)}
              onClick={() => void markRead(items.filter((i) => !i.is_read).map((i) => i.id))}
            >
              Marcar todas como lidas
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-[#E6EAF0] overflow-y-auto">
            {isLoading && <li className="px-3 py-4 text-xs text-[#54657C]">Carregando…</li>}
            {!isLoading && items.length === 0 && (
              <li className="px-3 py-4 text-xs text-[#54657C]">Nenhuma notificação.</li>
            )}
            {items.map((n) => (
              <li key={n.id} className={n.is_read ? "bg-white" : "bg-[#E8F1FB]"}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!n.is_read) void markRead([n.id]);
                    if (n.link) router.history.push(n.link);
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-[#EEF3F8]"
                >
                  <div className="text-sm font-medium text-[#10274A]">{n.title ?? "—"}</div>
                  {n.body && <div className="mt-0.5 text-xs text-[#54657C]">{n.body}</div>}
                  <div className="mt-0.5 text-[10px] text-[#8A97A8]">
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-[#E6EAF0] px-3 py-1.5 text-[10px] text-[#8A97A8]">
            Notificações internas da plataforma. Não há envio por e-mail nem push.
          </div>
        </div>
      )}
    </div>
  );
}
