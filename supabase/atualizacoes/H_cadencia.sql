-- MUVENS OS — 0016 Cadência: e-mail primeiro, WhatsApp assistido depois; aprovação automática de quem tem e-mail E WhatsApp (opcional)
alter table public.outreach_settings
  add column if not exists auto_approve_ready boolean not null default false,
  add column if not exists auto_approve_min_score int not null default 0 check (auto_approve_min_score between 0 and 100),
  add column if not exists whatsapp_after_days int not null default 3 check (whatsapp_after_days between 1 and 30);
