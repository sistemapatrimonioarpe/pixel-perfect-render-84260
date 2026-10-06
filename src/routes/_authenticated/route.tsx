import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BarChart3, Building2, ClipboardCheck, KeyRound, Landmark, LayoutGrid, LogOut, Package, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const [p, r] = await Promise.all([
      supabase.from("perfis").select("*").eq("id", data.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    ]);
    if (!p.data || !p.data.ativo) {
      await supabase.auth.signOut();
      toast.error("Usuário desativado");
      throw redirect({ to: "/auth" });
    }
    const isAdmin = (r.data ?? []).some((x) => x.role === "admin");
    return { user: data.user, perfil: p.data, isAdmin };
  },
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Painel", icon: BarChart3 },
  { to: "/mapa", label: "Mapa geral", icon: LayoutGrid },
  { to: "/inventario", label: "Inventário", icon: ClipboardCheck },
  { to: "/equipamentos", label: "Equipamentos", icon: Package },
  { to: "/setores", label: "Setores", icon: Building2 },
] as const;

function Layout() {
  const { perfil, isAdmin } = Route.useRouteContext();
  const [senhaOpen, setSenhaOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-3 p-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Landmark size={20} /></div>
          <div className="font-semibold leading-tight">Patrimônio<div className="text-xs font-normal opacity-70">Controle e inventário</div></div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
              <n.icon size={18} />{n.label}
            </Link>
          ))}
          {isAdmin && (
            <Link to="/usuarios" className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
              <Users size={18} />Cadastrar usuário do sistema
            </Link>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-xs">
          <div className="truncate font-medium">{perfil.nome}</div>
          <div className="truncate opacity-70">{perfil.login}</div>
          <button onClick={() => setSenhaOpen(true)} className="mt-2 flex items-center gap-2 hover:text-sidebar-primary"><KeyRound size={14} />Alterar minha senha</button>
          <button onClick={signOut} className="mt-2 flex items-center gap-2 hover:text-sidebar-primary"><LogOut size={14} />Sair</button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <div className="flex items-center gap-2 font-semibold"><Landmark size={18} />Patrimônio</div>
        <div className="flex items-center">
          {isAdmin && <Link to="/usuarios" aria-label="Usuários do sistema" className="p-2"><Users size={18} /></Link>}
          <button onClick={() => setSenhaOpen(true)} aria-label="Alterar minha senha" className="p-2"><KeyRound size={18} /></button>
          <button onClick={signOut} aria-label="Sair" className="p-2"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="min-w-0 flex-1 p-4 pb-28 md:p-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
            activeProps={{ className: "text-primary font-semibold" }}>
            <n.icon size={22} />{n.label}
          </Link>
        ))}
      </nav>
      {senhaOpen && <SenhaDialog onClose={() => setSenhaOpen(false)} />}
    </div>
  );
}

function SenhaDialog({ onClose }: { onClose: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (nova !== conf) return void toast.error("As senhas não conferem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: nova, current_password: atual } as any);
    setLoading(false);
    if (error) return void toast.error(error.message.toLowerCase().includes("current") ? "Senha atual incorreta" : error.message);
    toast.success("Senha alterada"); onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar minha senha</DialogTitle></DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <div className="space-y-1"><Label>Senha atual</Label><Input type="password" required value={atual} onChange={(e) => setAtual(e.target.value)} /></div>
          <div className="space-y-1"><Label>Nova senha</Label><Input type="password" required minLength={6} value={nova} onChange={(e) => setNova(e.target.value)} /></div>
          <div className="space-y-1"><Label>Repita a nova senha</Label><Input type="password" required minLength={6} value={conf} onChange={(e) => setConf(e.target.value)} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={loading}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
