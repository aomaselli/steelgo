import { createFileRoute, useParams, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Spinner, Textarea, Avatar } from "@/components/steel";

export const Route = createFileRoute("/shipper/review/$contractId")({
  component: ReviewPage,
});

function StarRow({ value, onChange, max = 5, size = 32 }: { value: number; onChange: (v: number) => void; max?: number; size?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < value;
        return (
          <button key={i} type="button" onClick={() => onChange(i + 1)} className="cursor-pointer">
            <Star className={filled ? "fill-amber-400 text-amber-400" : "text-graphite-600"} style={{ width: size, height: size }} />
          </button>
        );
      })}
    </div>
  );
}

function ReviewPage() {
  const { contractId } = useParams({ from: "/shipper/review/$contractId" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rating, setRating] = useState(5);
  const [onTime, setOnTime] = useState(3);
  const [cargoCond, setCargoCond] = useState(3);
  const [comm, setComm] = useState(3);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: contract, isLoading } = useQuery({
    queryKey: ["review-contract", contractId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("carrier_company_id, carrier_company:carrier_company_id (name, trade_name)")
        .eq("id", contractId)
        .single();
      return data;
    },
  });

  const { data: carrierRow } = useQuery({
    queryKey: ["review-carrier", contract?.carrier_company_id],
    enabled: !!contract?.carrier_company_id,
    queryFn: async () => {
      const { data } = await supabase.from("carriers").select("id").eq("company_id", contract!.carrier_company_id).maybeSingle();
      return data;
    },
  });

  const submit = async () => {
    if (!user || !carrierRow) return;
    setSaving(true);
    const { error } = await supabase.from("carrier_reviews").insert({
      contract_id: contractId,
      carrier_id: carrierRow.id,
      reviewer_id: user.id,
      rating,
      on_time: onTime,
      cargo_condition: cargoCond,
      communication: comm,
      comment: comment || null,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✅ Avaliação enviada — obrigado!");
    navigate({ to: "/shipper/contracts" });
  };

  if (isLoading) return <div className="p-12 flex justify-center"><Spinner /></div>;
  const carrierName = (contract?.carrier_company as { name?: string; trade_name?: string } | null)?.trade_name
    ?? (contract?.carrier_company as { name?: string } | null)?.name ?? "—";

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Avatar name={carrierName} />
          <div>
            <div className="text-sm text-graphite-400">Transportadora</div>
            <div className="text-lg font-semibold text-graphite-50">{carrierName}</div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-graphite-50">Como foi esta entrega?</h2>
          <div className="mt-3"><StarRow value={rating} onChange={setRating} /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-graphite-200 mb-1">Pontualidade</div>
            <StarRow value={onTime} onChange={setOnTime} max={3} size={20} />
          </div>
          <div>
            <div className="text-xs text-graphite-200 mb-1">Condição da carga</div>
            <StarRow value={cargoCond} onChange={setCargoCond} max={3} size={20} />
          </div>
          <div>
            <div className="text-xs text-graphite-200 mb-1">Comunicação</div>
            <StarRow value={comm} onChange={setComm} max={3} size={20} />
          </div>
        </div>

        <div>
          <label className="text-xs text-graphite-200 block mb-1">Comentário (opcional)</label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Deixe um comentário sobre a entrega..." rows={4} />
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="green" onClick={submit} disabled={saving} className="w-full">
            {saving ? "Enviando..." : "Enviar avaliação"}
          </Button>
          <Link to="/shipper/contracts" className="text-center text-xs text-graphite-400 hover:text-graphite-100">Pular</Link>
        </div>
      </Card>
    </div>
  );
}
