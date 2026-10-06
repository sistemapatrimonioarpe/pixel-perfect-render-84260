import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Controle de Patrimônio" },
      { name: "description", content: "Acesse o sistema de controle de patrimônio e inventário." },
      { property: "og:title", content: "Entrar — Controle de Patrimônio" },
      { property: "og:description", content: "Acesse o sistema de controle de patrimônio e inventário." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success("Cadastro feito! Confirme pelo link enviado ao seu e-mail.");
        setMode("in");
      }
    } catch (err: any) {
      toast.error(err.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-7 shadow-xl animate-pop">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground"><Landmark /></div>
          <div>
            <h1 className="text-xl font-semibold">Controle de Patrimônio</h1>
            <p className="text-sm text-muted-foreground">{mode === "in" ? "Entre com sua conta" : "Crie sua conta"}</p>
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /></div>
        <div className="space-y-2"><Label htmlFor="pw">Senha</Label>
          <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></div>
        <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}{mode === "in" ? "Entrar" : "Cadastrar"}
        </Button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-sm text-primary underline-offset-4 hover:underline">
          {mode === "in" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
