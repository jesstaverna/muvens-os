-- MUVENS OS | Diagnósticos consultivos (execução manual após revisão em homologação).
-- Antes de liberar a interface, aplicar em um ambiente Supabase de homologação e validar RLS.
create table if not exists public.digital_diagnostics (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(company_name) between 2 and 180),
  contact_name text,
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  scopes text[] not null default '{}' check (cardinality(scopes) between 1 and 7 and scopes <@ array['site','landing_page','identidade_visual','instagram','linkedin','trafego_pago','google_business']::text[]),
  links jsonb not null default '{}'::jsonb check (jsonb_typeof(links)='object'),
  context text,
  report jsonb,
  summary text,
  message text,
  status text not null default 'rascunho' check (status in ('rascunho','analisado','publicado')),
  report_token text unique check (report_token is null or report_token ~ '^[a-f0-9]{64}$'),
  analyzed_at timestamptz,
  published_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_diagnostics_publish_consistency check (status <> 'publicado' or (report is not null and report_token is not null and published_at is not null))
);
create index if not exists digital_diagnostics_created_idx on public.digital_diagnostics(created_at desc);
create index if not exists digital_diagnostics_client_idx on public.digital_diagnostics(client_id);
alter table public.digital_diagnostics enable row level security;
grant select, insert, update, delete on public.digital_diagnostics to authenticated;
grant all on public.digital_diagnostics to service_role;
revoke all on public.digital_diagnostics from anon;
drop policy if exists digital_diagnostics_staff on public.digital_diagnostics;
create policy digital_diagnostics_staff on public.digital_diagnostics
  for all to authenticated
  using (app.has_role('admin','comercial'))
  with check (app.has_role('admin','comercial'));

create table if not exists public.digital_diagnostic_assets (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.digital_diagnostics(id) on delete cascade,
  scope text not null check (scope in ('site','landing_page','identidade_visual','instagram','linkedin','trafego_pago','google_business')),
  storage_path text not null unique,
  file_name text not null,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now(),
  constraint path_report check (storage_path like (report_id::text || '/%'))
);
create index if not exists diagnostic_assets_report_idx on public.digital_diagnostic_assets(report_id);
alter table public.digital_diagnostic_assets enable row level security;
grant select, insert, update, delete on public.digital_diagnostic_assets to authenticated;
grant all on public.digital_diagnostic_assets to service_role;
revoke all on public.digital_diagnostic_assets from anon;
drop policy if exists diagnostic_assets_staff on public.digital_diagnostic_assets;
create policy diagnostic_assets_staff on public.digital_diagnostic_assets
  for all to authenticated
  using (app.has_role('admin','comercial'))
  with check (app.has_role('admin','comercial'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('diagnostic-evidence','diagnostic-evidence',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists diagnostic_storage_read on storage.objects;
drop policy if exists diagnostic_storage_insert on storage.objects;
drop policy if exists diagnostic_storage_update on storage.objects;
drop policy if exists diagnostic_storage_delete on storage.objects;
create policy diagnostic_storage_read on storage.objects for select to authenticated
  using (bucket_id='diagnostic-evidence' and app.has_role('admin','comercial'));
create policy diagnostic_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id='diagnostic-evidence' and app.has_role('admin','comercial'));
create policy diagnostic_storage_update on storage.objects for update to authenticated
  using (bucket_id='diagnostic-evidence' and app.has_role('admin','comercial'))
  with check (bucket_id='diagnostic-evidence' and app.has_role('admin','comercial'));
create policy diagnostic_storage_delete on storage.objects for delete to authenticated
  using (bucket_id='diagnostic-evidence' and app.has_role('admin','comercial'));
