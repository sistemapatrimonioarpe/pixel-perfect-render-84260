import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Package } from "lucide-react";
import { fetchAll, useRealtime, type Equipamento, type Setor } from "@/lib/patrimonio";
import { ErrorBox, Loading } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({ meta: [{ title: "Mapa geral — Controle de Patrimônio" }, { name: "description", content: "Visão geral dos equipamentos por setor." }] }),
  component: Mapa,
});

type Item = { id: string; nome: string; n: number };
type Rect = Item & { x: number; y: number; w: number; h: number };

// Slice-and-dice alternating treemap (percent units)
function layout(items: Item[], x: number, y: number, w: number, h: number, vertical: boolean): Rect[] {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0]!, x, y, w, h }];
  const total = items.reduce((a, b) => a + b.n, 0);
  let acc = 0, i = 0;
  while (i < items.length - 1 && (acc + items[i]!.n) <= total / 2) acc += items[i++]!.n;
  if (i === 0) { acc = items[0]!.n; i = 1; }
  const f = acc / total;
  const a = items.slice(0, i), b = items.slice(i);
  return vertical
    ? [...layout(a, x, y, w * f, h, !vertical), ...layout(b, x + w * f, y, w * (1 - f), h, !vertical)]
    : [...layout(a, x, y, w, h * f, !vertical), ...layout(b, x, y + h * f, w, h * (1 - f), !vertical)];
}

const TONES = ["bg-primary", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-sidebar"];

function Mapa() {
  const navigate = useNavigate();
  useRealtime(["equipamentos", "setores"], [["mapa"]]);
  const q = useQuery({
    queryKey: ["mapa"],
    queryFn: async () => ({ eq: await fetchAll<Equipamento>("equipamentos", "tombamento"), se: await fetchAll<Setor>("setores", "nome") }),
  });
  if ((!q.data && !q.error)) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { eq, se } = q.data!;
  const cont = new Map<string, number>();
  eq.forEach((e) => e.setor_id && cont.set(e.setor_id, (cont.get(e.setor_id) ?? 0) + 1));
  const items = se.map((s) => ({ id: s.id, nome: s.sigla || s.nome, n: cont.get(s.id) ?? 0 })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n);
  const rects = layout(items, 0, 0, 100, 100, true);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Mapa geral</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-6"><Package className="text-primary" size={40} /><div><div className="text-4xl font-bold">{eq.length}</div><div className="text-sm text-muted-foreground">Equipamentos cadastrados</div></div></div>
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-6"><Building2 className="text-primary" size={40} /><div><div className="text-4xl font-bold">{se.length}</div><div className="text-sm text-muted-foreground">Setores</div></div></div>
      </div>
      {rects.length === 0 ? <p className="text-muted-foreground">Nenhum equipamento vinculado a setores ainda.</p> : (
        <div className="relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-2xl border bg-muted">
          {rects.map((r, i) => (
            <button key={r.id} onClick={() => navigate({ to: "/equipamentos", search: { setor: r.id } })}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
              className={`absolute flex flex-col items-center justify-center overflow-hidden border-2 border-background p-1 text-center text-primary-foreground transition hover:brightness-110 ${TONES[i % TONES.length]}`}>
              <span className="line-clamp-2 text-xs font-semibold sm:text-sm">{r.nome}</span>
              <span className="text-lg font-bold sm:text-2xl">{r.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
