import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Building2, ClipboardCheck, Landmark, LogOut, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Painel", icon: BarChart3 },
  { to: "/inventario", label: "Inventário", icon: ClipboardCheck },
  { to: "/equipamentos", label: "Equipamentos", icon: Package },
  { to: "/setores", label: "Setores", icon: Building2 },
] as const;

function Layout() {
  const { user } = Route.useRouteContext();
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
        </nav>
        <div className="border-t border-sidebar-border p-4 text-xs">
          <div className="truncate opacity-70">{user.email}</div>
          <button onClick={signOut} className="mt-2 flex items-center gap-2 hover:text-sidebar-primary"><LogOut size={14} />Sair</button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <div className="flex items-center gap-2 font-semibold"><Landmark size={18} />Patrimônio</div>
        <button onClick={signOut} aria-label="Sair" className="p-2"><LogOut size={18} /></button>
      </header>

      <main className="min-w-0 flex-1 p-4 pb-28 md:p-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
            activeProps={{ className: "text-primary font-semibold" }}>
            <n.icon size={22} />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
