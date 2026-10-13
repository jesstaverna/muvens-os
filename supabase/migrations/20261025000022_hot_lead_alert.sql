-- MUVENS OS — 0022 Alerta por e-mail quando um lead quente responde à qualificação
alter table public.outreach_settings
  add column if not exists alert_hot_enabled boolean not null default false,
  add column if not exists alert_to text;

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
    'm20_saude', true,
    'm21_resumo_email', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outreach_settings' and column_name = 'weekly_digest_enabled'),
    'm22_alerta_lead_quente', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outreach_settings' and column_name = 'alert_hot_enabled')
  ) into r;
  return r;
end $$;
