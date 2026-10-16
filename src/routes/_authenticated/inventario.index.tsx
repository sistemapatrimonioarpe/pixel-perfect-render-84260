import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Play, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db, fetchAll, fmtDate, useRealtime, type Equipamento, type Inventario, type InventarioItem, type Setor } from "@/lib/patrimonio";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/inventario/")({
  head: () => ({ meta: [{ title: "Inventário — Controle de Patrimônio" }, { name: "description", content: "Inicie ou continue o inventário de cada setor." }] }),
  component: InventarioHome,
});

function InventarioHome() {
  useRealtime(["setores", "inventarios", "inventario_itens", "equipamentos"], [["inv-home"]]);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["inv-home"],
    queryFn: async () => ({
      se: await fetchAll<Setor>("setores", "nome"),
      inv: await fetchAll<Inventario>("inventarios", "iniciado_em", false),
      eq: await fetchAll<Equipamento>("equipamentos"),
      itens: await fetchAll<InventarioItem>("inventario_itens", "conferido_em"),
    }),
  });

  async function start(s: Setor, aberto?: Inventario) {
    if (aberto) return void navigate({ to: "/inventario/$id", params: { id: aberto.id } });
    setBusy(s.id);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await db.from("inventarios").insert({ setor_id: s.id, criado_por: u.user?.id }).select().single();
    setBusy(null);
    if (error) return void toast.error(error.message);
    navigate({ to: "/inventario/$id", params: { id: data.id } });
  }

  return (
    <div>
      <PageHeader title="Inventário" subtitle="Escolha um setor para conferir os bens" />
      {(!q.data && !q.error) ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : q.data!.se.length === 0 ? <Empty>Cadastre setores para iniciar um inventário.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.se.map((s) => {
            const aberto = q.data!.inv.find((i) => i.setor_id === s.id && !i.finalizado_em);
            const ultimo = q.data!.inv.find((i) => i.setor_id === s.id && i.finalizado_em);
            const total = q.data!.eq.filter((e) => e.setor_id === s.id).length;
            const feitos = aberto ? q.data!.itens.filter((i) => i.inventario_id === aberto.id).length : 0;
            const pct = total ? Math.round((feitos / total) * 100) : 0;
            return (
              <div key={s.id} className="flex flex-col rounded-2xl border bg-card p-5">
                <div className="font-semibold">{s.nome}</div>
                <div className="text-sm text-muted-foreground">{total} equipamentos{ultimo && ` · último: ${fmtDate(ultimo.finalizado_em)}`}</div>
                {aberto && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-warning-foreground">Em andamento</span><span>{feitos}/{total} · {pct}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                <Button size="lg" className="mt-4 h-12" variant={aberto ? "secondary" : "default"} disabled={busy === s.id} onClick={() => start(s, aberto)}>
                  {aberto ? <><RotateCw />Continuar inventário</> : <><Play />Iniciar inventário</>}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
