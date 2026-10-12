-- MUVENS OS — 0017 Campanhas recorrentes: repetir a busca no Google Maps toda semana
alter table public.prospect_campaigns
  add column if not exists auto_weekly boolean not null default false,
  add column if not exists last_auto_run_at timestamptz;
