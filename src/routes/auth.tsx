import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BrandMark, TricolorStripe } from "@/components/BrandMark";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarPrimeiroAdmin, existeAdmin, loginToEmail } from "@/lib/usuarios.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Controle de Patrimônio" },
      { name: "description", content: "Acesse o sistema de controle de patrimônio e inventário." },
      { property: "og:title", content: "Entrar — Controle de Patrimônio" },
      { property: "og:description", content: "Acesse o sistema de controle de patrimônio e inventário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState(false);

  useEffect(() => { existeAdmin().then((r) => setSetup(!r.existe)).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (setup) {
        await criarPrimeiroAdmin({ data: { login: usuario, nome, senha: password } });
        toast.success("Administrador criado");
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginToEmail(usuario), password });
      if (error) throw error;
      const { data: perfil } = await supabase.from("perfis").select("ativo").eq("id", data.user.id).maybeSingle();
      if (!perfil || !perfil.ativo) {
        await supabase.auth.signOut();
        throw new Error("Usuário desativado");
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      const m = String(err?.message ?? err);
      toast.error(m === "Invalid login credentials" ? "Usuário ou senha incorretos" : m.toLowerCase().includes("banned") ? "Usuário desativado" : m);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-7 shadow-xl animate-pop">
        <div className="flex items-center gap-3">
          <BrandMark size={48} />
          <div>
            <h1 className="text-xl">Controle de Patrimônio</h1>
            <TricolorStripe className="mt-1 w-24" />
            <p className="text-sm text-muted-foreground">{setup ? "Primeiro acesso: crie o administrador" : "Entre com seu usuário"}</p>
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor="usuario">Usuário</Label>
          <Input id="usuario" required autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} className="h-12" /></div>
        {setup && <div className="space-y-2"><Label htmlFor="nome">Nome</Label>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="h-12" /></div>}
        <div className="space-y-2"><Label htmlFor="pw">Senha</Label>
          <Input id="pw" type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></div>
        <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}{setup ? "Criar e entrar" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
