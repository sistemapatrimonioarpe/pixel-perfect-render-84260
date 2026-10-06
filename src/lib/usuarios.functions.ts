import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const loginToEmail = (login: string) => `${login.trim().toLowerCase()}@arpe.local`;

const loginSchema = z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado");
const senhaSchema = z.string().min(6, "A senha precisa de ao menos 6 caracteres").max(72);
const roleSchema = z.enum(["admin", "usuario"]);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("id").eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Apenas administradores podem fazer isso");
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function criar(login: string, nome: string, senha: string, role: "admin" | "usuario") {
  const sb = await admin();
  const { data, error } = await sb.auth.admin.createUser({ email: loginToEmail(login), password: senha, email_confirm: true });
  if (error) throw new Error(error.message.includes("already") ? "Este login já existe" : error.message);
  const id = data.user.id;
  const p = await sb.from("perfis").insert({ id, login: login.trim().toLowerCase(), nome, ativo: true });
  if (p.error) { await sb.auth.admin.deleteUser(id); throw new Error(p.error.message); }
  await sb.from("user_roles").insert({ user_id: id, role });
  return { id };
}

export const existeAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return { existe: (count ?? 0) > 0 };
});

export const criarPrimeiroAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ login: loginSchema, nome: z.string().trim().min(1).max(100), senha: senhaSchema }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Já existe um administrador");
    return criar(data.login, data.nome, data.senha, "admin");
  });

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [p, r] = await Promise.all([
      context.supabase.from("perfis").select("*").order("login"),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (p.error) throw new Error(p.error.message);
    const admins = new Set((r.data ?? []).filter((x: any) => x.role === "admin").map((x: any) => x.user_id));
    return (p.data ?? []).map((u: any) => ({ id: u.id as string, login: u.login as string, nome: u.nome as string, ativo: u.ativo as boolean, role: (admins.has(u.id) ? "admin" : "usuario") as "admin" | "usuario" }));
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ login: loginSchema, nome: z.string().trim().min(1).max(100), senha: senhaSchema, role: roleSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return criar(data.login, data.nome, data.senha, data.role);
  });

export const editarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), nome: z.string().trim().min(1).max(100), role: roleSchema, ativo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId && (!data.ativo || data.role !== "admin")) throw new Error("Você não pode desativar nem remover o seu próprio acesso de administrador");
    const sb = await admin();
    const { error } = await sb.from("perfis").update({ nome: data.nome, ativo: data.ativo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await sb.from("user_roles").delete().eq("user_id", data.id);
    await sb.from("user_roles").insert({ user_id: data.id, role: data.role });
    await sb.auth.admin.updateUserById(data.id, { ban_duration: data.ativo ? "none" : "876000h" });
    return { ok: true };
  });

export const resetarSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), senha: senhaSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.auth.admin.updateUserById(data.id, { password: data.senha });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
