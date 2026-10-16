import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { criarUsuario, editarUsuario, listarUsuarios, resetarSenha } from "@/lib/usuarios.functions";
import { ErrorBox, Loading } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/usuarios")({
  beforeLoad: ({ context }) => { if (!context.isAdmin) throw redirect({ to: "/dashboard" }); },
  head: () => ({ meta: [{ title: "Usuários do sistema — Controle de Patrimônio" }, { name: "description", content: "Cadastro e gestão de usuários do sistema de patrimônio." }] }),
  component: Usuarios,
});

type U = { id: string; login: string; nome: string; ativo: boolean; role: "admin" | "usuario" };

function Usuarios() {
  const { user } = Route.useRouteContext();
  const listar = useServerFn(listarUsuarios);
  const criar = useServerFn(criarUsuario);
  const editar = useServerFn(editarUsuario);
  const resetar = useServerFn(resetarSenha);
  const q = useQuery({ queryKey: ["usuarios"], queryFn: () => listar() });
  const [form, setForm] = useState<(Partial<U> & { senha?: string }) | null>(null);
  const [reset, setReset] = useState<U | null>(null);
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); if (!form) return;
    setLoading(true);
    try {
      if (form.id) await editar({ data: { id: form.id, nome: form.nome ?? "", role: form.role ?? "usuario", ativo: form.ativo ?? true } });
      else await criar({ data: { login: form.login ?? "", nome: form.nome ?? "", senha: form.senha ?? "", role: form.role ?? "usuario" } });
      toast.success("Usuário salvo"); setForm(null); q.refetch();
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  }
  async function doReset(e: React.FormEvent) {
    e.preventDefault(); if (!reset) return;
    setLoading(true);
    try { await resetar({ data: { id: reset.id, senha } }); toast.success("Senha redefinida"); setReset(null); setSenha(""); }
    catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  }

  if ((!q.data && !q.error)) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const self = form?.id === user.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Usuários do sistema</h1>
        <Button onClick={() => setForm({ role: "usuario", ativo: true })}><Plus />Cadastrar usuário</Button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {(q.data ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{u.nome}</div>
              <div className="font-mono text-sm text-muted-foreground">{u.login}</div>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{u.role === "admin" ? "Administrador" : "Usuário"}</span>
            <span className={`rounded-full px-2 py-1 text-xs ${u.ativo ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>{u.ativo ? "Ativo" : "Inativo"}</span>
            <Button size="sm" variant="outline" onClick={() => setForm(u)}><Pencil />Editar</Button>
            <Button size="sm" variant="outline" onClick={() => setReset(u)}><KeyRound />Resetar senha</Button>
          </div>
        ))}
      </div>

      {form && (
        <Dialog open onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Editar usuário" : "Cadastrar usuário"}</DialogTitle></DialogHeader>
            <form onSubmit={salvar} className="space-y-3">
              <div className="space-y-1"><Label>Login</Label><Input required disabled={!!form.id} autoCapitalize="none" value={form.login ?? ""} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
              <div className="space-y-1"><Label>Nome</Label><Input required value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              {!form.id && <div className="space-y-1"><Label>Senha</Label><Input type="password" required minLength={6} value={form.senha ?? ""} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></div>}
              <div className="space-y-1"><Label>Perfil</Label>
                <select disabled={self} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as U["role"] })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                  <option value="usuario">Usuário</option><option value="admin">Administrador</option>
                </select></div>
              {form.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={self} checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Ativo</label>}
              {self && <p className="text-xs text-muted-foreground">Você não pode desativar nem mudar o perfil da sua própria conta.</p>}
              <DialogFooter><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={loading}>Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {reset && (
        <Dialog open onOpenChange={(o) => !o && setReset(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova senha para {reset.login}</DialogTitle></DialogHeader>
            <form onSubmit={doReset} className="space-y-3">
              <Input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha" />
              <DialogFooter><Button type="button" variant="outline" onClick={() => setReset(null)}>Cancelar</Button><Button disabled={loading}>Redefinir</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
