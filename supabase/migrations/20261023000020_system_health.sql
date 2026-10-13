-- MUVENS OS — 0020 Saúde do sistema: registro das execuções do agendador e função de verificação (só administradores)

create table if not exists public.worker_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null default true,
  result jsonb
);
create index if not exists worker_runs_ran_idx on public.worker_runs (ran_at desc);
alter table public.worker_runs enable row level security;
grant select on public.worker_runs to authenticated;
grant all on public.worker_runs to service_role;
revoke all on public.worker_runs from anon;
drop policy if exists worker_runs_select on public.worker_runs;
create policy worker_runs_select on public.worker_runs for select to authenticated using (app.has_role('admin'));

-- O que existe no banco (tabelas, colunas e gatilhos esperados). Só administradores.
create or replace function public.system_health() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not app.has_role('admin') and current_user <> 'service_role' then raise exception 'apenas administradores' using errcode = '42501'; end if;
  select jsonb_build_object(
    'm11_prospeccao', to_regclass('public.prospects') is not null,
    'm12_link_publico', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prospects' and column_name = 'report_token'),
    'm13_precos_visualizacoes', to_regclass('public.service_prices') is not null,
    'm14_pontuacao_landing', to_regprocedure('public.public_prospect_report(text)') is not null,
    'm15_novos_servicos', exists (select 1 from public.contract_templates where service_template = 'rd_marketing'),
    'm16_cadencia', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outreach_settings' and column_name = 'auto_approve_ready'),
    'm17_busca_semanal', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prospect_campaigns' and column_name = 'auto_weekly'),
    'm18_leads_anuncios', to_regclass('public.lead_qualifications') is not null,
    'm19_prospecto_crm', exists (select 1 from pg_trigger where tgname = 'trg_prospects_to_crm'),
    'm20_saude', true
  ) into r;
  return r;
end $$;
revoke execute on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated, service_role;
