import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, ClipboardCheck, Package } from "lucide-react";
import { db, fetchAll, fmtDate, useRealtime, type Equipamento, type Historico, type Inventario, type Setor } from "@/lib/patrimonio";
import { ErrorBox, Loading, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel — Controle de Patrimônio" }, { name: "description", content: "Resumo do patrimônio por setor, tipo e estado." }] }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--pending)"];

function Dashboard() {
  useRealtime(["equipamentos", "setores", "inventarios", "historico"], [["dash"]]);
  const q = useQuery({
    queryKey: ["dash"],
    queryFn: async () => {
      const [eq, se, inv, hist] = await Promise.all([
        fetchAll<Equipamento>("equipamentos"),
        fetchAll<Setor>("setores", "nome"),
        fetchAll<Inventario>("inventarios"),
        db.from("historico").select("*").order("created_at", { ascending: false }).limit(15),
      ]);
      if (hist.error) throw hist.error;
      return { eq, se, inv, hist: hist.data as Historico[] };
    },
  });

  const charts = useMemo(() => {
    if (!q.data) return null;
    const { eq, se } = q.data;
    const porSetor = se.map((s) => ({ nome: s.sigla || s.nome, qtd: eq.filter((e) => e.setor_id === s.id).length }))
      .sort((a, b) => b.qtd - a.qtd).slice(0, 12);
    const group = (k: (e: Equipamento) => string) => {
      const m = new Map<string, number>();
      eq.forEach((e) => m.set(k(e), (m.get(k(e)) ?? 0) + 1));
      const arr = [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      if (arr.length > 6) { const rest = arr.slice(5).reduce((s, x) => s + x.value, 0); return [...arr.slice(0, 5), { name: "Outros", value: rest }]; }
      return arr;
    };
    return { porSetor, tipo: group((e) => e.nome), estado: group((e) => e.estado) };
  }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { eq, se, inv, hist } = q.data!;
  const eqName = new Map(eq.map((e) => [e.id, `${e.tombamento} · ${e.nome}`]));

  return (
    <div>
      <PageHeader title="Painel" subtitle="Visão geral do patrimônio" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={Package} label="Equipamentos" value={eq.length} />
        <Stat icon={Building2} label="Setores" value={se.length} />
        <Stat icon={ClipboardCheck} label="Inventários em andamento" value={inv.filter((i) => !i.finalizado_em).length} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Equipamentos por setor" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts!.porSetor}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="nome" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip />
              <Bar dataKey="qtd" name="Quantidade" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Donut title="Por tipo" data={charts!.tipo} />
        <Donut title="Por estado" data={charts!.estado} />
      </div>

      <Panel title="Últimos movimentos" className="mt-6">
        {hist.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum movimento ainda.</p> : (
          <ul className="divide-y">
            {hist.map((h) => (
              <li key={h.id} className="py-3 text-sm">
                <div className="flex justify-between gap-2"><span className="font-medium">{h.acao}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtDate(h.created_at)}</span></div>
                <div className="text-muted-foreground">{h.equipamento_id ? eqName.get(h.equipamento_id) : ""} {h.detalhes && `— ${h.detalhes}`}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon /></div>
      <div><div className="text-3xl font-semibold tabular-nums">{value}</div><div className="text-sm text-muted-foreground">{label}</div></div>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border bg-card p-5 ${className}`}><h2 className="mb-4 font-semibold">{title}</h2>{children}</section>;
}

function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Panel title={title}>
      {data.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
