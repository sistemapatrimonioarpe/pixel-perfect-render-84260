import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // 1. Configuração do Vite para permitir o host do ngrok
  vite: {
    server: {
      allowedHosts: [
        "leonor-unrummaged-larraine.ngrok-free.dev", // Adicione aqui o host exato que aparece no seu erro
        // Você pode adicionar outros hosts se precisar (ex: "outro-subdominio.ngrok-free.app")
      ],
    },
  },
  // 2. Configuração do TanStack Start (sua configuração original)
  tanstackStart: {
    server: { 
      entry: "server" 
    },
  },
});