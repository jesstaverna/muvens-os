-- OAuth Meta/LinkedIn: metadados legíveis apenas por admin; segredos apenas no servidor.
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','linkedin')),
  remote_id text not null check (length(remote_id) between 1 and 120),
  display_name text not null,
  status text not null default 'connected' check (status in ('connected','error','expired')),
  last_sync_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,platform)
);
alter table public.social_connections enable row level security;
revoke all on public.social_connections from anon;
grant select,insert,update,delete on public.social_connections to authenticated;
grant all on public.social_connections to service_role;
drop policy if exists social_connections_admin on public.social_connections;
create policy social_connections_admin on public.social_connections for all to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));

-- Tabelas deliberadamente não expostas ao navegador, mesmo a usuários autenticados.
create table if not exists public.social_connection_secrets (
 connection_id uuid primary key references public.social_connections(id) on delete cascade,
 token_ciphertext text not null,
 expires_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.social_connection_secrets enable row level security;
revoke all on public.social_connection_secrets from PUBLIC,anon,authenticated;
grant all on public.social_connection_secrets to service_role;

create table if not exists public.social_oauth_pending (
 id uuid primary key default gen_random_uuid(),
 provider text not null check (provider in ('meta','linkedin')),
 created_by uuid not null references public.profiles(id) on delete cascade,
 token_ciphertext text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.social_oauth_pending enable row level security;
revoke all on public.social_oauth_pending from PUBLIC,anon,authenticated;
grant all on public.social_oauth_pending to service_role;
create index if not exists social_pending_expire_idx on public.social_oauth_pending(expires_at);

-- Não interpretar números indisponíveis como zeros reais; preservar a proveniência.
alter table public.social_period_metrics
 add column if not exists metric_flags jsonb not null default '{}'::jsonb;
alter table public.social_period_metrics
 add column if not exists last_synced_at timestamptz;
alter table public.social_post_metrics
 add column if not exists external_post_id text;
create unique index if not exists social_post_external_unique
 on public.social_post_metrics(client_id,platform,external_post_id);
