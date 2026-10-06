import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type Setor = { id: string; nome: string; sigla: string | null; responsavel: string | null; created_at: string };
export type Equipamento = {
  id: string; tombamento: string; nome: string; descricao: string | null; usuario: string | null;
  estado: string; setor_id: string | null; created_at: string; updated_at: string;
};
export type Inventario = { id: string; setor_id: string; iniciado_em: string; finalizado_em: string | null; criado_por: string | null };
export type InventarioItem = { id: string; inventario_id: string; equipamento_id: string; conferido_em: string; transferido: boolean };
export type Historico = { id: string; equipamento_id: string | null; acao: string; detalhes: string | null; usuario_email: string | null; created_at: string };

export const ESTADOS = ["Novo", "Bom", "Regular", "Ruim", "Inservível"];

const db = supabase as any;
export { db };

/** Subscribe to realtime changes on tables and invalidate query keys. */
export function useRealtime(tables: string[], keys: string[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`rt-${tables.join("-")}-${Math.random().toString(36).slice(2)}`);
    tables.forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      }),
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), JSON.stringify(keys)]);
}

export async function fetchAll<T>(table: string, order = "created_at", asc = true): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").order(order, { ascending: asc }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function logHistorico(equipamento_id: string | null, acao: string, detalhes?: string) {
  const { data } = await supabase.auth.getUser();
  await db.from("historico").insert({ equipamento_id, acao, detalhes: detalhes ?? null, usuario_email: data.user?.email ?? null });
}

export function exportRows(rows: Record<string, unknown>[], name: string, kind: "csv" | "xlsx") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, `${name}.${kind}`, { bookType: kind });
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function feedback(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ok ? 1200 : 300; o.type = ok ? "sine" : "square";
    g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
  } catch { /* ignore */ }
  try { navigator.vibrate?.(ok ? 80 : [100, 60, 100]); } catch { /* ignore */ }
}
