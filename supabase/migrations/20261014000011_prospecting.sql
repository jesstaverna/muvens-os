-- MUVENS OS — Prospecção (Fase 3 / estrutura): descoberta, análise, mensagens, envio de e-mail com salvaguardas.
-- Envio de e-mail DESLIGADO por padrão (sending_enabled=false) e exige identificação da empresa + link de descadastro.
-- Nenhum disparo automático de WhatsApp: o canal WhatsApp é "assistido" (uma pessoa clica em enviar).

create table public.outreach_settings (
  id int primary key default 1 check (id = 1),
  sender_name text, sender_email text, reply_to text,
  company_legal_name text, company_document text, company_address text,        -- identificação do remetente (obrigatória p/ enviar)
  daily_email_limit int not null default 30 check (daily_email_limit between 1 and 500),
  window_start_hour int not null default 9 check (window_start_hour between 0 and 23),
  window_end_hour int not null default 18 check (window_end_hour between 1 and 24),
  weekdays_only boolean not null default true,
  require_approval boolean not null default true,                                -- true = uma pessoa aprova cada mensagem
  sending_enabled boolean not null default false,
  followup_days int not null default 4 check (followup_days between 2 and 30),
  max_followups int not null default 1 check (max_followups between 0 and 3),
  updated_at timestamptz not null default now(),
  check (window_end_hour > window_start_hour)
);
insert into public.outreach_settings (id) values (1);
create trigger trg_outreach_settings_touch before update on public.outreach_settings for each row execute function app.touch_updated_at();
create trigger trg_outreach_settings_audit after update on public.outreach_settings for each row execute function app.audit();

create table public.prospect_campaigns (
  id uuid primary key default gen_random_uuid(), name text not null, niche text not null, city text not null,
  status text not null default 'ativa' check (status in ('ativa','pausada','encerrada')),
  max_results int not null default 20 check (max_results between 1 and 60),
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.prospect_campaigns(id) on delete set null,
  source text not null default 'manual' check (source in ('google_maps','manual')),
  place_id text,
  name text not null, category text, address text, phone text, website text, website_domain text, email text,
  rating numeric(2,1), reviews_count int, maps_url text, google_fetched_at timestamptz,
  status text not null default 'novo' check (status in ('novo','analisado','aprovado','contatado','respondeu','descartado','convertido')),
  score int check (score between 0 and 100), recommended_service text, analysis jsonb, analyzed_at timestamptz, analysis_error text,
  lead_id uuid references public.leads(id) on delete set null,
  legal_basis text not null default 'legitimo_interesse',
  unsub_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  notes text, created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index prospects_place_uidx on public.prospects (place_id) where place_id is not null;
create unique index prospects_email_uidx on public.prospects (lower(email)) where email is not null;
create unique index prospects_domain_uidx on public.prospects (website_domain) where website_domain is not null;
create index prospects_status_idx on public.prospects (status, score desc);
create index prospects_campaign_idx on public.prospects (campaign_id);
create trigger trg_prospects_touch before update on public.prospects for each row execute function app.touch_updated_at();
create trigger trg_prospects_audit after insert or update or delete on public.prospects for each row execute function app.audit();

create or replace function app.prospects_before() returns trigger language plpgsql as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  if new.website is not null and btrim(new.website) <> '' then
    new.website := btrim(new.website);
    new.website_domain := lower(regexp_replace(regexp_replace(new.website, '^https?://', '', 'i'), '^www\.|[/?#].*$', '', 'gi'));
    if new.website_domain = '' then new.website_domain := null; end if;
  else new.website := null; new.website_domain := null; end if;
  return new;
end $$;
create trigger trg_prospects_before before insert or update on public.prospects for each row execute function app.prospects_before();

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp_manual')),
  step int not null default 1 check (step between 1 and 4),
  subject text, body text not null,
  status text not null default 'rascunho' check (status in ('rascunho','aprovada','enviando','enviada','falhou','cancelada')),
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  sent_at timestamptz, provider_id text, error text,
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create unique index outreach_one_per_step on public.outreach_messages (prospect_id, channel, step) where status <> 'cancelada';
create index outreach_status_idx on public.outreach_messages (status, created_at);
create trigger trg_outreach_audit after insert or update on public.outreach_messages for each row execute function app.audit();

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(), email text, domain text, phone text,
  source text not null default 'manual' check (source in ('descadastro','manual','bounce','reclamacao')), note text,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null or phone is not null)
);
create unique index suppression_email_uidx on public.suppression_list (lower(email)) where email is not null;
create unique index suppression_domain_uidx on public.suppression_list (lower(domain)) where domain is not null;

-- ---------- descadastro público (anon) ----------
create or replace function public.unsubscribe_prospect(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.prospects;
begin
  select * into p from public.prospects where unsub_token = p_token;
  if not found then return false; end if;
  if p.email is not null then insert into public.suppression_list (email, source) values (p.email, 'descadastro') on conflict do nothing; end if;
  if p.website_domain is not null then insert into public.suppression_list (domain, source, note) values (p.website_domain, 'descadastro', 'descadastro de ' || coalesce(p.email, 'prospecto')) on conflict do nothing; end if;
  update public.prospects set status = 'descartado' where id = p.id and status <> 'convertido';
  update public.outreach_messages set status = 'cancelada' where prospect_id = p.id and status in ('rascunho','aprovada');
  return true;
end $$;

-- ---------- envio: seleção atômica com todas as salvaguardas (só service role) ----------
create or replace function public.claim_outreach(p_limit int default 10) returns table (id uuid, prospect_id uuid, to_email text, subject text, body text, unsub_token text, step int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare s public.outreach_settings; v_now timestamp := (now() at time zone 'America/Sao_Paulo'); v_sent int; v_room int;
begin
  select * into s from public.outreach_settings where id = 1;
  if not s.sending_enabled then return; end if;
  if s.sender_name is null or s.sender_email is null or s.company_legal_name is null or s.company_address is null then return; end if;     -- identificação obrigatória
  if extract(hour from v_now) < s.window_start_hour or extract(hour from v_now) >= s.window_end_hour then return; end if;
  if s.weekdays_only and extract(isodow from v_now) in (6, 7) then return; end if;
  select count(*) into v_sent from public.outreach_messages m where m.channel = 'email' and m.status in ('enviada','enviando') and m.sent_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_room := least(p_limit, s.daily_email_limit - v_sent);
  if v_room <= 0 then return; end if;
  return query
  with next as (
    select m.id from public.outreach_messages m join public.prospects p on p.id = m.prospect_id
     where m.channel = 'email' and m.status = 'aprovada' and p.email is not null
       and p.status not in ('descartado','respondeu','convertido')
       and not exists (select 1 from public.suppression_list sl where lower(sl.email) = p.email or lower(sl.domain) = p.website_domain)
     order by m.approved_at nulls last, m.created_at limit v_room for update of m skip locked)
  update public.outreach_messages m set status = 'enviando', sent_at = now() from next n, public.prospects p
   where m.id = n.id and p.id = m.prospect_id
  returning m.id, m.prospect_id, p.email, m.subject, m.body, p.unsub_token, m.step;
end $$;

create or replace function public.finish_outreach(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_prospect uuid;
begin
  if p_ok then
    update public.outreach_messages set status = 'enviada', provider_id = p_provider_id, error = null where id = p_id returning prospect_id into v_prospect;
    update public.prospects set status = 'contatado' where id = v_prospect and status in ('novo','analisado','aprovado');
  else
    update public.outreach_messages set status = 'falhou', error = left(p_error, 1000), sent_at = null where id = p_id;
  end if;
end $$;

-- Candidatos a follow-up: mensagem enviada há >= followup_days, sem resposta, ainda sem o próximo passo.
create or replace function public.followup_candidates() returns table (prospect_id uuid, next_step int)
language sql stable security definer set search_path = public as $$
  select p.id, m.step + 1 from public.outreach_messages m join public.prospects p on p.id = m.prospect_id, public.outreach_settings s
   where s.id = 1 and m.channel = 'email' and m.status = 'enviada' and p.status = 'contatado' and p.email is not null
     and m.step = (select max(x.step) from public.outreach_messages x where x.prospect_id = p.id and x.channel = 'email' and x.status = 'enviada')
     and m.step <= s.max_followups and m.sent_at < now() - (s.followup_days || ' days')::interval
     and not exists (select 1 from public.outreach_messages y where y.prospect_id = p.id and y.channel = 'email' and y.step = m.step + 1 and y.status <> 'cancelada')
     and not exists (select 1 from public.suppression_list sl where lower(sl.email) = p.email or lower(sl.domain) = p.website_domain)
$$;

-- Retenção conservadora dos dados vindos do Google (cache de até 30 dias) para prospectos ainda não trabalhados.
create or replace function public.run_prospect_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.prospects set address = null, phone = null, website = null, rating = null, reviews_count = null, maps_url = null
   where source = 'google_maps' and status in ('novo','descartado') and google_fetched_at < now() - interval '30 days'
     and (address is not null or phone is not null or website is not null or maps_url is not null);
  get diagnostics n = row_count;
  return jsonb_build_object('purged_google_snapshots', n);
end $$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['outreach_settings','prospect_campaigns','prospects','outreach_messages','suppression_list'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy settings_select on public.outreach_settings for select to authenticated using (app.has_role('admin','comercial'));
create policy settings_update on public.outreach_settings for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create policy campaigns_all on public.prospect_campaigns for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy prospects_all on public.prospects for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy outreach_all on public.outreach_messages for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy suppression_all on public.suppression_list for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));

revoke execute on function public.unsubscribe_prospect(text), public.claim_outreach(int), public.finish_outreach(uuid, boolean, text, text), public.followup_candidates(), public.run_prospect_scans() from public, anon;
grant execute on function public.unsubscribe_prospect(text) to anon, authenticated;
grant execute on function public.claim_outreach(int), public.finish_outreach(uuid, boolean, text, text), public.followup_candidates(), public.run_prospect_scans() to service_role;
