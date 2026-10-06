# AGENTS.md
- Data access uses the browser Supabase client with realtime invalidation (`useRealtime` in src/lib/patrimonio.ts) — app requirement is live updates of lists/progress.
- All signed-in users share full access to patrimony tables (RLS: authenticated) — single-agency internal tool.
- Protected pages live under src/routes/_authenticated/; `/` redirects to dashboard or /auth.
