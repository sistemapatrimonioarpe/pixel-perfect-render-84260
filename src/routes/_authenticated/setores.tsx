import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { db, fetchAll, useRealtime, type Equipamento, type Setor } from "@/lib/patrimonio";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/setores")({
  head: () => ({ meta: [{ title: "Setores — Controle de Patrimônio" }, { name: "description", content: "Cadastro de setores e quantidade de equipamentos." }] }),
  component: Setores,
});

function Setores() {
  useRealtime(["setores", "equipamentos"], [["setores-page"]]);
  const q = useQuery({
    queryKey: ["setores-page"],
    queryFn: async () => ({ se: await fetchAll<Setor>("setores", "nome"), eq: await fetchAll<Equipamento>("equipamentos") }),
  });
  const [edit, setEdit] = useState<Partial<Setor> | null>(null);

  async function remove(s: Setor) {
    if (!confirm(`Excluir o setor "${s.nome}"? Os equipamentos ficarão sem setor.`)) return;
    const { error } = await db.from("setores").delete().eq("id", s.id);
    error ? toast.error(error.message) : toast.success("Setor excluído");
  }

  return (
    <div>
      <PageHeader title="Setores" subtitle="Unidades e responsáveis" actions={<Button size="lg" onClick={() => setEdit({})}><Plus />Novo setor</Button>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : q.data!.se.length === 0 ? <Empty>Nenhum setor cadastrado.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.se.map((s) => {
            const n = q.data!.eq.filter((e) => e.setor_id === s.id).length;
            return (
              <div key={s.id} className="rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.nome}</div>
                    <div className="text-sm text-muted-foreground">{s.sigla || "—"} · {s.responsavel || "Sem responsável"}</div>
                  </div>
                  <div className="shrink-0 rounded-lg bg-accent px-3 py-1 text-sm font-semibold tabular-nums text-accent-foreground">{n}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEdit(s)}><Pencil />Editar</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(s)}><Trash2 />Excluir</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <SetorDialog value={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function SetorDialog({ value, onClose }: { value: Partial<Setor> | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Setor>>({});
  const [saving, setSaving] = useState(false);
  const open = value !== null;
  const v = { ...value, ...form };
  async function save() {
    if (!v.nome?.trim()) return void toast.error("Informe o nome");
    setSaving(true);
    const payload = { nome: v.nome.trim(), sigla: v.sigla || null, responsavel: v.responsavel || null };
    const { error } = value?.id ? await db.from("setores").update(payload).eq("id", value.id) : await db.from("setores").insert(payload);
    setSaving(false);
    if (error) return void toast.error(error.code === "23505" ? "Já existe um setor com esse nome" : error.message);
    toast.success("Setor salvo"); setForm({}); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setForm({}); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "Editar setor" : "Novo setor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {(["nome", "sigla", "responsavel"] as const).map((k) => (
            <div key={k} className="space-y-1"><Label className="capitalize">{k === "responsavel" ? "Responsável" : k}</Label>
              <Input className="h-11" value={(v[k] as string) ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
          ))}
        </div>
        <DialogFooter><Button size="lg" onClick={save} disabled={saving}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
