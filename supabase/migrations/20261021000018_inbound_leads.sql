-- MUVENS OS — 0018 Leads de anúncios (Instagram/Facebook Ads, formulários) e qualificação por perguntas

alter table public.prospects drop constraint if exists prospects_source_check;
alter table public.prospects add constraint prospects_source_check check (source in ('google_maps','manual','inbound'));

create table public.lead_qualifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status text not null default 'pendente' check (status in ('pendente','respondido')),
  answers jsonb, score int check (score between 0 and 100), fit text check (fit in ('quente','morno','frio')),
  services text[] not null default '{}',
  answered_at timestamptz, created_at timestamptz not null default now()
);
alter table public.lead_qualifications enable row level security;
grant select, insert, update, delete on public.lead_qualifications to authenticated;
grant all on public.lead_qualifications to service_role;
revoke all on public.lead_qualifications from anon;
create policy lead_qualifications_all on public.lead_qualifications for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create trigger trg_lead_qualifications_audit after insert or update or delete on public.lead_qualifications for each row execute function app.audit();
