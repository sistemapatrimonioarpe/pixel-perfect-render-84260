import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { db, ESTADOS, exportRows, fetchAll, fmtDate, logHistorico, useRealtime, type Equipamento, type Historico, type Setor } from "@/lib/patrimonio";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/equipamentos")({
  head: () => ({ meta: [{ title: "Equipamentos — Controle de Patrimônio" }, { name: "description", content: "Tombamentos: busca, cadastro, importação e exportação." }] }),
  component: Equipamentos,
});

const ALL = "__all";

function Sel({ value, onChange, options, className = "" }: { value: string; onChange: (v: string) => void; options: [string, string][]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-11 rounded-md border border-input bg-card px-3 text-sm ${className}`}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function Equipamentos() {
  useRealtime(["equipamentos", "setores"], [["equip-page"]]);
  const q = useQuery({
    queryKey: ["equip-page"],
    queryFn: async () => ({ eq: await fetchAll<Equipamento>("equipamentos", "tombamento"), se: await fetchAll<Setor>("setores", "nome") }),
  });
  const [busca, setBusca] = useState("");
  const [fSetor, setFSetor] = useState(ALL);
  const [fTipo, setFTipo] = useState(ALL);
  const [fEstado, setFEstado] = useState(ALL);
  const [edit, setEdit] = useState<Partial<Equipamento> | null>(null);
  const [ficha, setFicha] = useState<Equipamento | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const setorMap = useMemo(() => new Map((q.data?.se ?? []).map((s) => [s.id, s])), [q.data]);
  const tipos = useMemo(() => [...new Set((q.data?.eq ?? []).map((e) => e.nome))].sort(), [q.data]);
  const lista = useMemo(() => {
    const t = busca.toLowerCase();
    return (q.data?.eq ?? []).filter((e) =>
      (fSetor === ALL || e.setor_id === fSetor) && (fTipo === ALL || e.nome === fTipo) && (fEstado === ALL || e.estado === fEstado) &&
      (!t || [e.tombamento, e.nome, e.descricao, e.usuario].some((x) => x?.toLowerCase().includes(t))));
  }, [q.data, busca, fSetor, fTipo, fEstado]);

  function doExport(kind: "csv" | "xlsx") {
    exportRows(lista.map((e) => ({
      Tombamento: e.tombamento, Nome: e.nome, Descrição: e.descricao ?? "", Usuário: e.usuario ?? "",
      Estado: e.estado, Setor: e.setor_id ? setorMap.get(e.setor_id)?.nome ?? "" : "",
    })), "equipamentos", kind);
  }

  async function remove(e: Equipamento) {
    if (!confirm(`Excluir o tombamento ${e.tombamento}?`)) return;
    const { error } = await db.from("equipamentos").delete().eq("id", e.id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); await logHistorico(null, "Exclusão", `${e.tombamento} · ${e.nome}`); }
  }

  return (
    <div>
      <PageHeader title="Equipamentos" subtitle={q.data ? `${lista.length} de ${q.data.eq.length} tombamentos` : undefined} actions={<>
        <Button variant="outline" size="lg" onClick={() => setImportOpen(true)}><Upload />Importar</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="lg"><Download />Exportar</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem onClick={() => doExport("csv")}>CSV</DropdownMenuItem><DropdownMenuItem onClick={() => doExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <Button size="lg" onClick={() => setEdit({ estado: "Bom" })}><Plus />Novo</Button>
      </>} />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={18} />
          <Input placeholder="Buscar tombamento, nome, usuário..." value={busca} onChange={(e) => setBusca(e.target.value)} className="h-11 pl-10" /></div>
        <Sel value={fSetor} onChange={setFSetor} options={[[ALL, "Todos os setores"], ...(q.data?.se ?? []).map((s) => [s.id, s.nome] as [string, string])]} />
        <Sel value={fTipo} onChange={setFTipo} options={[[ALL, "Todos os tipos"], ...tipos.map((t) => [t, t] as [string, string])]} />
        <Sel value={fEstado} onChange={setFEstado} options={[[ALL, "Todos os estados"], ...ESTADOS.map((t) => [t, t] as [string, string])]} />
      </div>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : lista.length === 0 ? <Empty>Nenhum equipamento encontrado.</Empty> : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="hidden bg-muted text-left text-xs uppercase text-muted-foreground md:table-header-group">
              <tr><th className="p-3">Tombamento</th><th className="p-3">Nome</th><th className="p-3">Usuário</th><th className="p-3">Setor</th><th className="p-3">Estado</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y">
              {lista.slice(0, 500).map((e) => (
                <tr key={e.id} onClick={() => setFicha(e)} className="flex cursor-pointer flex-wrap items-center gap-x-3 p-3 hover:bg-muted/50 md:table-row md:p-0">
                  <td className="font-mono font-semibold md:p-3">{e.tombamento}</td>
                  <td className="w-full md:w-auto md:p-3">{e.nome}</td>
                  <td className="text-muted-foreground md:p-3">{e.usuario || "—"}</td>
                  <td className="text-muted-foreground md:p-3">{e.setor_id ? setorMap.get(e.setor_id)?.sigla || setorMap.get(e.setor_id)?.nome : "Sem setor"}</td>
                  <td className="md:p-3"><span className="rounded-md bg-accent px-2 py-0.5 text-xs">{e.estado}</span></td>
                  <td className="ml-auto md:p-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEdit(e)} aria-label="Editar"><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(e)} aria-label="Excluir"><Trash2 /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > 500 && <p className="p-3 text-center text-xs text-muted-foreground">Mostrando 500 de {lista.length}. Use a busca para refinar.</p>}
        </div>
      )}

      <EquipamentoDialog value={edit} setores={q.data?.se ?? []} onClose={() => setEdit(null)} />
      <Ficha equip={ficha} setor={ficha?.setor_id ? setorMap.get(ficha.setor_id) : undefined} onClose={() => setFicha(null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

export function EquipamentoDialog({ value, setores, onClose }: { value: Partial<Equipamento> | null; setores: Setor[]; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Equipamento>>({});
  const [saving, setSaving] = useState(false);
  const v = { ...value, ...form };
  const close = () => { setForm({}); onClose(); };
  async function save() {
    if (!v.tombamento?.trim() || !v.nome?.trim()) return void toast.error("Tombamento e nome são obrigatórios");
    setSaving(true);
    const payload = { tombamento: v.tombamento.trim(), nome: v.nome.trim(), descricao: v.descricao || null, usuario: v.usuario || null, estado: v.estado || "Bom", setor_id: v.setor_id || null, updated_at: new Date().toISOString() };
    const res = value?.id ? await db.from("equipamentos").update(payload).eq("id", value.id).select().single() : await db.from("equipamentos").insert(payload).select().single();
    setSaving(false);
    if (res.error) return void toast.error(res.error.code === "23505" ? "Este tombamento já existe" : res.error.message);
    const nomeSetor = setores.find((s) => s.id === payload.setor_id)?.nome ?? "sem setor";
    if (!value?.id) await logHistorico(res.data.id, "Cadastro", `Setor: ${nomeSetor}`);
    else if (value.setor_id !== payload.setor_id) await logHistorico(res.data.id, "Transferência", `Para ${nomeSetor}`);
    else await logHistorico(res.data.id, "Edição");
    toast.success("Equipamento salvo"); close();
  }
  return (
    <Dialog open={value !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{value?.id ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Tombamento</Label><Input className="h-11 font-mono" value={v.tombamento ?? ""} onChange={(e) => setForm({ ...form, tombamento: e.target.value })} /></div>
          <div className="space-y-1"><Label>Nome</Label><Input className="h-11" value={v.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Computador, Cadeira" /></div>
          <div className="space-y-1"><Label>Descrição</Label><Textarea value={v.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="space-y-1"><Label>Usuário</Label><Input className="h-11" value={v.usuario ?? ""} onChange={(e) => setForm({ ...form, usuario: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Estado</Label><Sel className="w-full" value={v.estado ?? "Bom"} onChange={(x) => setForm({ ...form, estado: x })} options={ESTADOS.map((t) => [t, t])} /></div>
            <div className="space-y-1"><Label>Setor</Label><Sel className="w-full" value={v.setor_id ?? ""} onChange={(x) => setForm({ ...form, setor_id: x || null })} options={[["", "Sem setor"], ...setores.map((s) => [s.id, s.nome] as [string, string])]} /></div>
          </div>
        </div>
        <DialogFooter><Button size="lg" onClick={save} disabled={saving}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HistoricoList({ equipamentoId }: { equipamentoId: string }) {
  useRealtime(["historico"], [["hist", equipamentoId]]);
  const q = useQuery({
    queryKey: ["hist", equipamentoId],
    queryFn: async () => {
      const { data, error } = await db.from("historico").select("*").eq("equipamento_id", equipamentoId).order("created_at", { ascending: false });
      if (error) throw error; return data as Historico[];
    },
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data!.length) return <p className="text-sm text-muted-foreground">Sem histórico.</p>;
  return (
    <ol className="space-y-3 border-l-2 pl-4">
      {q.data!.map((h) => (
        <li key={h.id} className="text-sm"><div className="font-medium">{h.acao} <span className="text-xs font-normal text-muted-foreground">· {fmtDate(h.created_at)}</span></div>
          <div className="text-muted-foreground">{h.detalhes}{h.usuario_email && ` — ${h.usuario_email}`}</div></li>
      ))}
    </ol>
  );
}

function Ficha({ equip, setor, onClose }: { equip: Equipamento | null; setor?: Setor | undefined; onClose: () => void }) {
  return (
    <Dialog open={!!equip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {equip && <>
          <DialogHeader><DialogTitle><span className="font-mono">{equip.tombamento}</span> · {equip.nome}</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[["Setor", setor?.nome ?? "Sem setor"], ["Usuário", equip.usuario || "—"], ["Estado", equip.estado], ["Cadastrado em", fmtDate(equip.created_at)]].map(([k, val]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{val}</dd></div>
            ))}
            <div className="col-span-2"><dt className="text-xs text-muted-foreground">Descrição</dt><dd>{equip.descricao || "—"}</dd></div>
          </dl>
          <h3 className="mt-2 font-semibold">Histórico</h3>
          <HistoricoList equipamentoId={equip.id} />
        </>}
      </DialogContent>
    </Dialog>
  );
}

const CAMPOS = [["tombamento", "Tombamento*"], ["nome", "Nome*"], ["descricao", "Descrição"], ["usuario", "Usuário"], ["setor", "Setor"]] as const;
type Campo = (typeof CAMPOS)[number][0];

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [map, setMap] = useState<Record<Campo, string>>({ tombamento: "", nome: "", descricao: "", usuario: "", setor: "" });
  const [dup, setDup] = useState<"ignorar" | "atualizar">("ignorar");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ importados: number; atualizados: number; ignorados: number; erros: string[] } | null>(null);

  function reset() { setRows([]); setCols([]); setReport(null); setMap({ tombamento: "", nome: "", descricao: "", usuario: "", setor: "" }); }

  async function onFile(f: File) {
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: "" });
      if (!data.length) return void toast.error("Planilha vazia");
      const c = Object.keys(data[0]!);
      setRows(data); setCols(c); setReport(null);
      const guess = (keys: string[]) => c.find((x) => keys.some((k) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(k))) ?? "";
      setMap({ tombamento: guess(["tomb", "patrim", "codigo"]), nome: guess(["nome", "item", "tipo"]), descricao: guess(["desc"]), usuario: guess(["usuar", "respons"]), setor: guess(["setor", "lotac", "local"]) });
    } catch (e: any) { toast.error("Não foi possível ler o arquivo: " + e.message); }
  }

  async function run() {
    if (!map.tombamento || !map.nome) return void toast.error("Mapeie ao menos tombamento e nome");
    setBusy(true);
    const r = { importados: 0, atualizados: 0, ignorados: 0, erros: [] as string[] };
    try {
      const setores = await fetchAll<Setor>("setores");
      const sMap = new Map(setores.map((s) => [s.nome.trim().toLowerCase(), s.id]));
      const existing = new Map((await fetchAll<Equipamento>("equipamentos")).map((e) => [e.tombamento, e]));
      const get = (row: Record<string, unknown>, c: Campo) => (map[c] ? String(row[map[c]] ?? "").trim() : "");
      for (const nome of new Set(rows.map((row) => get(row, "setor")).filter(Boolean))) {
        if (sMap.has(nome.toLowerCase())) continue;
        const { data, error } = await db.from("setores").insert({ nome }).select().single();
        if (error) r.erros.push(`Setor "${nome}": ${error.message}`); else sMap.set(nome.toLowerCase(), data.id);
      }
      const novos: any[] = []; const seen = new Set<string>();
      for (const [i, row] of rows.entries()) {
        const tomb = get(row, "tombamento"); const nome = get(row, "nome");
        if (!tomb || !nome) { r.erros.push(`Linha ${i + 2}: tombamento ou nome vazio`); continue; }
        if (seen.has(tomb)) { r.erros.push(`Linha ${i + 2}: tombamento ${tomb} repetido na planilha`); continue; }
        seen.add(tomb);
        const setorNome = get(row, "setor");
        const payload: any = { tombamento: tomb, nome, descricao: get(row, "descricao") || null, usuario: get(row, "usuario") || null, setor_id: setorNome ? sMap.get(setorNome.toLowerCase()) ?? null : null };
        const ex = existing.get(tomb);
        if (ex) {
          if (dup === "ignorar") { r.ignorados++; continue; }
          const { error } = await db.from("equipamentos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", ex.id);
          if (error) r.erros.push(`${tomb}: ${error.message}`); else r.atualizados++;
        } else novos.push(payload);
      }
      for (let i = 0; i < novos.length; i += 500) {
        const { data, error } = await db.from("equipamentos").insert(novos.slice(i, i + 500)).select("id");
        if (error) r.erros.push(`Lote ${i / 500 + 1}: ${error.message}`);
        else {
          r.importados += data.length;
          const { data: u } = await (await import("@/integrations/supabase/client")).supabase.auth.getUser();
          await db.from("historico").insert(data.map((d: any) => ({ equipamento_id: d.id, acao: "Importação", detalhes: "Cadastrado via planilha", usuario_email: u.user?.email ?? null })));
        }
      }
      setReport(r);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Importar planilha</DialogTitle></DialogHeader>
        {report ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-success-soft p-3"><div className="text-2xl font-semibold">{report.importados}</div><div className="text-xs">Importados</div></div>
              <div className="rounded-xl bg-accent p-3"><div className="text-2xl font-semibold">{report.atualizados}</div><div className="text-xs">Atualizados</div></div>
              <div className="rounded-xl bg-muted p-3"><div className="text-2xl font-semibold">{report.ignorados}</div><div className="text-xs">Ignorados</div></div>
            </div>
            {report.erros.length > 0 && <div className="max-h-48 overflow-y-auto rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              <div className="mb-1 font-semibold">{report.erros.length} erro(s)</div>{report.erros.map((e, i) => <div key={i}>{e}</div>)}</div>}
            <DialogFooter><Button onClick={reset} variant="outline">Importar outra</Button></DialogFooter>
          </div>
        ) : !rows.length ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground hover:bg-muted/50">
            <Upload /> Selecione um arquivo .xlsx ou .csv
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {CAMPOS.map(([k, l]) => (
                <div key={k} className="space-y-1"><Label>{l}</Label>
                  <Sel className="w-full" value={map[k]} onChange={(x) => setMap({ ...map, [k]: x })} options={[["", "— não importar —"], ...cols.map((c) => [c, c] as [string, string])]} /></div>
              ))}
              <div className="space-y-1"><Label>Tombamentos já existentes</Label>
                <Sel className="w-full" value={dup} onChange={(x) => setDup(x as any)} options={[["ignorar", "Ignorar"], ["atualizar", "Atualizar"]]} /></div>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-xs"><thead className="bg-muted"><tr>{CAMPOS.map(([k, l]) => <th key={k} className="p-2 text-left">{l}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t">{CAMPOS.map(([k]) => <td key={k} className="p-2">{map[k] ? String(r[map[k]] ?? "") : ""}</td>)}</tr>)}</tbody></table>
            </div>
            <p className="text-xs text-muted-foreground">Pré-visualização das primeiras linhas · {rows.length} linhas no total. Setores inexistentes serão criados.</p>
            <DialogFooter><Button variant="outline" onClick={reset}>Trocar arquivo</Button><Button size="lg" onClick={run} disabled={busy}>{busy ? "Importando..." : `Importar ${rows.length} linhas`}</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
