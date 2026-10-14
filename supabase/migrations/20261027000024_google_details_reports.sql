-- MUVENS OS — 0024 Detalhes do perfil do Google (fotos, horários) e relatório mensal do Google Meu Negócio por cliente

alter table public.prospects add column if not exists google_details jsonb;

create or replace function public.public_prospect_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'category', p.category, 'website', p.website, 'rating', p.rating, 'reviews_count', p.reviews_count,
    'score', coalesce((p.analysis->>'need_score')::int, p.score), 'recommended_service', p.recommended_service, 'analyzed_at', p.analyzed_at,
    'site', p.analysis->'site', 'observations', coalesce(p.analysis->'observations', '[]'::jsonb),
    'from_google', (p.source = 'google_maps'), 'has_phone', (p.phone is not null and btrim(p.phone) <> ''), 'google_details', p.google_details,
    'prices', coalesce((select jsonb_object_agg(s.service, jsonb_build_object('from', s.price_from, 'unit', s.unit)) from public.service_prices s), '{}'::jsonb))
  from public.prospects p
  where p.report_token = p_token and p.analyzed_at is not null and p.analysis is not null and p.status <> 'descartado'
$$;

create table if not exists public.gmn_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),   -- 1º dia do mês
  metrics jsonb not null default '{}'::jsonb,
  highlights text, next_steps text,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (client_id, period)
);
alter table public.gmn_reports enable row level security;
grant select, insert, update, delete on public.gmn_reports to authenticated;
grant all on public.gmn_reports to service_role;
revoke all on public.gmn_reports from anon;
drop policy if exists gmn_reports_all on public.gmn_reports;
create policy gmn_reports_all on public.gmn_reports for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
drop trigger if exists trg_gmn_reports_touch on public.gmn_reports;
create trigger trg_gmn_reports_touch before update on public.gmn_reports for each row execute function app.touch_updated_at();
drop trigger if exists trg_gmn_reports_audit on public.gmn_reports;
create trigger trg_gmn_reports_audit after insert or update or delete on public.gmn_reports for each row execute function app.audit();

-- Relatório público (link com token): dados do mês e do mês anterior para comparação. Não expõe contatos do cliente.
create or replace function public.public_gmn_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('client', c.name, 'period', r.period, 'metrics', r.metrics, 'highlights', r.highlights, 'next_steps', r.next_steps,
    'previous', (select pr.metrics from public.gmn_reports pr where pr.client_id = r.client_id and pr.period = (r.period - interval '1 month')::date))
  from public.gmn_reports r join public.clients c on c.id = r.client_id
  where r.token = p_token
$$;
revoke execute on function public.public_gmn_report(text) from public;
grant execute on function public.public_gmn_report(text) to anon, authenticated;
