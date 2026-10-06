create table public.setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  sigla text,
  responsavel text,
  created_at timestamptz not null default now()
);
create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  tombamento text not null unique,
  nome text not null,
  descricao text,
  usuario text,
  estado text not null default 'Bom',
  setor_id uuid references public.setores(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.inventarios (
  id uuid primary key default gen_random_uuid(),
  setor_id uuid not null references public.setores(id) on delete cascade,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  criado_por uuid
);
create table public.inventario_itens (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.inventarios(id) on delete cascade,
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  conferido_em timestamptz not null default now(),
  transferido boolean not null default false,
  unique (inventario_id, equipamento_id)
);
create table public.historico (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.equipamentos(id) on delete cascade,
  acao text not null,
  detalhes text,
  usuario_email text,
  created_at timestamptz not null default now()
);
create index on public.equipamentos(setor_id);
create index on public.historico(equipamento_id, created_at desc);

grant select, insert, update, delete on public.setores, public.equipamentos, public.inventarios, public.inventario_itens, public.historico to authenticated;
grant all on public.setores, public.equipamentos, public.inventarios, public.inventario_itens, public.historico to service_role;

alter table public.setores enable row level security;
alter table public.equipamentos enable row level security;
alter table public.inventarios enable row level security;
alter table public.inventario_itens enable row level security;
alter table public.historico enable row level security;

create policy "auth all" on public.setores for all to authenticated using (true) with check (true);
create policy "auth all" on public.equipamentos for all to authenticated using (true) with check (true);
create policy "auth all" on public.inventarios for all to authenticated using (true) with check (true);
create policy "auth all" on public.inventario_itens for all to authenticated using (true) with check (true);
create policy "auth all" on public.historico for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.setores, public.equipamentos, public.inventarios, public.inventario_itens, public.historico;