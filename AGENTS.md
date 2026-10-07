# AGENTS.md
- Data access uses the browser Supabase client with realtime invalidation (`useRealtime` in src/lib/patrimonio.ts) — app requirement is live updates of lists/progress.
- All signed-in users share full access to patrimony tables (RLS: authenticated) — single-agency internal tool.
- Protected pages live under src/routes/_authenticated/; `/` redirects to dashboard or /auth.
- Admin user management (create/edit/reset password) runs in createServerFn handlers in src/lib/usuarios.functions.ts using the service client after checking the caller's admin row — never service keys in the browser; Edge Functions are not used.
- Login is username-based: username maps to a synthetic `<login>@arpe.local` email; profiles live in `perfis`, roles in `user_roles` (never on the profile).
- Barcode scanning goes through src/lib/barcode.ts (native BarcodeDetector, then zxing fallback); lookups use the generated `tombamento_normalizado` column.
