import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Camera, Check, CheckCircle2, Download, Flag, PackagePlus, ScanLine, X } from "lucide-react";
import { db, exportRows, fetchAll, fmtDate, feedback, logHistorico, useRealtime, type Equipamento, type Inventario, type InventarioItem, type Setor } from "@/lib/patrimonio";
import { ErrorBox, Loading } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EquipamentoDialog, HistoricoList } from "./equipamentos";

export const Route = createFileRoute("/_authenticated/inventario/$id")({
  head: () => ({ meta: [{ title: "Conferência de inventário — Controle de Patrimônio" }, { name: "description", content: "Leitura de tombamentos e progresso do inventário do setor." }] }),
  component: InventarioSetor,
});

type Scan =
  | { kind: "ok"; equip: Equipamento; repetido: boolean }
  | { kind: "outro"; equip: Equipamento; setorAtual?: Setor }
  | { kind: "nao"; codigo: string };

function InventarioSetor() {
  const { id } = Route.useParams();
  const key = ["inv", id];
  useRealtime(["inventario_itens", "equipamentos", "inventarios", "setores"], [key]);
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: inv, error } = await db.from("inventarios").select("*").eq("id", id).single();
      if (error) throw error;
      const [setores, equipamentos, itens] = await Promise.all([
        fetchAll<Setor>("setores", "nome"),
        (async () => { const r = await db.from("equipamentos").select("*").eq("setor_id", inv.setor_id).order("tombamento").limit(10000); if (r.error) throw r.error; return r.data as Equipamento[]; })(),
        (async () => { const r = await db.from("inventario_itens").select("*").eq("inventario_id", id).limit(10000); if (r.error) throw r.error; return r.data as InventarioItem[]; })(),
      ]);
      return { inv: inv as Inventario, setores, equipamentos, itens };
    },
  });

  const [codigo, setCodigo] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ok" | "falta">("todos");
  const [scan, setScan] = useState<Scan | null>(null);
  const [camera, setCamera] = useState(false);
  const [novo, setNovo] = useState<Partial<Equipamento> | null>(null);
  const [relatorio, setRelatorio] = useState(false);
  const [destino, setDestino] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const d = q.data;
  const setor = d?.setores.find((s) => s.id === d.inv.setor_id);
  const conferidos = useMemo(() => new Set(d?.itens.map((i) => i.equipamento_id)), [d]);
  const total = d?.equipamentos.length ?? 0;
  const feitos = d ? d.equipamentos.filter((e) => conferidos.has(e.id)).length : 0;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const finalizado = !!d?.inv.finalizado_em;
  const lista = (d?.equipamentos ?? []).filter((e) => filtro === "todos" || (filtro === "ok") === conferidos.has(e.id));

  useEffect(() => {
    if (camera || novo || relatorio || scan?.kind === "outro") return;
    const t = setInterval(() => { if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "SELECT") inputRef.current?.focus(); }, 800);
    return () => clearInterval(t);
  }, [camera, novo, relatorio, scan]);

  async function conferir(e: Equipamento, transferido = false) {
    const { error } = await db.from("inventario_itens").insert({ inventario_id: id, equipamento_id: e.id, transferido });
    if (error && error.code !== "23505") throw error;
    if (!error) await logHistorico(e.id, "Conferido no inventário", `Setor: ${setor?.nome}`);
    q.refetch();
    return !error;
  }

  async function processar(raw: string) {
    const c = raw.trim();
    if (!c || !d || busy.current) return;
    if (finalizado) return toast.error("Este inventário já foi finalizado");
    busy.current = true;
    try {
      const { data, error } = await db.from("equipamentos").select("*").eq("tombamento", c).maybeSingle();
      if (error) throw error;
      if (!data) { feedback(false); setScan({ kind: "nao", codigo: c }); return; }
      const e = data as Equipamento;
      if (e.setor_id !== d.inv.setor_id) {
        feedback(false); setDestino(d.inv.setor_id);
        setScan({ kind: "outro", equip: e, setorAtual: d.setores.find((s) => s.id === e.setor_id) });
        return;
      }
      const ja = conferidos.has(e.id);
      if (!ja) await conferir(e);
      feedback(true);
      setScan({ kind: "ok", equip: e, repetido: ja });
    } catch (err: any) {
      feedback(false); toast.error("Erro: " + err.message);
    } finally { busy.current = false; }
  }

  async function transferir() {
    if (scan?.kind !== "outro" || !d) return;
    const alvo = d.setores.find((s) => s.id === destino);
    const { error } = await db.from("equipamentos").update({ setor_id: destino, updated_at: new Date().toISOString() }).eq("id", scan.equip.id);
    if (error) return toast.error(error.message);
    await logHistorico(scan.equip.id, "Transferência", `De ${scan.setorAtual?.nome ?? "sem setor"} para ${alvo?.nome}`);
    const e = { ...scan.equip, setor_id: destino };
    if (destino === d.inv.setor_id) { await conferir(e, true); feedback(true); setScan({ kind: "ok", equip: e, repetido: false }); }
    else { toast.success(`Transferido para ${alvo?.nome}`); setScan(null); }
  }

  async function finalizar() {
    if (!confirm(`Finalizar o inventário? Faltam ${total - feitos} itens.`)) return;
    const { error } = await db.from("inventarios").update({ finalizado_em: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Inventário finalizado"); await q.refetch(); setRelatorio(true);
  }

  function exportar(kind: "csv" | "xlsx") {
    if (!d) return;
    const transf = new Set(d.itens.filter((i) => i.transferido).map((i) => i.equipamento_id));
    exportRows(d.equipamentos.map((e) => ({
      Tombamento: e.tombamento, Nome: e.nome, Usuário: e.usuario ?? "",
      Situação: conferidos.has(e.id) ? (transf.has(e.id) ? "Conferido (transferido)" : "Conferido") : "Faltante",
    })), `inventario-${setor?.sigla || setor?.nome || id}`, kind);
  }

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const completo = pct === 100 && total > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link to="/inventario" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Setores</Link>
        {finalizado ? <Button variant="outline" onClick={() => setRelatorio(true)}>Ver relatório</Button>
          : <Button variant="outline" onClick={finalizar}><Flag />Finalizar inventário</Button>}
      </div>

      <div className="sticky top-14 z-20 -mx-4 bg-background px-4 pb-3 pt-1 md:top-0 md:mx-0 md:px-0">
        <div className={`rounded-2xl border p-5 transition-colors ${completo ? "border-success bg-success-soft" : "bg-card"}`}>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0"><h1 className="truncate text-xl font-semibold md:text-2xl">{setor?.nome}</h1>
              <p className="text-sm text-muted-foreground">{finalizado ? `Finalizado em ${fmtDate(d!.inv.finalizado_em)}` : `Iniciado em ${fmtDate(d!.inv.iniciado_em)}`}</p></div>
            <div className="text-right"><div className={`text-4xl font-bold tabular-nums ${completo ? "text-success" : ""}`}>{pct}%</div>
              <div className="text-sm tabular-nums text-muted-foreground">{feitos} / {total}</div></div>
          </div>
          <div className="mt-3 h-5 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-all duration-500 ${completo ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
          {completo && <div className="mt-2 flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 size={16} />Todos os itens conferidos!</div>}
        </div>

        {!finalizado && (
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); processar(codigo); setCodigo(""); }}>
            <div className="relative flex-1"><ScanLine className="absolute left-3 top-3.5 text-muted-foreground" size={20} />
              <Input ref={inputRef} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Bipe ou digite o tombamento" className="h-12 pl-11 font-mono text-lg" inputMode="numeric" /></div>
            <Button type="button" size="lg" className="h-12" onClick={() => setCamera(true)}><Camera /><span className="hidden sm:inline">Escanear com a câmera</span></Button>
          </form>
        )}
      </div>

      {scan && <ScanCard scan={scan} setor={setor} setores={d!.setores} destino={destino} setDestino={setDestino}
        onTransfer={transferir} onCadastrar={(c) => setNovo({ tombamento: c, setor_id: d!.inv.setor_id, estado: "Bom" })} onClose={() => setScan(null)} />}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border bg-card p-1">
          {([["todos", "Todos"], ["ok", "Conferidos"], ["falta", "Faltando"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`rounded-lg px-4 py-2 text-sm ${filtro === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        <span className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-semibold text-warning-foreground">Faltam {total - feitos}</span>
      </div>

      <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card">
        {lista.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhum item.</li>}
        {lista.map((e) => {
          const ok = conferidos.has(e.id);
          return (
            <li key={e.id} className={`flex items-center gap-3 p-3 ${ok ? "bg-success-soft/60" : ""}`}>
              <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 ${ok ? "border-success bg-success text-success-foreground" : "border-pending"}`}>{ok && <Check size={18} strokeWidth={3} />}</div>
              <div className="min-w-0 flex-1"><div className="font-mono text-sm font-semibold">{e.tombamento}</div><div className="truncate text-sm text-muted-foreground">{e.nome}{e.usuario && ` · ${e.usuario}`}</div></div>
              {!ok && !finalizado && <Button size="sm" variant="ghost" onClick={() => processar(e.tombamento)}>Conferir</Button>}
            </li>
          );
        })}
      </ul>

      {camera && <CameraScanner onClose={() => setCamera(false)} onCode={(c) => { setCamera(false); processar(c); }} />}
      <EquipamentoDialog value={novo} setores={d!.setores} onClose={() => { setNovo(null); setScan(null); }} />

      <Dialog open={relatorio} onOpenChange={setRelatorio}>
        <DialogContent>
          <DialogHeader><DialogTitle>Relatório — {setor?.nome}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-success-soft p-3"><div className="text-2xl font-semibold">{feitos}</div><div className="text-xs">Conferidos</div></div>
            <div className="rounded-xl bg-destructive/10 p-3"><div className="text-2xl font-semibold">{total - feitos}</div><div className="text-xs">Faltantes</div></div>
            <div className="rounded-xl bg-warning-soft p-3"><div className="text-2xl font-semibold">{d!.itens.filter((i) => i.transferido).length}</div><div className="text-xs">Transferidos</div></div>
          </div>
          <div className="max-h-56 overflow-y-auto text-sm">
            <div className="mb-1 font-semibold">Faltantes</div>
            {d!.equipamentos.filter((e) => !conferidos.has(e.id)).map((e) => <div key={e.id} className="py-1"><span className="font-mono">{e.tombamento}</span> · {e.nome}</div>)}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => exportar("csv")}><Download />CSV</Button>
            <Button onClick={() => exportar("xlsx")}><Download />Excel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScanCard({ scan, setor, setores, destino, setDestino, onTransfer, onCadastrar, onClose }: {
  scan: Scan; setor?: Setor; setores: Setor[]; destino: string; setDestino: (v: string) => void;
  onTransfer: () => void; onCadastrar: (c: string) => void; onClose: () => void;
}) {
  const tone = scan.kind === "ok" ? "border-success bg-success-soft" : scan.kind === "outro" ? "border-warning bg-warning-soft" : "border-destructive bg-destructive/10";
  return (
    <div className={`relative mt-3 rounded-2xl border-2 p-4 animate-pop ${tone}`}>
      <button onClick={onClose} className="absolute right-3 top-3 text-muted-foreground" aria-label="Fechar"><X size={18} /></button>
      {scan.kind === "nao" ? (
        <div>
          <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle size={20} />Não cadastrado</div>
          <p className="mt-1 text-sm">O tombamento <span className="font-mono font-semibold">{scan.codigo}</span> não existe no sistema.</p>
          <Button className="mt-3" size="lg" onClick={() => onCadastrar(scan.codigo)}><PackagePlus />Cadastrar equipamento</Button>
        </div>
      ) : (
        <div>
          {scan.kind === "ok" ? (
            <div className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={20} />{scan.repetido ? "Já conferido anteriormente" : "Conferido!"}</div>
          ) : (
            <div className="flex items-center gap-2 font-semibold text-warning-foreground"><AlertTriangle size={20} />Este equipamento pertence ao setor {scan.setorAtual?.nome ?? "(sem setor)"}</div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Tombamento</div><div className="font-mono font-semibold">{scan.equip.tombamento}</div></div>
            <div><div className="text-xs text-muted-foreground">Nome</div><div className="font-medium">{scan.equip.nome}</div></div>
            <div><div className="text-xs text-muted-foreground">Setor</div><div className="font-medium">{scan.kind === "ok" ? setor?.nome : scan.setorAtual?.nome ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Usuário</div><div className="font-medium">{scan.equip.usuario || "—"}</div></div>
          </div>
          {scan.kind === "outro" && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-12 flex-1 rounded-md border border-input bg-card px-3 text-sm">
                {setores.map((s) => <option key={s.id} value={s.id}>{s.id === setor?.id ? `Este setor (${s.nome})` : s.nome}</option>)}
              </select>
              <Button size="lg" className="h-12" onClick={onTransfer}>{destino === setor?.id ? "Transferir para este setor" : "Transferir"}</Button>
            </div>
          )}
          <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Histórico do item</summary><div className="mt-2"><HistoricoList equipamentoId={scan.equip.id} /></div></details>
        </div>
      )}
    </div>
  );
}

function CameraScanner({ onClose, onCode }: { onClose: () => void; onCode: (c: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let scanner: any; let done = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("qr-reader");
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 160 } }, (text: string) => {
          if (done) return; done = true; onCode(text);
        }, () => {});
      } catch (e: any) { setErr(e?.message ?? String(e)); }
    })();
    return () => { if (scanner) scanner.stop().catch(() => {}).finally(() => scanner.clear?.()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Aponte para o código</DialogTitle></DialogHeader>
        <div id="qr-reader" className="w-full overflow-hidden rounded-xl bg-muted" />
        {err && <p className="text-sm text-destructive">Não foi possível abrir a câmera: {err}. Verifique a permissão do navegador.</p>}
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  );
}
