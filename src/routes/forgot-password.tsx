import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Input } from "@/components/steel";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
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
    else toast.success("E-mail enviado. Confira sua caixa.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-bold text-graphite-50">Recuperar senha</h1>
        <p className="mb-6 text-sm text-graphite-400">Enviaremos um link para você redefinir.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link"}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="text-steel-blue-400 hover:underline">Voltar ao login</Link>
        </div>
      </Card>
    </div>
  );
}
