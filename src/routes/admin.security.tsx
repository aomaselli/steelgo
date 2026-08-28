import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Button } from "@/components/steel";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-security-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("security_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  async function resolve(id: string) {
    await supabase.from("security_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", id);
    toast.success("Alerta resolvido");
    qc.invalidateQueries({ queryKey: ["admin-security-all"] });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[#10274A]">Segurança</h1>

      <div className="space-y-2">
        {data.length === 0 && (
          <div className="rounded-[12px] border border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)] p-8 text-center text-[#54657C]">
            Nenhum alerta registrado.
          </div>
        )}
        {data.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-[12px] border border-[#DDE7F2] bg-white shadow-[0_8px_18px_rgba(16,39,74,0.04)] p-4"
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 text-[#B45309]" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant={a.severity === "critical" ? "danger" : "amber"}>{a.severity}</Badge>
                <span className="text-sm font-medium text-[#10274A]">{a.title ?? a.type}</span>
                {a.resolved_at && <Badge variant="green">Resolvido</Badge>}
              </div>
              {a.description && <p className="mt-1 text-xs text-[#54657C]">{a.description}</p>}
              <p className="mt-1 text-[10px] text-[#7A8AA0]">
                {a.created_at && new Date(a.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
            {!a.resolved_at && (
              <Button variant="ghost" size="sm" onClick={() => resolve(a.id)}>
                Resolver
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
