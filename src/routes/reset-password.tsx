import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Input } from "@/components/steel";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Senha atualizada!");
      void navigate({ to: "/login" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 text-2xl font-bold text-graphite-50">Nova senha</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input type="password" placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
