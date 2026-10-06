import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Controle de Patrimônio" },
      { name: "description", content: "Sistema de controle de patrimônio e inventário com leitura de tombamentos." },
      { property: "og:title", content: "Controle de Patrimônio" },
      { property: "og:description", content: "Sistema de controle de patrimônio e inventário com leitura de tombamentos." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  component: () => null,
});
