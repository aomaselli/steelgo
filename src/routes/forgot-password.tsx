import { useHydrated } from "@/lib/useHydrated";
import { useAuthCopy } from "@/lib/i18n.auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Input } from "@/components/steel";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const hydrated = useHydrated();
  const tr = useAuthCopy();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success(tr("E-mail enviado. Confira sua caixa."));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-bold text-graphite-50">{tr("Recuperar senha")}</h1>
        <p className="mb-6 text-sm text-graphite-400">{tr("Enviaremos um link para você redefinir.")}</p>
        <form method="post" onSubmit={onSubmit} className="space-y-4">
          <Input type="email" placeholder={tr("E-mail")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" size="lg" className="w-full" disabled={!hydrated || loading}>
            {!hydrated ? tr("Carregando...") : loading ? tr("Enviando...") : tr("Enviar link")}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="text-steel-blue-400 hover:underline">{tr("Voltar ao login")}</Link>
        </div>
      </Card>
    </div>
  );
}
