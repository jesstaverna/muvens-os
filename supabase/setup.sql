-- MUVENS OS — setup completo para projeto NOVO (migrações concatenadas). Cole no SQL Editor e Run. Execute UMA vez, em projeto vazio. Projeto que já tem as tabelas: rode apenas as migrações novas.

-- ======== 20261009000001_foundation.sql ========
-- MUVENS OS — 0001 Fundação: perfis, papéis, helpers, auditoria, fila de jobs, notificações
-- Convenções: texto + CHECK no lugar de ENUM (evolução mais simples); datas de negócio em America/Sao_Paulo.

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------- helpers genéricos ----------
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function app.br_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'America/Sao_Paulo')::date $$;

create or replace function app.norm_phone(p text) returns text language sql immutable as $$
  select case
    when p is null then null
    else nullif(
      case
        when length(regexp_replace(p, '\D', '', 'g')) in (12, 13) and regexp_replace(p, '\D', '', 'g') like '55%'
          then substr(regexp_replace(p, '\D', '', 'g'), 3)
        else regexp_replace(p, '\D', '', 'g')
      end, '')
  end
$$;

create or replace function app.norm_email(e text) returns text language sql immutable as $$
  select nullif(lower(btrim(e)), '')
$$;

-- ---------- perfis ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        text not null default 'cliente'
              check (role in ('admin','comercial','financeiro','designer','trafego','cliente')),
  client_id   uuid,                         -- FK adicionada na 0003 (usuários do portal do cliente)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create or replace function app.user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function app.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.user_role() = any (roles), false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.user_role() in ('admin','comercial','financeiro','designer','trafego'), false)
$$;

create or replace function app.current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and active and role = 'cliente'
$$;

-- Primeiro usuário vira admin; os demais entram como 'cliente' SEM client_id (sem acesso a nada)
-- até um admin atribuir o papel. Recomenda-se desativar signup público no Supabase.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7000001);
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'cliente' else 'admin' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Impede escalada de privilégio: só admin (ou service role / SQL direto) altera papel, vínculo e ativação.
create or replace function app.guard_profile() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and not app.has_role('admin') then
    if new.role is distinct from old.role
       or new.client_id is distinct from old.client_id
       or new.active is distinct from old.active
       or new.id is distinct from old.id then
      raise exception 'Apenas administradores podem alterar papel, vínculo ou status do usuário' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function app.guard_profile();

-- ---------- auditoria ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  actor_id    uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := to_jsonb(coalesce(new, old));
  insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
  values (tg_table_name, rec->>'id', tg_op, auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger trg_profiles_audit after insert or update or delete on public.profiles
  for each row execute function app.audit();

-- ---------- fila de jobs (automações 24/7) ----------
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending','running','done','failed','dead')),
  attempts      int  not null default 0,
  max_attempts  int  not null default 5,
  run_at        timestamptz not null default now(),
  locked_at     timestamptz,
  finished_at   timestamptz,
  last_error    text,
  dedupe_key    text,
  created_at    timestamptz not null default now()
);
create unique index jobs_dedupe_idx on public.jobs (dedupe_key) where dedupe_key is not null and status in ('pending','running');
create index jobs_claim_idx on public.jobs (run_at) where status in ('pending','failed');

-- Reivindica jobs de forma atômica (vários workers concorrentes sem duplicar). Também recupera
-- jobs "running" travados há mais de 10 minutos (worker caiu no meio).
create or replace function public.claim_jobs(p_limit int default 10) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with next as (
    select id from public.jobs
    where (status in ('pending','failed') and run_at <= now())
       or (status = 'running' and locked_at < now() - interval '10 minutes')
    order by run_at
    limit p_limit
    for update skip locked
  )
  update public.jobs j
     set status = 'running', locked_at = now(), attempts = j.attempts + 1
    from next where j.id = next.id
  returning j.*;
end $$;

create or replace function public.finish_job(p_id uuid, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_error is null then
    update public.jobs set status = 'done', finished_at = now(), last_error = null, locked_at = null where id = p_id;
  else
    update public.jobs
       set last_error = left(p_error, 2000), locked_at = null,
           status = case when attempts >= max_attempts then 'dead' else 'failed' end,
           finished_at = case when attempts >= max_attempts then now() end,
           -- backoff exponencial: 1, 2, 4, 8... minutos
           run_at = now() + (power(2, greatest(attempts - 1, 0)) || ' minutes')::interval
     where id = p_id;
  end if;
end $$;

-- Enfileira se não existir job equivalente pendente (idempotente).
create or replace function app.enqueue_job(p_type text, p_payload jsonb default '{}', p_run_at timestamptz default now(), p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.jobs (type, payload, run_at, dedupe_key) values (p_type, p_payload, p_run_at, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('pending','running') do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------- notificações / alertas ----------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,  -- null = todos da equipe
  audience    text check (audience in ('admin','comercial','financeiro','designer','trafego')), -- null = qualquer staff
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  title       text not null,
  body        text,
  link        text,
  dedupe_key  text unique,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function app.notify(p_title text, p_body text, p_link text, p_severity text default 'info',
                                      p_audience text default null, p_user uuid default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (title, body, link, severity, audience, user_id, dedupe_key)
  values (p_title, p_body, p_link, p_severity, p_audience, p_user, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

-- ======== 20261009000002_clients_crm.sql ========
-- MUVENS OS — 0002 Clientes e CRM

-- ---------- clientes ----------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  legal_name   text,
  document     text,                       -- CNPJ/CPF
  email        text,
  phone        text,
  segment      text,
  website      text,
  address      text,
  status       text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index clients_document_uidx on public.clients (regexp_replace(document, '\D', '', 'g')) where document is not null and document <> '';
create index clients_name_idx on public.clients (lower(name));
create trigger trg_clients_touch before update on public.clients for each row execute function app.touch_updated_at();
create trigger trg_clients_audit after insert or update or delete on public.clients for each row execute function app.audit();

alter table public.profiles add constraint profiles_client_fk foreign key (client_id) references public.clients(id) on delete set null;

create table public.client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null,
  role_title text,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index client_contacts_client_idx on public.client_contacts (client_id);

-- Serviços contratados (fonte de MRR). Em produção é alimentado pela ativação a partir da proposta aceita
-- (e, na Fase 2, pelo contrato assinado).
create table public.client_services (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  proposal_id  uuid,                       -- FK na 0003
  service      text not null,
  billing      text not null default 'mensal' check (billing in ('mensal','pontual')),
  value        numeric(14,2) not null check (value >= 0),
  starts_on    date not null default current_date,
  ends_on      date,
  status       text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index client_services_client_idx on public.client_services (client_id, status);
create trigger trg_client_services_touch before update on public.client_services for each row execute function app.touch_updated_at();
create trigger trg_client_services_audit after insert or update or delete on public.client_services for each row execute function app.audit();

-- ---------- CRM ----------
create table public.pipeline_stages (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  position       int  not null,
  kind           text not null default 'open' check (kind in ('open','won','lost')),
  probability    int  not null default 0 check (probability between 0 and 100),  -- estimativa editável, usada em previsões
  is_negotiation boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create unique index pipeline_stages_position_uidx on public.pipeline_stages (position) where active;

insert into public.pipeline_stages (name, position, kind, probability, is_negotiation) values
  ('Novo Lead',               1, 'open',  5,  false),
  ('Primeiro Contato',        2, 'open',  10, false),
  ('Qualificação',            3, 'open',  20, false),
  ('Reunião',                 4, 'open',  35, false),
  ('Proposta em Elaboração',  5, 'open',  45, false),
  ('Proposta Enviada',        6, 'open',  55, false),
  ('Em Negociação',           7, 'open',  70, true),
  ('Fechado',                 8, 'won',   100, false),
  ('Não Fechado',             9, 'lost',  0,  false);

create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  company               text,
  phone                 text,
  whatsapp              text,
  email                 text,
  email_norm            text,
  phone_norm            text,
  segment               text,
  source                text,                 -- origem do lead
  service_interest      text,
  estimated_investment  numeric(14,2) check (estimated_investment is null or estimated_investment >= 0),
  potential_value       numeric(14,2) not null default 0 check (potential_value >= 0),
  owner_id              uuid references public.profiles(id) on delete set null,
  stage_id              uuid not null references public.pipeline_stages(id),
  client_id             uuid references public.clients(id) on delete set null,
  lost_reason           text,
  notes                 text,
  next_action           text,
  next_action_at        timestamptz,
  last_contact_at       timestamptz,
  stage_changed_at      timestamptz not null default now(),
  closed_at             timestamptz,
  external_ref          jsonb not null default '{}'::jsonb,   -- ids RD Station / RD Conversas (Fase 3)
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (email is not null or phone is not null or whatsapp is not null)
);
-- Anti-duplicidade: mesmo e-mail ou mesmo telefone normalizado não entram duas vezes.
create unique index leads_email_uidx on public.leads (email_norm) where email_norm is not null;
create unique index leads_phone_uidx on public.leads (phone_norm) where phone_norm is not null;
create index leads_stage_idx on public.leads (stage_id);
create index leads_owner_idx on public.leads (owner_id);
create index leads_created_idx on public.leads (created_at desc);

create or replace function app.leads_before() returns trigger language plpgsql as $$
declare v_kind text;
begin
  new.email_norm := app.norm_email(new.email);
  new.phone_norm := app.norm_phone(coalesce(nullif(new.whatsapp, ''), nullif(new.phone, '')));

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    select kind into v_kind from public.pipeline_stages where id = new.stage_id;
    new.stage_changed_at := now();
    if v_kind = 'lost' and coalesce(btrim(new.lost_reason), '') = '' then
      raise exception 'Informe o motivo da perda para mover o lead para "Não Fechado"' using errcode = '23514';
    end if;
    new.closed_at := case when v_kind in ('won','lost') then now() else null end;
    if v_kind <> 'lost' then new.lost_reason := null; end if;
  end if;
  return new;
end $$;
create trigger trg_leads_before before insert or update on public.leads for each row execute function app.leads_before();
create trigger trg_leads_touch before update on public.leads for each row execute function app.touch_updated_at();
create trigger trg_leads_audit after insert or update or delete on public.leads for each row execute function app.audit();

-- Novo lead → job (notifica responsável / dispara automações)
create or replace function app.leads_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.enqueue_job('lead.created', jsonb_build_object('lead_id', new.id), now(), 'lead.created:' || new.id);
  return new;
end $$;
create trigger trg_leads_after_insert after insert on public.leads for each row execute function app.leads_after_insert();

create table public.lead_interactions (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  kind       text not null default 'nota' check (kind in ('nota','ligacao','whatsapp','email','reuniao','sistema')),
  content    text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index lead_interactions_lead_idx on public.lead_interactions (lead_id, created_at desc);

create or replace function app.interaction_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('ligacao','whatsapp','email','reuniao') then
    update public.leads set last_contact_at = new.created_at where id = new.lead_id;
  end if;
  return new;
end $$;
create trigger trg_interaction_after after insert on public.lead_interactions for each row execute function app.interaction_after();

create table public.lead_reminders (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  title      text not null,
  due_at     timestamptz not null,
  done_at    timestamptz,
  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index lead_reminders_due_idx on public.lead_reminders (due_at) where done_at is null;

-- ======== 20261009000003_proposals.sql ========
-- MUVENS OS — 0003 Propostas comerciais (landing pages com link exclusivo)

create sequence public.proposal_number_seq;

create table public.proposals (
  id                       uuid primary key default gen_random_uuid(),
  number                   int  not null default nextval('public.proposal_number_seq') unique,
  token                    text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  title                    text not null,
  template                 text not null default 'personalizado'
                           check (template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','personalizado')),
  status                   text not null default 'rascunho'
                           check (status in ('rascunho','enviada','visualizada','em_negociacao','aceita','recusada','expirada')),
  lead_id                  uuid references public.leads(id) on delete set null,
  client_id                uuid references public.clients(id) on delete set null,
  client_display_name      text not null default '',
  content                  jsonb not null default '{}'::jsonb,   -- seções: diagnóstico, objetivos, solução, escopo, entregáveis, etapas, cronograma
  payment_terms            text not null default '',
  installments             int  not null default 1 check (installments between 1 and 60),
  contract_months          int  not null default 12 check (contract_months between 1 and 120),
  valid_until              date,
  discount_value           numeric(14,2) not null default 0 check (discount_value >= 0),
  discount_authorized_by   uuid references public.profiles(id),
  subtotal_one_time        numeric(14,2) not null default 0,
  subtotal_monthly         numeric(14,2) not null default 0,
  total_value              numeric(14,2) not null default 0,     -- pontual + mensal×vigência − desconto
  version                  int  not null default 1,
  sent_at                  timestamptz,
  first_viewed_at          timestamptz,
  view_count               int  not null default 0,
  accepted_at              timestamptz,
  accepted_by_name         text,
  accepted_by_email        text,
  accepted_ip              text,
  refused_at               timestamptz,
  activated_at             timestamptz,                          -- cliente/serviços/financeiro gerados
  owner_id                 uuid references public.profiles(id) on delete set null,
  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index proposals_status_idx on public.proposals (status);
create index proposals_lead_idx on public.proposals (lead_id);
create index proposals_client_idx on public.proposals (client_id);

alter table public.client_services add constraint client_services_proposal_fk foreign key (proposal_id) references public.proposals(id) on delete set null;

create table public.proposal_items (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  position     int  not null default 0,
  description  text not null,
  details      text,
  billing      text not null default 'pontual' check (billing in ('pontual','mensal')),
  quantity     numeric(10,2) not null default 1 check (quantity > 0),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  line_total   numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);
create index proposal_items_proposal_idx on public.proposal_items (proposal_id, position);

create table public.proposal_versions (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  version      int  not null,
  snapshot     jsonb not null,
  note         text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (proposal_id, version)
);

create table public.proposal_events (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  kind         text not null check (kind in ('enviada','visualizada','alteracao_solicitada','aceita','recusada','expirada','status_alterado','ativada','nota')),
  message      text,
  actor_name   text,
  ip           text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index proposal_events_proposal_idx on public.proposal_events (proposal_id, created_at desc);

-- ---------- regras ----------
create or replace function app.recalc_proposal(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_one numeric; v_month numeric;
begin
  select coalesce(sum(line_total) filter (where billing = 'pontual'), 0),
         coalesce(sum(line_total) filter (where billing = 'mensal'), 0)
    into v_one, v_month from public.proposal_items where proposal_id = p_id;
  update public.proposals
     set subtotal_one_time = v_one, subtotal_monthly = v_month,
         total_value = greatest(v_one + v_month * contract_months - discount_value, 0)
   where id = p_id;
end $$;

create or replace function app.proposal_items_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.recalc_proposal(coalesce(new.proposal_id, old.proposal_id));
  return null;
end $$;
create trigger trg_proposal_items_after after insert or update or delete on public.proposal_items
  for each row execute function app.proposal_items_after();

create or replace function app.proposals_before() returns trigger language plpgsql as $$
declare v_gross numeric;
begin
  v_gross := new.subtotal_one_time + new.subtotal_monthly * new.contract_months;

  if tg_op = 'INSERT' or new.discount_value is distinct from old.discount_value then
    if new.discount_value > 0 then
      if current_user in ('authenticated','anon') then
        if not app.has_role('admin') then
          raise exception 'Descontos precisam ser autorizados por um administrador' using errcode = '42501';
        end if;
        new.discount_authorized_by := auth.uid();
      end if;
      if tg_op = 'UPDATE' and new.discount_value > v_gross then
        raise exception 'Desconto maior que o valor da proposta' using errcode = '23514';
      end if;
    else
      new.discount_authorized_by := null;
    end if;
  end if;

  new.total_value := greatest(v_gross - new.discount_value, 0);

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'enviada' and old.status = 'rascunho' then new.sent_at := coalesce(new.sent_at, now()); end if;
    if new.status = 'aceita' then
      new.accepted_at := coalesce(new.accepted_at, now());
      -- vira cliente automaticamente a partir do lead
      if new.client_id is null and new.lead_id is not null then
        insert into public.clients (name, legal_name, email, phone, segment)
        select coalesce(nullif(l.company, ''), l.name), nullif(l.company, ''), l.email, coalesce(l.whatsapp, l.phone), l.segment
          from public.leads l where l.id = new.lead_id
        returning id into new.client_id;
        update public.leads set client_id = new.client_id where id = new.lead_id;
      end if;
    end if;
    if new.status = 'recusada' then new.refused_at := coalesce(new.refused_at, now()); end if;
  end if;
  return new;
end $$;
create trigger trg_proposals_before before insert or update on public.proposals for each row execute function app.proposals_before();
create trigger trg_proposals_touch before update on public.proposals for each row execute function app.touch_updated_at();
create trigger trg_proposals_audit after insert or update or delete on public.proposals for each row execute function app.audit();

-- security definer: o trigger precisa mexer em leads/jobs mesmo quando o aceite vem do link público (anon)
create or replace function app.proposals_after() returns trigger language plpgsql security definer set search_path = public as $$
declare v_stage uuid;
begin
  if new.status is distinct from old.status then
    if new.status <> 'visualizada' then  -- visualizações têm evento próprio (com IP)
    insert into public.proposal_events (proposal_id, kind, message, created_by)
    values (new.id, case new.status when 'enviada' then 'enviada' when 'aceita' then 'aceita' when 'recusada' then 'recusada'
                                    when 'expirada' then 'expirada' else 'status_alterado' end,
            old.status || ' → ' || new.status, auth.uid());
    end if;

    if new.status = 'aceita' and new.lead_id is not null then
      select id into v_stage from public.pipeline_stages where kind = 'won' and active order by position limit 1;
      if v_stage is not null then update public.leads set stage_id = v_stage where id = new.lead_id and stage_id <> v_stage; end if;
    end if;
    if new.status = 'aceita' then
      perform app.enqueue_job('proposal.accepted', jsonb_build_object('proposal_id', new.id), now(), 'proposal.accepted:' || new.id);
      perform app.notify('Proposta #' || new.number || ' aceita',
                         new.client_display_name || ' aceitou "' || new.title || '". Prepare o contrato.',
                         '/propostas/' || new.id, 'info', null, null, 'proposal.accepted:' || new.id);
    end if;
    if new.status = 'enviada' and new.lead_id is not null then
      select id into v_stage from public.pipeline_stages where name = 'Proposta Enviada' and active limit 1;
      if v_stage is not null then
        update public.leads set stage_id = v_stage
         where id = new.lead_id and stage_id in (select id from public.pipeline_stages where kind = 'open' and position < (select position from public.pipeline_stages where id = v_stage));
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger trg_proposals_after after update on public.proposals for each row execute function app.proposals_after();

-- Versões: snapshot imutável criado sob demanda (ao enviar / salvar versão)
create or replace function public.proposal_snapshot(p_id uuid, p_note text default null) returns int
language plpgsql security invoker as $$
declare v_next int; v_snap jsonb;
begin
  select to_jsonb(p) - 'token' || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.proposal_items i where i.proposal_id = p.id), '[]'::jsonb))
    into v_snap from public.proposals p where p.id = p_id;
  if v_snap is null then raise exception 'Proposta não encontrada'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.proposal_versions where proposal_id = p_id;
  insert into public.proposal_versions (proposal_id, version, snapshot, note, created_by) values (p_id, v_next, v_snap, p_note, auth.uid());
  update public.proposals set version = v_next where id = p_id;
  return v_next;
end $$;

-- ---------- link público (anon) — nunca expõe tabelas, apenas estas funções ----------
create or replace function app.client_ip() returns text language sql stable as $$
  select nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), '')
$$;

create or replace function public.proposal_public_open(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.proposals; v_items jsonb;
begin
  select * into p from public.proposals where token = p_token and status <> 'rascunho';
  if not found then return null; end if;

  if p.valid_until is not null and p.valid_until < app.br_date(now()) and p.status in ('enviada','visualizada','em_negociacao') then
    update public.proposals set status = 'expirada' where id = p.id returning * into p;
  end if;

  if p.status in ('enviada','visualizada','em_negociacao') or p.status = 'aceita' or p.status = 'expirada' or p.status = 'recusada' then
    update public.proposals
       set view_count = view_count + 1,
           first_viewed_at = coalesce(first_viewed_at, now()),
           status = case when status = 'enviada' then 'visualizada' else status end
     where id = p.id returning * into p;
    insert into public.proposal_events (proposal_id, kind, ip) values (p.id, 'visualizada', app.client_ip());
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('description', description, 'details', details, 'billing', billing,
                                               'quantity', quantity, 'unit_price', unit_price, 'line_total', line_total) order by position), '[]'::jsonb)
    into v_items from public.proposal_items where proposal_id = p.id;

  return jsonb_build_object(
    'number', p.number, 'title', p.title, 'status', p.status, 'client_name', p.client_display_name,
    'content', p.content, 'payment_terms', p.payment_terms, 'installments', p.installments,
    'contract_months', p.contract_months, 'valid_until', p.valid_until, 'discount_value', p.discount_value,
    'subtotal_one_time', p.subtotal_one_time, 'subtotal_monthly', p.subtotal_monthly, 'total_value', p.total_value,
    'accepted_at', p.accepted_at, 'accepted_by_name', p.accepted_by_name, 'items', v_items);
end $$;

create or replace function public.proposal_public_accept(p_token text, p_name text, p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.proposals;
begin
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe nome e e-mail válidos para registrar o aceite' using errcode = '22023';
  end if;
  select * into p from public.proposals where token = p_token and status in ('enviada','visualizada','em_negociacao') for update;
  if not found then return false; end if;
  if p.valid_until is not null and p.valid_until < app.br_date(now()) then
    update public.proposals set status = 'expirada' where id = p.id;
    return false;
  end if;
  update public.proposals
     set status = 'aceita', accepted_by_name = btrim(p_name), accepted_by_email = lower(btrim(p_email)), accepted_ip = app.client_ip()
   where id = p.id;
  insert into public.proposal_events (proposal_id, kind, actor_name, ip, message)
  values (p.id, 'aceita', btrim(p_name), app.client_ip(), 'Aceite registrado pelo link da proposta (v' || p.version || ')');
  return true;
end $$;

create or replace function public.proposal_public_request_changes(p_token text, p_name text, p_message text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.proposals;
begin
  if coalesce(btrim(p_message), '') = '' then raise exception 'Descreva as alterações desejadas' using errcode = '22023'; end if;
  select * into p from public.proposals where token = p_token and status in ('enviada','visualizada','em_negociacao') for update;
  if not found then return false; end if;
  update public.proposals set status = 'em_negociacao' where id = p.id;
  insert into public.proposal_events (proposal_id, kind, actor_name, ip, message)
  values (p.id, 'alteracao_solicitada', nullif(btrim(p_name), ''), app.client_ip(), left(p_message, 4000));
  perform app.notify('Alteração solicitada na proposta #' || p.number, left(p_message, 300), '/propostas/' || p.id, 'warning', null, null, null);
  return true;
end $$;

-- ---------- ativação: cliente + serviços + recebíveis (admin/financeiro) ----------
-- Disponível a partir da proposta aceita. Na Fase 2 passa a ser disparada pela assinatura do contrato.
-- definida na 0004 (depende das tabelas financeiras)

-- ======== 20261009000004_finance_goals.sql ========
-- MUVENS OS — 0004 Financeiro, metas, ativação a partir de proposta, métricas

create table public.fin_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  direction     text not null check (direction in ('in','out')),
  expense_type  text check (expense_type in ('fixa','variavel','imposto','prolabore')),  -- só para saídas
  active        boolean not null default true,
  unique (direction, name),
  check ((direction = 'out') = (expense_type is not null))
);
insert into public.fin_categories (name, direction, expense_type) values
  ('Serviços recorrentes',      'in',  null),
  ('Serviços pontuais',         'in',  null),
  ('Outras receitas',           'in',  null),
  ('Pró-labore',                'out', 'prolabore'),
  ('Impostos',                  'out', 'imposto'),
  ('Ferramentas e assinaturas', 'out', 'fixa'),
  ('Escritório e infraestrutura','out','fixa'),
  ('Freelancers e terceiros',   'out', 'variavel'),
  ('Marketing próprio',         'out', 'variavel'),
  ('Taxas bancárias e cobrança','out', 'variavel');

-- Regras de lançamentos recorrentes: despesas fixas, assinaturas (Adobe, Google Workspace, ChatGPT...) e receitas recorrentes
create table public.fin_recurring (
  id             uuid primary key default gen_random_uuid(),
  description    text not null,
  vendor         text,
  direction      text not null check (direction in ('in','out')),
  category_id    uuid references public.fin_categories(id),
  client_id      uuid references public.clients(id) on delete set null,
  amount         numeric(14,2) not null check (amount > 0),
  day_of_month   int not null default 5 check (day_of_month between 1 and 31),
  starts_on      date not null default current_date,
  ends_on        date,
  is_subscription boolean not null default false,
  active         boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_fin_recurring_touch before update on public.fin_recurring for each row execute function app.touch_updated_at();

create table public.fin_transactions (
  id                 uuid primary key default gen_random_uuid(),
  direction          text not null check (direction in ('in','out')),
  description        text not null,
  category_id        uuid references public.fin_categories(id),
  client_id          uuid references public.clients(id) on delete set null,
  proposal_id        uuid references public.proposals(id) on delete set null,
  recurring_id       uuid references public.fin_recurring(id) on delete set null,
  competence         date,                                    -- 1º dia do mês de competência (recorrências)
  amount             numeric(14,2) not null check (amount > 0),
  -- previsto → emitido (cobrança emitida) → liquidado (recebido/pago de fato)
  status             text not null default 'previsto' check (status in ('previsto','emitido','liquidado','cancelado')),
  due_date           date not null,
  issued_at          timestamptz,
  paid_at            timestamptz,
  paid_amount        numeric(14,2),
  installment_no     int,
  installment_total  int,
  installment_group  uuid,
  attachment_path    text,                                    -- comprovante (bucket privado finance-receipts)
  external_ref       jsonb not null default '{}'::jsonb,      -- id da cobrança no Asaas etc. (Fase 3)
  notes              text,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (status <> 'liquidado' or (paid_at is not null and paid_amount is not null))
);
create unique index fin_tx_recurring_uidx on public.fin_transactions (recurring_id, competence) where recurring_id is not null;
create index fin_tx_due_idx on public.fin_transactions (due_date);
create index fin_tx_status_idx on public.fin_transactions (status, direction);
create index fin_tx_client_idx on public.fin_transactions (client_id);
create trigger trg_fin_tx_touch before update on public.fin_transactions for each row execute function app.touch_updated_at();
create trigger trg_fin_tx_audit after insert or update or delete on public.fin_transactions for each row execute function app.audit();

create or replace function app.fin_tx_before() returns trigger language plpgsql as $$
begin
  if new.status in ('emitido','liquidado') and new.issued_at is null then new.issued_at := now(); end if;
  if new.status = 'liquidado' then
    new.paid_at := coalesce(new.paid_at, now());
    new.paid_amount := coalesce(new.paid_amount, new.amount);
  elsif new.status <> 'liquidado' then
    new.paid_at := null; new.paid_amount := null;
  end if;
  return new;
end $$;
create trigger trg_fin_tx_before before insert or update on public.fin_transactions for each row execute function app.fin_tx_before();

-- Gera lançamentos do mês a partir das regras recorrentes (idempotente). Retorna quantos foram criados.
create or replace function public.generate_recurring(p_month date) returns int
language plpgsql security invoker as $$
declare v_first date := date_trunc('month', p_month)::date; v_count int;
begin
  with ins as (
    insert into public.fin_transactions (direction, description, category_id, client_id, recurring_id, competence, amount, status, due_date, created_by)
    select r.direction,
           r.description || coalesce(' — ' || r.vendor, ''),
           r.category_id, r.client_id, r.id, v_first, r.amount, 'previsto',
           make_date(extract(year from v_first)::int, extract(month from v_first)::int,
                     least(r.day_of_month, extract(day from (v_first + interval '1 month - 1 day'))::int)),
           auth.uid()
      from public.fin_recurring r
     where r.active and r.starts_on <= (v_first + interval '1 month - 1 day')::date
       and (r.ends_on is null or r.ends_on >= v_first)
    on conflict (recurring_id, competence) where recurring_id is not null do nothing
    returning 1)
  select count(*) into v_count from ins;
  return v_count;
end $$;

-- Metas
create table public.goals (
  id                 uuid primary key default gen_random_uuid(),
  period_type        text not null check (period_type in ('mensal','anual')),
  period_start       date not null,                              -- 1º dia do mês / 1º de janeiro
  basis              text not null default 'recebido' check (basis in ('contratado','emitido','recebido')),
  revenue_target     numeric(14,2) not null check (revenue_target >= 0),
  contracts_target   int check (contracts_target is null or contracts_target >= 0),
  mrr_target         numeric(14,2) check (mrr_target is null or mrr_target >= 0),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (period_type, period_start),
  check ((period_type = 'mensal' and extract(day from period_start) = 1)
      or (period_type = 'anual' and extract(day from period_start) = 1 and extract(month from period_start) = 1))
);
create trigger trg_goals_touch before update on public.goals for each row execute function app.touch_updated_at();
create trigger trg_goals_audit after insert or update or delete on public.goals for each row execute function app.audit();

-- ---------- ativação a partir de proposta aceita ----------
-- Cria (se faltar) o cliente, registra serviços contratados e gera os recebíveis previstos.
-- Exige admin ou financeiro — gera obrigações financeiras, então não é automático (ação crítica com autorização).
create or replace function public.activate_proposal(p_id uuid, p_first_due date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.proposals; v_group uuid := gen_random_uuid(); v_cat_rec uuid; v_cat_one uuid;
        i int; v_each numeric; v_rest numeric; v_months int;
begin
  if not app.has_role('admin','financeiro') then
    raise exception 'Apenas administrador ou financeiro pode ativar uma proposta' using errcode = '42501';
  end if;
  select * into p from public.proposals where id = p_id for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if p.status <> 'aceita' then raise exception 'Somente propostas aceitas podem ser ativadas' using errcode = '23514'; end if;
  if p.activated_at is not null then raise exception 'Proposta já ativada em %', p.activated_at using errcode = '23505'; end if;
  if p.client_id is null then raise exception 'Proposta sem cliente vinculado' using errcode = '23514'; end if;

  select id into v_cat_rec from public.fin_categories where direction = 'in' and name = 'Serviços recorrentes';
  select id into v_cat_one from public.fin_categories where direction = 'in' and name = 'Serviços pontuais';

  insert into public.client_services (client_id, proposal_id, service, billing, value, starts_on)
  select p.client_id, p.id, it.description, it.billing, it.line_total, p_first_due
    from public.proposal_items it where it.proposal_id = p.id;

  -- pontual: parcelado conforme a proposta (centavos restantes vão para a última parcela), menos o desconto
  if p.subtotal_one_time > 0 then
    v_rest := greatest(p.subtotal_one_time - p.discount_value, 0);
    v_each := round(v_rest / p.installments, 2);
    for i in 1..p.installments loop
      insert into public.fin_transactions (direction, description, category_id, client_id, proposal_id, amount, due_date, installment_no, installment_total, installment_group, created_by)
      values ('in', 'Proposta #' || p.number || ' — ' || p.title || ' (' || i || '/' || p.installments || ')', v_cat_one, p.client_id, p.id,
              case when i = p.installments then v_rest - v_each * (p.installments - 1) else v_each end,
              (p_first_due + ((i - 1) || ' months')::interval)::date, i, p.installments, v_group, auth.uid());
    end loop;
  end if;

  -- mensal: uma cobrança por mês de vigência
  if p.subtotal_monthly > 0 then
    v_months := p.contract_months;
    for i in 1..v_months loop
      insert into public.fin_transactions (direction, description, category_id, client_id, proposal_id, amount, due_date, installment_no, installment_total, installment_group, created_by)
      values ('in', 'Mensalidade proposta #' || p.number || ' (' || i || '/' || v_months || ')', v_cat_rec, p.client_id, p.id,
              p.subtotal_monthly, (p_first_due + ((i - 1) || ' months')::interval)::date, i, v_months, v_group, auth.uid());
    end loop;
  end if;

  update public.proposals set activated_at = now() where id = p.id;
  insert into public.proposal_events (proposal_id, kind, message, created_by) values (p.id, 'ativada', 'Cliente ativado e recebíveis previstos gerados', auth.uid());
  update public.clients set status = 'ativo' where id = p.client_id;
  return jsonb_build_object('client_id', p.client_id, 'group', v_group);
end $$;

-- ---------- métricas ----------
-- Definições (documentadas também em docs/):
--  contratado  = soma de total_value das propostas aceitas no período (Fase 2: contratos assinados)
--  emitido     = lançamentos de entrada emitidos/liquidados com issued_at no período
--  recebido    = entradas liquidadas com paid_at no período
--  a receber   = entradas previstas/emitidas ainda não liquidadas (todas as datas) / vencidas
--  despesas    = saídas não canceladas com vencimento no período, por tipo
--  resultado   = recebido − saídas liquidadas no período (caixa realizado)
--  previsão    = recebido + entradas pendentes com vencimento no período − saídas pendentes no período
create or replace function public.dashboard_metrics(p_from date, p_to date, p_client uuid default null) returns jsonb
language plpgsql stable security invoker as $$
declare r jsonb; today date := app.br_date(now());
begin
  select jsonb_build_object(
    'contracted', coalesce((select sum(total_value) from public.proposals where status = 'aceita' and app.br_date(accepted_at) between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'contracts_closed', coalesce((select count(*) from public.proposals where status = 'aceita' and app.br_date(accepted_at) between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'issued', coalesce((select sum(amount) from public.fin_transactions where direction = 'in' and status in ('emitido','liquidado') and app.br_date(issued_at) between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'received', coalesce((select sum(paid_amount) from public.fin_transactions where direction = 'in' and status = 'liquidado' and app.br_date(paid_at) between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'receivable_open', coalesce((select sum(amount) from public.fin_transactions where direction = 'in' and status in ('previsto','emitido') and (p_client is null or client_id = p_client)), 0),
    'receivable_overdue', coalesce((select sum(amount) from public.fin_transactions where direction = 'in' and status in ('previsto','emitido') and due_date < today and (p_client is null or client_id = p_client)), 0),
    'receivable_overdue_count', coalesce((select count(*) from public.fin_transactions where direction = 'in' and status in ('previsto','emitido') and due_date < today and (p_client is null or client_id = p_client)), 0),
    'expenses_fixed', coalesce((select sum(t.amount) from public.fin_transactions t join public.fin_categories c on c.id = t.category_id where t.direction = 'out' and t.status <> 'cancelado' and c.expense_type = 'fixa' and t.due_date between p_from and p_to), 0),
    'expenses_variable', coalesce((select sum(t.amount) from public.fin_transactions t join public.fin_categories c on c.id = t.category_id where t.direction = 'out' and t.status <> 'cancelado' and c.expense_type = 'variavel' and t.due_date between p_from and p_to), 0),
    'expenses_other', coalesce((select sum(t.amount) from public.fin_transactions t left join public.fin_categories c on c.id = t.category_id where t.direction = 'out' and t.status <> 'cancelado' and coalesce(c.expense_type, 'sem') not in ('fixa','variavel') and t.due_date between p_from and p_to), 0),
    'expenses_paid', coalesce((select sum(paid_amount) from public.fin_transactions where direction = 'out' and status = 'liquidado' and app.br_date(paid_at) between p_from and p_to), 0),
    'mrr', coalesce((select sum(value) from public.client_services where billing = 'mensal' and status = 'ativo' and starts_on <= today and (ends_on is null or ends_on >= today) and (p_client is null or client_id = p_client)), 0),
    'active_clients', coalesce((select count(*) from public.clients where status = 'ativo' and (p_client is null or id = p_client)), 0),
    'leads_received', coalesce((select count(*) from public.leads where app.br_date(created_at) between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'proposals_sent', coalesce((select count(*) from public.proposals where app.br_date(sent_at) between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'negotiations_open', coalesce((select count(*) from public.leads l join public.pipeline_stages s on s.id = l.stage_id where s.kind = 'open' and s.is_negotiation and (p_client is null or l.client_id = p_client)), 0),
    'negotiations_value', coalesce((select sum(l.potential_value) from public.leads l join public.pipeline_stages s on s.id = l.stage_id where s.kind = 'open' and s.is_negotiation and (p_client is null or l.client_id = p_client)), 0),
    'pipeline_weighted', coalesce((select sum(l.potential_value * s.probability / 100.0) from public.leads l join public.pipeline_stages s on s.id = l.stage_id where s.kind = 'open' and (p_client is null or l.client_id = p_client)), 0),
    'pending_in_period', coalesce((select sum(amount) from public.fin_transactions where direction = 'in' and status in ('previsto','emitido') and due_date between p_from and p_to and (p_client is null or client_id = p_client)), 0),
    'pending_out_period', coalesce((select sum(amount) from public.fin_transactions where direction = 'out' and status in ('previsto','emitido') and due_date between p_from and p_to), 0)
  ) into r;
  return r;
end $$;

-- Série mensal (últimos N meses, inclusive o atual) para gráficos
create or replace function public.finance_monthly_series(p_months int default 12)
returns table (month date, received numeric, spent numeric, issued numeric)
language sql stable security invoker as $$
  select m::date,
    coalesce((select sum(paid_amount) from public.fin_transactions where direction = 'in'  and status = 'liquidado' and date_trunc('month', app.br_date(paid_at)) = m), 0),
    coalesce((select sum(paid_amount) from public.fin_transactions where direction = 'out' and status = 'liquidado' and date_trunc('month', app.br_date(paid_at)) = m), 0),
    coalesce((select sum(amount) from public.fin_transactions where direction = 'in' and status in ('emitido','liquidado') and date_trunc('month', app.br_date(issued_at)) = m), 0)
  from generate_series(date_trunc('month', app.br_date(now()))::date - ((p_months - 1) || ' months')::interval,
                       date_trunc('month', app.br_date(now()))::date, interval '1 month') m
  order by 1
$$;

-- Conversão do funil no período (leads criados no período que chegaram a "won")
create or replace function public.crm_conversion(p_from date, p_to date) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object(
    'total',  count(*),
    'won',    count(*) filter (where s.kind = 'won'),
    'lost',   count(*) filter (where s.kind = 'lost'),
    'open',   count(*) filter (where s.kind = 'open'),
    'won_value', coalesce(sum(l.potential_value) filter (where s.kind = 'won'), 0))
  from public.leads l join public.pipeline_stages s on s.id = l.stage_id
  where app.br_date(l.created_at) between p_from and p_to
$$;

-- ---------- varreduras periódicas do worker (alertas) ----------
create or replace function public.run_scheduled_scans() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_over int := 0; n_leads int := 0; n_props int := 0; n_rem int := 0; n_exp int := 0; n_gen int := 0; rec record; today date := app.br_date(now());
begin
  -- Pagamentos em atraso
  for rec in select t.id, t.description, t.amount, t.due_date from public.fin_transactions t
              where t.direction = 'in' and t.status in ('previsto','emitido') and t.due_date < today loop
    perform app.notify('Pagamento em atraso', rec.description || ' — R$ ' || to_char(rec.amount, 'FM999G999G990D00') || ' (venc. ' || to_char(rec.due_date, 'DD/MM/YYYY') || ')',
                       '/financeiro?tab=receber', 'critical', 'financeiro', null, 'overdue:' || rec.id);
    n_over := n_over + 1;
  end loop;

  -- Oportunidades abertas sem contato há 3+ dias
  for rec in select l.id, l.name, l.owner_id from public.leads l join public.pipeline_stages s on s.id = l.stage_id
              where s.kind = 'open' and coalesce(l.last_contact_at, l.created_at) < now() - interval '3 days' loop
    perform app.notify('Oportunidade sem acompanhamento', rec.name || ' está há mais de 3 dias sem contato.', '/crm/' || rec.id, 'warning',
                       case when rec.owner_id is null then 'comercial' end, rec.owner_id,
                       'stale-lead:' || rec.id || ':' || to_char(today, 'IYYY-IW'));
    n_leads := n_leads + 1;
  end loop;

  -- Propostas enviadas há 5+ dias sem resposta
  for rec in select p.id, p.number, p.client_display_name, p.owner_id from public.proposals p
              where p.status in ('enviada','visualizada') and p.sent_at < now() - interval '5 days' loop
    perform app.notify('Proposta parada', 'Proposta #' || rec.number || ' (' || rec.client_display_name || ') sem resposta há mais de 5 dias.',
                       '/propostas/' || rec.id, 'warning', case when rec.owner_id is null then 'comercial' end, rec.owner_id,
                       'stale-proposal:' || rec.id || ':' || to_char(today, 'IYYY-IW'));
    n_props := n_props + 1;
  end loop;

  -- Lembretes vencidos
  for rec in select r.id, r.title, r.lead_id, coalesce(r.assigned_to, r.created_by) as uid from public.lead_reminders r
              where r.done_at is null and r.due_at <= now() loop
    perform app.notify('Lembrete: ' || rec.title, null, '/crm/' || rec.lead_id, 'info', case when rec.uid is null then 'comercial' end, rec.uid, 'reminder:' || rec.id);
    n_rem := n_rem + 1;
  end loop;

  -- Propostas expiradas
  update public.proposals set status = 'expirada'
   where status in ('enviada','visualizada','em_negociacao') and valid_until is not null and valid_until < today;
  get diagnostics n_exp = row_count;

  -- Despesas fixas/assinaturas/receitas recorrentes do mês corrente
  n_gen := public.generate_recurring(today);

  return jsonb_build_object('recurring_generated', n_gen, 'overdue', n_over, 'stale_leads', n_leads, 'stale_proposals', n_props, 'reminders', n_rem, 'expired_proposals', n_exp);
end $$;

-- ======== 20261009000005_security_rls.sql ========
-- MUVENS OS — 0005 Segurança: RLS por perfil, privilégios mínimos, storage privado

-- Privilégios: nada para anon em tabelas; authenticated sob RLS; service_role (servidor) ignora RLS.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon;

-- Funções: por padrão ninguém executa; liberamos explicitamente.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.proposal_public_open(text), public.proposal_public_accept(text, text, text),
                          public.proposal_public_request_changes(text, text, text) to anon, authenticated;
grant execute on function public.dashboard_metrics(date, date, uuid), public.finance_monthly_series(int), public.crm_conversion(date, date),
                          public.generate_recurring(date), public.activate_proposal(uuid, date), public.proposal_snapshot(uuid, text) to authenticated;
grant execute on function public.claim_jobs(int), public.finish_job(uuid, text), public.run_scheduled_scans() to service_role;
-- funções app.* de autorização precisam ser chamáveis por anon dentro das policies/triggers do link público
grant execute on function app.client_ip(), app.br_date(timestamptz), app.norm_email(text), app.norm_phone(text), app.has_role(text[]), app.user_role() to anon;
grant execute on function app.notify(text, text, text, text, text, uuid, text), app.enqueue_job(text, jsonb, timestamptz, text) to anon;

-- Habilita RLS em tudo
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or app.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- audit_log / jobs: somente admin lê; escrita só via triggers/funções definer e service role
create policy audit_select on public.audit_log for select to authenticated using (app.has_role('admin'));
create policy jobs_select on public.jobs for select to authenticated using (app.has_role('admin'));

-- notifications: equipe vê as endereçadas a ela, ao seu papel ou a todos
create policy notif_select on public.notifications for select to authenticated
  using (app.is_staff() and (user_id = auth.uid() or (user_id is null and (audience is null or audience = app.user_role()))));
create policy notif_update on public.notifications for update to authenticated
  using (app.is_staff() and (user_id = auth.uid() or (user_id is null and (audience is null or audience = app.user_role()))))
  with check (app.is_staff());

-- clientes (designer/tráfego precisam enxergar; edição por admin/comercial/financeiro)
create policy clients_select on public.clients for select to authenticated using (app.is_staff() or id = app.current_client_id());
create policy clients_write on public.clients for all to authenticated
  using (app.has_role('admin','comercial','financeiro')) with check (app.has_role('admin','comercial','financeiro'));
create policy contacts_select on public.client_contacts for select to authenticated using (app.is_staff());
create policy contacts_write on public.client_contacts for all to authenticated
  using (app.has_role('admin','comercial','financeiro')) with check (app.has_role('admin','comercial','financeiro'));
create policy cservices_select on public.client_services for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy cservices_write on public.client_services for all to authenticated
  using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));

-- CRM
create policy stages_select on public.pipeline_stages for select to authenticated using (app.is_staff());
create policy stages_write on public.pipeline_stages for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create policy leads_all on public.leads for all to authenticated
  using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy interactions_all on public.lead_interactions for all to authenticated
  using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy reminders_all on public.lead_reminders for all to authenticated
  using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));

-- propostas (financeiro só lê)
create policy proposals_select on public.proposals for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy proposals_write on public.proposals for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy pitems_select on public.proposal_items for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy pitems_write on public.proposal_items for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy pversions_select on public.proposal_versions for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy pversions_insert on public.proposal_versions for insert to authenticated with check (app.has_role('admin','comercial'));
create policy pevents_select on public.proposal_events for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy pevents_insert on public.proposal_events for insert to authenticated with check (app.has_role('admin','comercial'));

-- financeiro
create policy fincat_select on public.fin_categories for select to authenticated using (app.has_role('admin','financeiro','comercial'));
create policy fincat_write on public.fin_categories for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));
create policy finrec_all on public.fin_recurring for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));
create policy fintx_all on public.fin_transactions for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));

-- metas
create policy goals_select on public.goals for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy goals_write on public.goals for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- ---------- storage privado (comprovantes) — só existe no Supabase ----------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('finance-receipts', 'finance-receipts', false) on conflict (id) do nothing;
    execute $p$create policy "finance receipts read" on storage.objects for select to authenticated
      using (bucket_id = 'finance-receipts' and app.has_role('admin','financeiro'))$p$;
    execute $p$create policy "finance receipts write" on storage.objects for insert to authenticated
      with check (bucket_id = 'finance-receipts' and app.has_role('admin','financeiro'))$p$;
    execute $p$create policy "finance receipts delete" on storage.objects for delete to authenticated
      using (bucket_id = 'finance-receipts' and app.has_role('admin','financeiro'))$p$;
  end if;
end $$;

-- ======== 20261010000006_contracts.sql ========
-- MUVENS OS — Fase 2 / Contratos
-- Fluxo: proposta aceita → rascunho de contrato (automático) → revisão humana obrigatória → aprovado
--        → (assinatura eletrônica: integração PENDENTE) / registro manual → assinado → ativa cliente + financeiro.

-- ---------- dados da agência (contratada) ----------
create table public.agency_settings (
  id                    int primary key default 1 check (id = 1),
  legal_name            text, trade_name text not null default 'MUVENS AGÊNCIA',
  document              text, address text, city text,
  representative_name   text, representative_role text, email text,
  updated_at            timestamptz not null default now()
);
insert into public.agency_settings (id) values (1);
create trigger trg_agency_touch before update on public.agency_settings for each row execute function app.touch_updated_at();
create trigger trg_agency_audit after update on public.agency_settings for each row execute function app.audit();

-- ---------- modelos ----------
create table public.contract_templates (
  id               uuid primary key default gen_random_uuid(),
  service_template text not null check (service_template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','personalizado')),
  name             text not null,
  body             text not null,
  active           boolean not null default true,
  updated_at       timestamptz not null default now(),
  unique (service_template, name)
);
create trigger trg_ctpl_touch before update on public.contract_templates for each row execute function app.touch_updated_at();
create trigger trg_ctpl_audit after insert or update or delete on public.contract_templates for each row execute function app.audit();

-- Modelo-base. NÃO é assessoria jurídica: cláusulas sensíveis ficam como [PREENCHER] para o jurídico definir.
do $$
declare v_body text; k record;
begin
  v_body := $b$CONTRATO DE PRESTAÇÃO DE SERVIÇOS — {{servico}}

[MODELO-BASE — não constitui assessoria jurídica. Revisar com advogado(a) antes do uso.]

CONTRATANTE: {{contratante_nome}}, inscrita(o) no CPF/CNPJ {{contratante_documento}}, com endereço em {{contratante_endereco}}.
CONTRATADA: {{contratada_nome}}, CNPJ {{contratada_documento}}, com endereço em {{contratada_endereco}}, representada por {{contratada_representante}}.

CLÁUSULA 1 — DO OBJETO
O presente contrato tem por objeto a prestação do serviço: {{servico}}.

CLÁUSULA 2 — DO ESCOPO E DOS ENTREGÁVEIS
Escopo aprovado:
{{escopo}}

Entregáveis:
{{entregaveis}}

Serviços fora do escopo acima serão orçados e aprovados separadamente.

CLÁUSULA 3 — DO PRAZO DE EXECUÇÃO
{{prazo_execucao}}

CLÁUSULA 4 — DO VALOR E DA FORMA DE PAGAMENTO
Valor total do contrato: {{valor_total}}.
{{forma_pagamento}}

CLÁUSULA 5 — DA VIGÊNCIA
Vigência de {{vigencia}}.

CLÁUSULA 6 — DO REAJUSTE E DA RENOVAÇÃO
{{reajuste}}

CLÁUSULA 7 — DA RESCISÃO
[PREENCHER: condições de rescisão, aviso prévio e multa — definir com o jurídico]

CLÁUSULA 8 — DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)
[PREENCHER: cláusula de tratamento de dados pessoais — definir com o jurídico]

CLÁUSULA 9 — DO FORO
[PREENCHER: foro de eleição]

{{cidade}}, {{data}}.

______________________________          ______________________________
{{contratante_nome}}                    {{contratada_nome}}
$b$;
  for k in select unnest(array['redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','personalizado']) as s loop
    insert into public.contract_templates (service_template, name, body) values (k.s, 'Modelo padrão', v_body);
  end loop;
end $$;

-- ---------- contratos ----------
create sequence public.contract_number_seq;
create table public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  number               int not null default nextval('public.contract_number_seq') unique,
  proposal_id          uuid not null references public.proposals(id),
  client_id            uuid references public.clients(id) on delete set null,
  template_id          uuid references public.contract_templates(id) on delete set null,
  title                text not null,
  status               text not null default 'rascunho'
                       check (status in ('rascunho','em_revisao','aprovado','enviado_assinatura','assinado','cancelado')),
  body                 text not null,
  total_value          numeric(14,2) not null default 0,
  contract_months      int not null default 12,
  starts_on            date, ends_on date, readjust_on date,
  reviewed_by          uuid references public.profiles(id), reviewed_at timestamptz,
  approved_by          uuid references public.profiles(id), approved_at timestamptz,
  signature_provider   text check (signature_provider in ('manual','clicksign','zapsign')),
  signature_external_id text,
  signed_at            timestamptz,
  signature_note       text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index contracts_one_active_per_proposal on public.contracts (proposal_id) where status <> 'cancelado';
create index contracts_status_idx on public.contracts (status);
create index contracts_ends_idx on public.contracts (ends_on) where status = 'assinado';
create trigger trg_contracts_touch before update on public.contracts for each row execute function app.touch_updated_at();
create trigger trg_contracts_audit after insert or update or delete on public.contracts for each row execute function app.audit();

-- Substitui {{chave}} pelos valores; ausentes viram "[PREENCHER: chave]" (visível para a revisão humana).
create or replace function app.render_template(p_body text, p_vars jsonb) returns text language plpgsql immutable as $$
declare r record; v text := p_body;
begin
  for r in select key, value from jsonb_each_text(p_vars) loop
    v := replace(v, '{{' || r.key || '}}', coalesce(nullif(btrim(r.value), ''), '[PREENCHER: ' || r.key || ']'));
  end loop;
  return regexp_replace(v, '\{\{([a-z_]+)\}\}', '[PREENCHER: \1]', 'g');
end $$;

create or replace function app.brl(v numeric) returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(v, 'FM999,999,990.00'), ',.', '.,')
$$;

create or replace function app.generate_contract_core(p_proposal uuid, p_template uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.proposals; c public.clients; a public.agency_settings; t public.contract_templates; v jsonb; v_escopo text; v_entreg text; v_pay text; v_id uuid;
begin
  select * into v_id from (select id from public.contracts where proposal_id = p_proposal and status <> 'cancelado') x;
  if v_id is not null then return v_id; end if;
  select * into p from public.proposals where id = p_proposal;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if p.status <> 'aceita' then raise exception 'Só é possível gerar contrato de proposta aceita' using errcode = '23514'; end if;
  select * into c from public.clients where id = p.client_id;
  select * into a from public.agency_settings where id = 1;
  if p_template is not null then select * into t from public.contract_templates where id = p_template;
  else select * into t from public.contract_templates where service_template = p.template and active order by name limit 1; end if;
  if t.id is null then select * into t from public.contract_templates where service_template = 'personalizado' and active order by name limit 1; end if;
  if t.id is null then raise exception 'Nenhum modelo de contrato ativo' using errcode = '23514'; end if;

  select coalesce(string_agg('- ' || description, E'\n' order by position), '') into v_escopo from public.proposal_items where proposal_id = p.id;
  v_escopo := v_escopo || coalesce(E'\n' || (select string_agg('- ' || x, E'\n') from jsonb_array_elements_text(coalesce(p.content->'escopo', '[]'::jsonb)) x), '');
  select string_agg('- ' || x, E'\n') into v_entreg from jsonb_array_elements_text(coalesce(p.content->'entregaveis', '[]'::jsonb)) x;
  v_pay := concat_ws(E'\n',
    case when p.subtotal_one_time > 0 then 'Parte pontual: ' || app.brl(greatest(p.subtotal_one_time - p.discount_value, 0)) || ' em ' || p.installments || ' parcela(s).' end,
    case when p.subtotal_monthly > 0 then 'Mensalidade: ' || app.brl(p.subtotal_monthly) || ' por ' || p.contract_months || ' meses.' end,
    nullif(btrim(p.payment_terms), ''));

  v := jsonb_build_object(
    'servico', p.title, 'contratante_nome', coalesce(nullif(c.legal_name, ''), c.name, p.client_display_name), 'contratante_documento', c.document, 'contratante_endereco', c.address,
    'contratada_nome', coalesce(a.legal_name, a.trade_name), 'contratada_documento', a.document, 'contratada_endereco', a.address,
    'contratada_representante', concat_ws(', ', a.representative_name, a.representative_role),
    'escopo', v_escopo, 'entregaveis', v_entreg, 'prazo_execucao', p.content->>'cronograma',
    'valor_total', app.brl(p.total_value), 'forma_pagamento', v_pay, 'vigencia', p.contract_months || ' meses, contados da data de início',
    'reajuste', '', 'cidade', a.city, 'data', to_char(app.br_date(now()), 'DD/MM/YYYY'));

  insert into public.contracts (proposal_id, client_id, template_id, title, body, total_value, contract_months, created_by)
  values (p.id, p.client_id, t.id, 'Contrato — ' || p.title, app.render_template(t.body, v), p.total_value, p.contract_months, auth.uid())
  returning id into v_id;
  perform app.notify('Rascunho de contrato gerado', 'Proposta #' || p.number || ' (' || p.client_display_name || '): revise e aprove o contrato.', '/contratos/' || v_id, 'info', null, null, 'contract.draft:' || v_id);
  return v_id;
end $$;

create or replace function public.generate_contract(p_proposal uuid, p_template uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin','comercial') then raise exception 'Sem permissão para gerar contrato' using errcode = '42501'; end if;
  return app.generate_contract_core(p_proposal, p_template);
end $$;

-- Aceite da proposta → rascunho de contrato (nunca bloqueia o aceite se falhar)
create or replace function app.proposals_gen_contract() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aceita' and old.status is distinct from 'aceita' then
    begin perform app.generate_contract_core(new.id, null);
    exception when others then
      perform app.notify('Falha ao gerar rascunho do contrato', 'Proposta #' || new.number || ': ' || sqlerrm, '/propostas/' || new.id, 'warning', 'comercial', null, 'contract.fail:' || new.id);
    end;
  end if;
  return null;
end $$;
create trigger trg_proposals_gen_contract after update on public.proposals for each row execute function app.proposals_gen_contract();

-- ---------- ativação (refatora activate_proposal para reuso pela assinatura) ----------
create or replace function app.activate_proposal_core(p_id uuid, p_first_due date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.proposals; v_group uuid := gen_random_uuid(); v_cat_rec uuid; v_cat_one uuid; i int; v_each numeric; v_rest numeric;
begin
  select * into p from public.proposals where id = p_id for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if p.status <> 'aceita' then raise exception 'Somente propostas aceitas podem ser ativadas' using errcode = '23514'; end if;
  if p.activated_at is not null then raise exception 'Proposta já ativada em %', p.activated_at using errcode = '23505'; end if;
  if p.client_id is null then raise exception 'Proposta sem cliente vinculado' using errcode = '23514'; end if;
  select id into v_cat_rec from public.fin_categories where direction = 'in' and name = 'Serviços recorrentes';
  select id into v_cat_one from public.fin_categories where direction = 'in' and name = 'Serviços pontuais';
  insert into public.client_services (client_id, proposal_id, service, billing, value, starts_on)
  select p.client_id, p.id, it.description, it.billing, it.line_total, p_first_due from public.proposal_items it where it.proposal_id = p.id;
  if p.subtotal_one_time > 0 then
    v_rest := greatest(p.subtotal_one_time - p.discount_value, 0); v_each := round(v_rest / p.installments, 2);
    for i in 1..p.installments loop
      insert into public.fin_transactions (direction, description, category_id, client_id, proposal_id, amount, due_date, installment_no, installment_total, installment_group, created_by)
      values ('in', 'Proposta #' || p.number || ' — ' || p.title || ' (' || i || '/' || p.installments || ')', v_cat_one, p.client_id, p.id,
              case when i = p.installments then v_rest - v_each * (p.installments - 1) else v_each end,
              (p_first_due + ((i - 1) || ' months')::interval)::date, i, p.installments, v_group, auth.uid());
    end loop;
  end if;
  if p.subtotal_monthly > 0 then
    for i in 1..p.contract_months loop
      insert into public.fin_transactions (direction, description, category_id, client_id, proposal_id, amount, due_date, installment_no, installment_total, installment_group, created_by)
      values ('in', 'Mensalidade proposta #' || p.number || ' (' || i || '/' || p.contract_months || ')', v_cat_rec, p.client_id, p.id,
              p.subtotal_monthly, (p_first_due + ((i - 1) || ' months')::interval)::date, i, p.contract_months, v_group, auth.uid());
    end loop;
  end if;
  update public.proposals set activated_at = now() where id = p.id;
  insert into public.proposal_events (proposal_id, kind, message, created_by) values (p.id, 'ativada', 'Cliente ativado e recebíveis previstos gerados', auth.uid());
  update public.clients set status = 'ativo' where id = p.client_id;
  return jsonb_build_object('client_id', p.client_id, 'group', v_group);
end $$;

create or replace function public.activate_proposal(p_id uuid, p_first_due date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('admin','financeiro') then raise exception 'Apenas administrador ou financeiro pode ativar uma proposta' using errcode = '42501'; end if;
  return app.activate_proposal_core(p_id, p_first_due);
end $$;

-- ---------- regras de status / revisão humana ----------
create or replace function app.contracts_before() returns trigger language plpgsql as $$
declare v_human boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if not (old.status, new.status) in (('rascunho','em_revisao'), ('rascunho','cancelado'), ('em_revisao','rascunho'), ('em_revisao','aprovado'), ('em_revisao','cancelado'),
                                          ('aprovado','em_revisao'), ('aprovado','enviado_assinatura'), ('aprovado','assinado'), ('aprovado','cancelado'),
                                          ('enviado_assinatura','assinado'), ('enviado_assinatura','cancelado')) then
        raise exception 'Transição de status inválida: % → %', old.status, new.status using errcode = '23514';
      end if;
      if new.status = 'em_revisao' and old.status = 'rascunho' then new.reviewed_by := auth.uid(); new.reviewed_at := now(); end if;
      if new.status = 'aprovado' then
        if v_human and auth.uid() is null then raise exception 'Aprovação exige usuário autenticado' using errcode = '42501'; end if;
        if new.body like '%[PREENCHER%' then raise exception 'Há campos [PREENCHER] pendentes no texto do contrato — complete a revisão antes de aprovar' using errcode = '23514'; end if;
        new.approved_by := auth.uid(); new.approved_at := now();
      end if;
      if new.status = 'enviado_assinatura' and new.signature_provider is null then
        raise exception 'Integração de assinatura eletrônica ainda não configurada (pendente) — use "Registrar assinatura manual"' using errcode = '23514';
      end if;
      if new.status = 'assinado' then
        if v_human and not app.has_role('admin') then raise exception 'Apenas administrador registra a assinatura' using errcode = '42501'; end if;
        new.signed_at := coalesce(new.signed_at, now());
        new.signature_provider := coalesce(new.signature_provider, 'manual');
        new.starts_on := coalesce(new.starts_on, app.br_date(new.signed_at));
        new.ends_on := coalesce(new.ends_on, (new.starts_on + (new.contract_months || ' months')::interval)::date);
      end if;
    elsif old.status in ('aprovado','enviado_assinatura','assinado','cancelado') and new.body is distinct from old.body then
      raise exception 'O texto de um contrato aprovado/assinado não pode ser alterado — volte para revisão' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trg_contracts_before before update on public.contracts for each row execute function app.contracts_before();

-- Contrato assinado → cliente ativo + serviços + recebíveis previstos + job de onboarding (projeto: Fase 2 seguinte)
create or replace function app.contracts_after() returns trigger language plpgsql security definer set search_path = public as $$
declare p public.proposals;
begin
  if new.status = 'assinado' and old.status is distinct from 'assinado' then
    select * into p from public.proposals where id = new.proposal_id;
    if p.activated_at is null then perform app.activate_proposal_core(p.id, new.starts_on); end if;
    update public.clients set status = 'ativo' where id = new.client_id;
    perform app.enqueue_job('contract.signed', jsonb_build_object('contract_id', new.id), now(), 'contract.signed:' || new.id);
    perform app.notify('Contrato #' || new.number || ' assinado', 'Cliente ativado e recebíveis previstos gerados. Inicie o onboarding.', '/contratos/' || new.id, 'info', null, null, 'contract.signed:' || new.id);
  end if;
  return null;
end $$;
create trigger trg_contracts_after after update on public.contracts for each row execute function app.contracts_after();

-- Alertas de vencimento/renovação/reajuste (chamado pelo worker)
create or replace function public.run_contract_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; today date := app.br_date(now());
begin
  for r in select id, number, title, ends_on from public.contracts where status = 'assinado' and ends_on between today and today + 30 loop
    perform app.notify('Contrato vence em ' || (r.ends_on - today) || ' dia(s)', r.title || ' — fim em ' || to_char(r.ends_on, 'DD/MM/YYYY') || '. Planeje renovação.', '/contratos/' || r.id, 'warning', null, null, 'contract.expiring:' || r.id || ':' || r.ends_on);
    n := n + 1;
  end loop;
  for r in select id, title, readjust_on from public.contracts where status = 'assinado' and readjust_on between today and today + 30 loop
    perform app.notify('Reajuste de contrato em ' || (r.readjust_on - today) || ' dia(s)', r.title, '/contratos/' || r.id, 'warning', null, null, 'contract.readjust:' || r.id || ':' || r.readjust_on);
    n := n + 1;
  end loop;
  return jsonb_build_object('contract_alerts', n);
end $$;

-- ---------- segurança ----------
alter table public.agency_settings enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
grant select, insert, update, delete on public.agency_settings, public.contract_templates, public.contracts to authenticated;
grant all on public.agency_settings, public.contract_templates, public.contracts to service_role;
revoke all on public.agency_settings, public.contract_templates, public.contracts from anon;
grant usage on sequence public.contract_number_seq to authenticated, service_role;

create policy agency_select on public.agency_settings for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy agency_update on public.agency_settings for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create policy ctpl_select on public.contract_templates for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy ctpl_write on public.contract_templates for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create policy contracts_select on public.contracts for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy contracts_write on public.contracts for update to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy contracts_delete on public.contracts for delete to authenticated using (app.has_role('admin') and status = 'rascunho');

revoke execute on function public.generate_contract(uuid, uuid), public.run_contract_scans() from public, anon;
grant execute on function public.generate_contract(uuid, uuid) to authenticated;
grant execute on function public.run_contract_scans() to service_role;
revoke execute on function app.generate_contract_core(uuid, uuid), app.activate_proposal_core(uuid, date) from public, anon, authenticated;

-- ======== 20261010000007_contract_services.sql ========
-- MUVENS OS — 0007: serviços adicionais (Design de posts, Consultoria), escolha/troca de modelo no contrato

alter table public.proposals drop constraint if exists proposals_template_check;
alter table public.proposals add constraint proposals_template_check
  check (template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','personalizado'));
alter table public.contract_templates drop constraint if exists contract_templates_service_template_check;
alter table public.contract_templates add constraint contract_templates_service_template_check
  check (service_template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','personalizado'));

-- novos modelos a partir do modelo-base já existente
insert into public.contract_templates (service_template, name, body)
select s, 'Modelo padrão', (select body from public.contract_templates where service_template = 'personalizado' order by name limit 1)
from unnest(array['design_posts','consultoria']) s
on conflict (service_template, name) do nothing;

alter table public.contracts add column service_template text;
update public.contracts c set service_template = t.service_template from public.contract_templates t where t.id = c.template_id;

-- variáveis do contrato (extraído para reuso na geração e na troca de modelo)
create or replace function app.contract_vars(p_proposal uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.proposals; c public.clients; a public.agency_settings; v_escopo text; v_entreg text; v_pay text;
begin
  select * into p from public.proposals where id = p_proposal;
  select * into c from public.clients where id = p.client_id;
  select * into a from public.agency_settings where id = 1;
  select coalesce(string_agg('- ' || description, E'\n' order by position), '') into v_escopo from public.proposal_items where proposal_id = p.id;
  v_escopo := v_escopo || coalesce(E'\n' || (select string_agg('- ' || x, E'\n') from jsonb_array_elements_text(coalesce(p.content->'escopo', '[]'::jsonb)) x), '');
  select string_agg('- ' || x, E'\n') into v_entreg from jsonb_array_elements_text(coalesce(p.content->'entregaveis', '[]'::jsonb)) x;
  v_pay := concat_ws(E'\n',
    case when p.subtotal_one_time > 0 then 'Parte pontual: ' || app.brl(greatest(p.subtotal_one_time - p.discount_value, 0)) || ' em ' || p.installments || ' parcela(s).' end,
    case when p.subtotal_monthly > 0 then 'Mensalidade: ' || app.brl(p.subtotal_monthly) || ' por ' || p.contract_months || ' meses.' end,
    nullif(btrim(p.payment_terms), ''));
  return jsonb_build_object(
    'servico', p.title, 'contratante_nome', coalesce(nullif(c.legal_name, ''), c.name, p.client_display_name), 'contratante_documento', c.document, 'contratante_endereco', c.address,
    'contratada_nome', coalesce(a.legal_name, a.trade_name), 'contratada_documento', a.document, 'contratada_endereco', a.address,
    'contratada_representante', concat_ws(', ', a.representative_name, a.representative_role),
    'escopo', v_escopo, 'entregaveis', v_entreg, 'prazo_execucao', p.content->>'cronograma',
    'valor_total', app.brl(p.total_value), 'forma_pagamento', v_pay, 'vigencia', p.contract_months || ' meses, contados da data de início',
    'reajuste', '', 'cidade', a.city, 'data', to_char(app.br_date(now()), 'DD/MM/YYYY'));
end $$;

create or replace function app.generate_contract_core(p_proposal uuid, p_template uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.proposals; t public.contract_templates; v_id uuid;
begin
  select id into v_id from public.contracts where proposal_id = p_proposal and status <> 'cancelado';
  if v_id is not null then return v_id; end if;
  select * into p from public.proposals where id = p_proposal;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if p.status <> 'aceita' then raise exception 'Só é possível gerar contrato de proposta aceita' using errcode = '23514'; end if;
  if p_template is not null then select * into t from public.contract_templates where id = p_template and active;
  else select * into t from public.contract_templates where service_template = p.template and active order by name limit 1; end if;
  if t.id is null then select * into t from public.contract_templates where service_template = 'personalizado' and active order by name limit 1; end if;
  if t.id is null then raise exception 'Nenhum modelo de contrato ativo' using errcode = '23514'; end if;
  insert into public.contracts (proposal_id, client_id, template_id, service_template, title, body, total_value, contract_months, created_by)
  values (p.id, p.client_id, t.id, t.service_template, 'Contrato — ' || p.title, app.render_template(t.body, app.contract_vars(p.id)), p.total_value, p.contract_months, auth.uid())
  returning id into v_id;
  perform app.notify('Rascunho de contrato gerado', 'Proposta #' || p.number || ' (' || p.client_display_name || '): revise e aprove o contrato.', '/contratos/' || v_id, 'info', null, null, 'contract.draft:' || v_id);
  return v_id;
end $$;

-- Troca o modelo (serviço) enquanto o contrato ainda é rascunho/em revisão: regera o texto.
create or replace function public.change_contract_template(p_contract uuid, p_template uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contracts; t public.contract_templates;
begin
  if not app.has_role('admin','comercial') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status not in ('rascunho','em_revisao') then raise exception 'O modelo só pode ser trocado em rascunho ou revisão' using errcode = '23514'; end if;
  select * into t from public.contract_templates where id = p_template and active;
  if not found then raise exception 'Modelo não encontrado ou inativo' using errcode = '23514'; end if;
  update public.contracts set template_id = t.id, service_template = t.service_template, body = app.render_template(t.body, app.contract_vars(c.proposal_id)) where id = c.id;
end $$;

revoke execute on function public.change_contract_template(uuid, uuid) from public, anon;
grant execute on function public.change_contract_template(uuid, uuid) to authenticated;
revoke execute on function app.contract_vars(uuid) from public, anon, authenticated;

-- ======== 20261011000008_projects.sql ========
-- MUVENS OS — Fase 2 / Projetos, tarefas, entregáveis, horas, aprovação, onboarding

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  name        text not null,
  status      text not null default 'planejamento' check (status in ('planejamento','em_andamento','pausado','concluido','cancelado')),
  starts_on   date, due_on date,
  owner_id    uuid references public.profiles(id) on delete set null,
  notes       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);
create unique index projects_contract_uidx on public.projects (contract_id) where contract_id is not null;
create trigger trg_projects_touch before update on public.projects for each row execute function app.touch_updated_at();
create trigger trg_projects_audit after insert or update or delete on public.projects for each row execute function app.audit();

-- Entregáveis contratados (ex.: 12 posts em 2026-11)
create table public.deliverable_plans (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  name         text not null,
  period_month date not null check (extract(day from period_month) = 1),
  quantity     int not null check (quantity > 0),
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (client_id, name, period_month)
);

create table public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  deliverable_plan_id  uuid references public.deliverable_plans(id) on delete set null,
  title                text not null,
  briefing             text,
  assignee_id          uuid references public.profiles(id) on delete set null,
  due_on               date,
  priority             text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  status               text not null default 'a_fazer' check (status in ('a_fazer','em_andamento','produzido','enviado','ajustes','aprovado','entregue','cancelada')),
  out_of_scope         boolean not null default false,
  out_of_scope_note    text,
  completed_at         timestamptz,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id) where status not in ('entregue','cancelada');
create index tasks_due_idx on public.tasks (due_on) where status not in ('entregue','cancelada');
create index tasks_plan_idx on public.tasks (deliverable_plan_id);
create trigger trg_tasks_touch before update on public.tasks for each row execute function app.touch_updated_at();

create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null, detail text, actor_id uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at desc);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  text text not null, done boolean not null default false, position int not null default 0
);
create index task_checklist_task_idx on public.task_checklist_items (task_id, position);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id), body text not null check (length(btrim(body)) > 0), created_at timestamptz not null default now()
);
create table public.task_files (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  path text not null, name text not null, size bigint, uploaded_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create table public.time_entries (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  minutes int not null check (minutes > 0 and minutes <= 1440), worked_on date not null default current_date, note text, created_at timestamptz not null default now()
);
create index time_entries_task_idx on public.time_entries (task_id);
create index time_entries_day_idx on public.time_entries (worked_on);
-- custo/hora: dado sensível, tabela própria (só admin/financeiro)
create table public.staff_rates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_cost numeric(10,2) not null check (hourly_cost >= 0), updated_at timestamptz not null default now()
);

-- ---------- regras ----------
create or replace function app.tasks_before() returns trigger language plpgsql as $$
declare v_qty int; v_used int;
begin
  if tg_op = 'INSERT' then
    -- passou do contratado → serviço fora do escopo (marcado automaticamente; pode ser ajustado pela equipe)
    if new.deliverable_plan_id is not null and not new.out_of_scope then
      select quantity into v_qty from public.deliverable_plans where id = new.deliverable_plan_id;
      select count(*) into v_used from public.tasks where deliverable_plan_id = new.deliverable_plan_id and not out_of_scope and status <> 'cancelada';
      if v_used >= v_qty then
        new.out_of_scope := true;
        new.out_of_scope_note := coalesce(new.out_of_scope_note, 'Excede a quantidade contratada (' || v_qty || ') — orçar à parte');
      end if;
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'enviado' and old.status not in ('produzido','ajustes') then raise exception 'Só é possível enviar ao cliente uma peça já produzida' using errcode = '23514'; end if;
    if new.status = 'ajustes' and old.status <> 'enviado' then raise exception 'Ajustes só podem ser pedidos sobre uma peça enviada ao cliente' using errcode = '23514'; end if;
    if new.status = 'aprovado' and old.status <> 'enviado' then raise exception 'Só é possível aprovar uma peça enviada ao cliente' using errcode = '23514'; end if;
    if new.status = 'entregue' and old.status <> 'aprovado' then raise exception 'Só é possível entregar uma peça aprovada' using errcode = '23514'; end if;
    if old.status in ('entregue','cancelada') and current_user in ('authenticated','anon') and not app.has_role('admin') then
      raise exception 'Apenas administradores reabrem tarefas entregues/canceladas' using errcode = '42501';
    end if;
    new.completed_at := case when new.status = 'entregue' then now() end;
  end if;
  return new;
end $$;
create trigger trg_tasks_before before insert or update on public.tasks for each row execute function app.tasks_before();

create or replace function app.tasks_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'criada', new.title, auth.uid());
    if new.out_of_scope then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'fora_escopo', new.out_of_scope_note, auth.uid()); end if;
  else
    if new.status is distinct from old.status then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'status', old.status || ' → ' || new.status, auth.uid()); end if;
    if new.assignee_id is distinct from old.assignee_id then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'responsavel', coalesce((select full_name from public.profiles where id = new.assignee_id), 'sem responsável'), auth.uid()); end if;
    if new.due_on is distinct from old.due_on then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'prazo', coalesce(to_char(old.due_on, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(new.due_on, 'DD/MM/YYYY'), '—'), auth.uid()); end if;
    if new.priority is distinct from old.priority then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'prioridade', old.priority || ' → ' || new.priority, auth.uid()); end if;
    if new.out_of_scope is distinct from old.out_of_scope then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'fora_escopo', case when new.out_of_scope then 'Marcada como fora do escopo' else 'Voltou ao escopo' end, auth.uid()); end if;
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null and new.assignee_id is distinct from auth.uid() then
      perform app.notify('Tarefa atribuída a você', new.title, '/projetos/tarefas/' || new.id, 'info', null, new.assignee_id, 'task.assigned:' || new.id || ':' || new.assignee_id);
    end if;
  end if;
  return null;
end $$;
create trigger trg_tasks_after after insert or update on public.tasks for each row execute function app.tasks_after();

-- Progresso dos entregáveis contratados (apenas tarefas dentro do escopo; fora do escopo contadas à parte)
create view public.deliverable_progress with (security_invoker = true) as
select p.id, p.client_id, p.project_id, p.name, p.period_month, p.quantity,
  count(t.id) filter (where not t.out_of_scope and t.status in ('em_andamento','produzido','enviado','ajustes','aprovado','entregue')) as iniciados,
  count(t.id) filter (where not t.out_of_scope and t.status in ('produzido','enviado','ajustes','aprovado','entregue')) as produzidos,
  count(t.id) filter (where not t.out_of_scope and t.status in ('enviado','ajustes','aprovado','entregue')) as enviados,
  count(t.id) filter (where not t.out_of_scope and t.status in ('aprovado','entregue')) as aprovados,
  count(t.id) filter (where not t.out_of_scope and t.status = 'entregue') as entregues,
  count(t.id) filter (where t.out_of_scope and t.status <> 'cancelada') as fora_escopo
from public.deliverable_plans p left join public.tasks t on t.deliverable_plan_id = p.id
group by p.id;

-- Onboarding automático ao assinar o contrato (tarefas genéricas; sem prazos nem promessas)
create or replace function app.create_onboarding(p_contract uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare c public.contracts; v_proj uuid; v_name text; i int; v_titles text[] := array['Reunião de kickoff com o cliente','Coletar acessos e materiais da marca','Enviar briefing inicial ao cliente','Definir calendário de produção do 1º mês'];
begin
  select * into c from public.contracts where id = p_contract;
  if c.client_id is null then return null; end if;
  select id into v_proj from public.projects where contract_id = c.id;
  if v_proj is not null then return v_proj; end if;
  select name into v_name from public.clients where id = c.client_id;
  insert into public.projects (client_id, contract_id, name, status, starts_on, notes) values (c.client_id, c.id, 'Onboarding — ' || v_name, 'em_andamento', c.starts_on, 'Criado automaticamente pela assinatura do contrato #' || c.number) returning id into v_proj;
  for i in 1..array_length(v_titles, 1) loop insert into public.tasks (project_id, title, priority) values (v_proj, v_titles[i], 'alta'); end loop;
  perform app.notify('Onboarding criado: ' || v_name, 'Projeto inicial com 4 tarefas. Defina responsáveis e prazos.', '/projetos/' || v_proj, 'info', null, null, 'onboarding:' || v_proj);
  return v_proj;
end $$;
create or replace function app.contracts_onboarding() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'assinado' and old.status is distinct from 'assinado' then perform app.create_onboarding(new.id); end if;
  return null;
end $$;
create trigger trg_contracts_onboarding after update on public.contracts for each row execute function app.contracts_onboarding();

-- Alertas de atraso (chamado pelo worker)
create or replace function public.run_project_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; today date := app.br_date(now());
begin
  for r in select t.id, t.title, t.assignee_id, t.due_on, p.name as pname from public.tasks t join public.projects p on p.id = t.project_id
           where t.due_on < today and t.status in ('a_fazer','em_andamento','produzido','ajustes') and p.status not in ('cancelado','concluido') loop
    perform app.notify('Tarefa atrasada: ' || r.title, r.pname || ' — prazo ' || to_char(r.due_on, 'DD/MM/YYYY'), '/projetos/tarefas/' || r.id, 'warning',
                       case when r.assignee_id is null then 'admin' end, r.assignee_id, 'task.late:' || r.id || ':' || to_char(today, 'IYYY-IW'));
    n := n + 1;
  end loop;
  return jsonb_build_object('late_tasks', n);
end $$;

-- Rentabilidade por cliente (receita recebida − horas × custo/hora). Só admin/financeiro.
create or replace function public.client_profitability(p_from date, p_to date)
returns table (client_id uuid, client_name text, received numeric, minutes bigint, minutes_without_rate bigint, labor_cost numeric, margin numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('admin','financeiro') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query
  with rec as (select f.client_id, sum(f.paid_amount) as v from public.fin_transactions f where f.direction = 'in' and f.status = 'liquidado' and app.br_date(f.paid_at) between p_from and p_to and f.client_id is not null group by 1),
       lab as (select pr.client_id, sum(te.minutes) as m, sum(te.minutes) filter (where sr.user_id is null) as m_nr, sum(te.minutes / 60.0 * coalesce(sr.hourly_cost, 0)) as cost
               from public.time_entries te join public.tasks t on t.id = te.task_id join public.projects pr on pr.id = t.project_id left join public.staff_rates sr on sr.user_id = te.user_id
               where te.worked_on between p_from and p_to group by 1)
  select c.id, c.name, coalesce(rec.v, 0), coalesce(lab.m, 0)::bigint, coalesce(lab.m_nr, 0)::bigint, round(coalesce(lab.cost, 0), 2), round(coalesce(rec.v, 0) - coalesce(lab.cost, 0), 2)
  from public.clients c left join rec on rec.client_id = c.id left join lab on lab.client_id = c.id
  where rec.v is not null or lab.m is not null order by 7 desc;
end $$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['projects','deliverable_plans','tasks','task_events','task_checklist_items','task_comments','task_files','time_entries','staff_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant select on public.deliverable_progress to authenticated;
grant all on public.deliverable_progress to service_role;
revoke all on public.deliverable_progress from anon;
grant usage on all sequences in schema public to authenticated, service_role;

create policy projects_select on public.projects for select to authenticated using (app.is_staff());
create policy projects_write on public.projects for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy plans_select on public.deliverable_plans for select to authenticated using (app.is_staff());
create policy plans_write on public.deliverable_plans for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy tasks_select on public.tasks for select to authenticated using (app.is_staff());
create policy tasks_write on public.tasks for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy tevents_select on public.task_events for select to authenticated using (app.is_staff());
create policy checklist_select on public.task_checklist_items for select to authenticated using (app.is_staff());
create policy checklist_write on public.task_checklist_items for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy tcomments_select on public.task_comments for select to authenticated using (app.is_staff());
create policy tcomments_insert on public.task_comments for insert to authenticated with check (app.has_role('admin','comercial','designer','trafego') and author_id = auth.uid());
create policy tcomments_delete on public.task_comments for delete to authenticated using (author_id = auth.uid() or app.has_role('admin'));
create policy tfiles_select on public.task_files for select to authenticated using (app.is_staff());
create policy tfiles_write on public.task_files for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy time_select on public.time_entries for select to authenticated using (app.is_staff());
create policy time_insert on public.time_entries for insert to authenticated with check (app.has_role('admin','comercial','designer','trafego') and user_id = auth.uid());
create policy time_modify on public.time_entries for update to authenticated using (user_id = auth.uid() or app.has_role('admin')) with check (user_id = auth.uid() or app.has_role('admin'));
create policy time_delete on public.time_entries for delete to authenticated using (user_id = auth.uid() or app.has_role('admin'));
create policy rates_all on public.staff_rates for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));

revoke execute on function public.run_project_scans(), public.client_profitability(date, date) from public, anon;
grant execute on function public.run_project_scans() to service_role;
grant execute on function public.client_profitability(date, date) to authenticated;
revoke execute on function app.create_onboarding(uuid) from public, anon, authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('task-files', 'task-files', false) on conflict (id) do nothing;
    execute $p$create policy "task files read" on storage.objects for select to authenticated using (bucket_id = 'task-files' and app.is_staff())$p$;
    execute $p$create policy "task files write" on storage.objects for insert to authenticated with check (bucket_id = 'task-files' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "task files delete" on storage.objects for delete to authenticated using (bucket_id = 'task-files' and app.has_role('admin','comercial','designer','trafego'))$p$;
  end if;
end $$;

-- ======== 20261012000009_brand_center.sql ========
-- MUVENS OS — Fase 2 / Brand Center (identidade visual por cliente) e base de conhecimento para a IA

create table public.brand_profiles (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  tone_of_voice    text,
  design_rules     text,
  restrictions     text,          -- restrições de aplicação (o que NÃO fazer)
  ai_instructions  text,          -- instruções específicas para a IA/briefings desta marca
  updated_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);
create table public.brand_colors (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null default 'primaria' check (role in ('primaria','secundaria','apoio','neutra')),
  position int not null default 0
);
create index brand_colors_client_idx on public.brand_colors (client_id, position);
create table public.brand_fonts (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, usage text not null default 'texto' check (usage in ('titulo','texto','destaque')), source_url text,
  position int not null default 0
);
create index brand_fonts_client_idx on public.brand_fonts (client_id);
create table public.brand_links (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null default 'outro' check (kind in ('figma','drive','outro')), label text not null,
  url text not null check (url ~* '^https?://')
);
create index brand_links_client_idx on public.brand_links (client_id);
create table public.brand_assets (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('logo','variacao','kv','brandbook','foto','elemento','template','referencia','editavel','outro')),
  name text not null, description text, tags text[] not null default '{}',
  path text not null unique, size bigint, mime text,
  downloadable boolean not null default true,     -- false = só administrador baixa (download autorizado)
  uploaded_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create index brand_assets_client_idx on public.brand_assets (client_id, category);
create index brand_assets_search_idx on public.brand_assets (lower(name));

create trigger trg_brand_profiles_audit after insert or update or delete on public.brand_profiles for each row execute function app.audit();
create or replace function app.brand_profiles_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
create trigger trg_brand_profiles_touch before insert or update on public.brand_profiles for each row execute function app.brand_profiles_touch();
create trigger trg_brand_assets_audit after insert or update or delete on public.brand_assets for each row execute function app.audit();

-- Base de conhecimento da marca para a IA (Fase 4): regras criativas + paleta + tipografia + links + inventário de arquivos.
-- security invoker: respeita a permissão de quem consulta.
create or replace function public.brand_knowledge(p_client uuid) returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'client', (select name from public.clients where id = p_client),
    'tone_of_voice', (select tone_of_voice from public.brand_profiles where client_id = p_client),
    'design_rules', (select design_rules from public.brand_profiles where client_id = p_client),
    'restrictions', (select restrictions from public.brand_profiles where client_id = p_client),
    'ai_instructions', (select ai_instructions from public.brand_profiles where client_id = p_client),
    'colors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'hex', hex, 'role', role) order by position) from public.brand_colors where client_id = p_client), '[]'::jsonb),
    'fonts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'usage', usage) order by position) from public.brand_fonts where client_id = p_client), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'url', url)) from public.brand_links where client_id = p_client), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'name', name, 'description', description, 'tags', tags)) from public.brand_assets where client_id = p_client), '[]'::jsonb))
$$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['brand_profiles','brand_colors','brand_fonts','brand_links','brand_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_role(''admin'',''comercial'',''designer'',''trafego''))', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.has_role(''admin'',''comercial'',''designer'')) with check (app.has_role(''admin'',''comercial'',''designer''))', t || '_write', t);
  end loop;
end $$;
revoke execute on function public.brand_knowledge(uuid) from public, anon;
grant execute on function public.brand_knowledge(uuid) to authenticated, service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('brand-assets', 'brand-assets', false, 52428800) on conflict (id) do nothing;
    execute $p$create policy "brand assets read" on storage.objects for select to authenticated using (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "brand assets write" on storage.objects for insert to authenticated with check (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer'))$p$;
    execute $p$create policy "brand assets delete" on storage.objects for delete to authenticated using (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer'))$p$;
  end if;
end $$;

-- ======== 20261013000010_client_portal.sql ========
-- MUVENS OS — Fase 2 / Portal do Cliente
-- Princípio: usuários 'cliente' NÃO têm acesso direto a nenhuma tabela interna (RLS os exclui). Todo acesso passa por funções
-- security definer que (1) exigem papel 'cliente' ativo com client_id, (2) filtram pelo client_id do usuário e (3) devolvem só
-- colunas/itens liberados pela equipe (projeto visível, tarefa não interna, arquivo marcado como visível).

-- Remove a leitura direta da ficha do cliente pelo próprio cliente (continha observações internas)
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (app.is_staff());

alter table public.projects add column client_visible boolean not null default false;
alter table public.tasks add column internal boolean not null default false;
alter table public.task_files add column client_visible boolean not null default false;
alter table public.task_comments add column from_client boolean not null default false;

create table public.client_requests (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('briefing','alteracao','atendimento')),
  subject text not null check (length(btrim(subject)) between 3 and 200), body text not null check (length(btrim(body)) between 3 and 8000),
  status text not null default 'aberta' check (status in ('aberta','em_andamento','resolvida')),
  response text, responded_by uuid references public.profiles(id), responded_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create index client_requests_client_idx on public.client_requests (client_id, created_at desc);
create table public.client_documents (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  category text not null default 'documento' check (category in ('documento','arquivo_final','relatorio')),
  name text not null, path text not null unique, size bigint,
  uploaded_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create index client_documents_client_idx on public.client_documents (client_id, created_at desc);
create trigger trg_client_requests_audit after insert or update on public.client_requests for each row execute function app.audit();
create trigger trg_client_documents_audit after insert or update or delete on public.client_documents for each row execute function app.audit();

do $$ declare t text; begin
  foreach t in array array['client_requests','client_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy creq_select on public.client_requests for select to authenticated using (app.has_role('admin','comercial'));
create policy creq_update on public.client_requests for update to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy cdoc_select on public.client_documents for select to authenticated using (app.is_staff());
create policy cdoc_write on public.client_documents for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));

-- ---------- funções do portal ----------
create or replace function app.portal_client() returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.current_client_id();
begin
  if v is null then raise exception 'Acesso restrito a clientes' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.portal_overview() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return jsonb_build_object(
    'client_name', (select name from public.clients where id = v),
    'projects_active', (select count(*) from public.projects where client_id = v and client_visible and status in ('planejamento','em_andamento')),
    'awaiting_approval', (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = v and p.client_visible and not t.internal and t.status = 'enviado'),
    'open_requests', (select count(*) from public.client_requests where client_id = v and status <> 'resolvida'),
    'next_deadlines', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', t.id, 'title', t.title, 'due_on', t.due_on, 'status', t.status, 'project', p.name) x
        from public.tasks t join public.projects p on p.id = t.project_id
        where p.client_id = v and p.client_visible and not t.internal and t.due_on is not null and t.status not in ('entregue','aprovado','cancelada')
        order by t.due_on limit 5) s), '[]'::jsonb));
end $$;

create or replace function public.portal_projects() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'due_on', p.due_on,
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due_on', t.due_on) order by t.due_on nulls last, t.created_at)
                         from public.tasks t where t.project_id = p.id and not t.internal and t.status <> 'cancelada'), '[]'::jsonb)) order by p.created_at desc)
    from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb);
end $$;

create or replace function public.portal_approvals() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project', p.name, 'due_on', t.due_on,
      'description', t.briefing_public,
      'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb)) order by t.due_on nulls last)
    from public.tasks t join public.projects p on p.id = t.project_id
    where p.client_id = v and p.client_visible and not t.internal and t.status = 'enviado'), '[]'::jsonb);
end $$;

create or replace function public.portal_decide(p_task uuid, p_decision text, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := app.portal_client(); v_task public.tasks; v_proj_name text; v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if p_decision not in ('aprovar','ajustes') then raise exception 'Decisão inválida' using errcode = '22023'; end if;
  if p_decision = 'ajustes' and v_comment is null then raise exception 'Descreva os ajustes desejados' using errcode = '22023'; end if;
  select tk.* into v_task from public.tasks tk join public.projects pr on pr.id = tk.project_id
   where tk.id = p_task and pr.client_id = v and pr.client_visible and not tk.internal for update of tk;
  if not found then raise exception 'Item não encontrado' using errcode = '42501'; end if;
  if v_task.status <> 'enviado' then raise exception 'Este item não está aguardando aprovação' using errcode = '23514'; end if;
  update public.tasks set status = case p_decision when 'aprovar' then 'aprovado' else 'ajustes' end where id = v_task.id;
  if v_comment is not null then insert into public.task_comments (task_id, author_id, body, from_client) values (v_task.id, auth.uid(), v_comment, true); end if;
  select name into v_proj_name from public.projects where id = v_task.project_id;
  perform app.notify(case p_decision when 'aprovar' then 'Cliente aprovou: ' else 'Cliente pediu ajustes: ' end || v_task.title, coalesce(v_comment, v_proj_name), '/projetos/tarefas/' || v_task.id,
                     case p_decision when 'aprovar' then 'info' else 'warning' end, case when v_task.assignee_id is null then 'comercial' end, v_task.assignee_id, null);
end $$;

create or replace function public.portal_requests() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'subject', subject, 'body', body, 'status', status, 'response', response, 'created_at', created_at, 'responded_at', responded_at) order by created_at desc)
                   from public.client_requests where client_id = v), '[]'::jsonb);
end $$;

create or replace function public.portal_create_request(p_kind text, p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := app.portal_client(); v_id uuid;
begin
  insert into public.client_requests (client_id, kind, subject, body, created_by) values (v, p_kind, btrim(p_subject), btrim(p_body), auth.uid()) returning id into v_id;
  perform app.notify('Nova solicitação do cliente: ' || btrim(p_subject), (select name from public.clients where id = v) || ' — ' || left(btrim(p_body), 200), '/portal', 'info', 'comercial', null, 'client.request:' || v_id);
  return v_id;
end $$;

create or replace function public.portal_documents() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
      select jsonb_build_object('kind', 'doc', 'id', d.id, 'name', d.name, 'category', d.category, 'created_at', d.created_at) x from public.client_documents d where d.client_id = v
      union all
      select jsonb_build_object('kind', 'task', 'id', f.id, 'name', f.name, 'category', 'arquivo_final', 'context', t.title, 'created_at', f.created_at)
        from public.task_files f join public.tasks t on t.id = f.task_id join public.projects p on p.id = t.project_id
       where p.client_id = v and p.client_visible and not t.internal and f.client_visible and t.status in ('aprovado','entregue')) u), '[]'::jsonb);
end $$;

-- Autoriza um download e devolve onde está o arquivo (o servidor então gera a URL assinada)
create or replace function public.portal_file_path(p_kind text, p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client(); r record;
begin
  if p_kind = 'doc' then
    select path, name into r from public.client_documents where id = p_id and client_id = v;
    if found then return jsonb_build_object('bucket', 'client-docs', 'path', r.path, 'name', r.name); end if;
  elsif p_kind = 'task' then
    select f.path, f.name, t.status into r from public.task_files f join public.tasks t on t.id = f.task_id join public.projects p on p.id = t.project_id
     where f.id = p_id and p.client_id = v and p.client_visible and not t.internal and f.client_visible and t.status in ('enviado','aprovado','entregue');
    if found then return jsonb_build_object('bucket', 'task-files', 'path', r.path, 'name', r.name); end if;
  end if;
  raise exception 'Arquivo não encontrado' using errcode = '42501';
end $$;

create or replace function public.portal_proposals() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('number', number, 'title', title, 'status', status, 'total_value', total_value, 'valid_until', valid_until, 'token', token) order by number desc)
                   from public.proposals where client_id = v and status <> 'rascunho'), '[]'::jsonb);
end $$;
create or replace function public.portal_contracts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'title', title, 'status', status, 'starts_on', starts_on, 'ends_on', ends_on, 'signed_at', signed_at) order by number desc)
                   from public.contracts where client_id = v and status in ('enviado_assinatura','assinado')), '[]'::jsonb);
end $$;
create or replace function public.portal_contract(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client(); r record;
begin
  select id, number, title, status, body, starts_on, ends_on, signed_at into r from public.contracts where id = p_id and client_id = v and status in ('enviado_assinatura','assinado');
  if not found then raise exception 'Contrato não encontrado' using errcode = '42501'; end if;
  return to_jsonb(r);
end $$;

-- descrição para o cliente (separada do briefing interno)
alter table public.tasks add column briefing_public text;

do $$ declare f text; begin
  foreach f in array array['portal_overview()','portal_projects()','portal_approvals()','portal_decide(uuid,text,text)','portal_requests()','portal_create_request(text,text,text)','portal_documents()','portal_file_path(text,uuid)','portal_proposals()','portal_contracts()','portal_contract(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function app.portal_client() from public, anon, authenticated;
grant execute on function app.portal_client() to authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('client-docs', 'client-docs', false, 52428800) on conflict (id) do nothing;
    execute $p$create policy "client docs read" on storage.objects for select to authenticated using (bucket_id = 'client-docs' and app.is_staff())$p$;
    execute $p$create policy "client docs write" on storage.objects for insert to authenticated with check (bucket_id = 'client-docs' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "client docs delete" on storage.objects for delete to authenticated using (bucket_id = 'client-docs' and app.has_role('admin','comercial','designer','trafego'))$p$;
  end if;
end $$;

-- ======== 20261014000011_prospecting.sql ========
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

-- ======== 20261015000012_prospect_report_link.sql ========
-- MUVENS OS — 0012 Link público do diagnóstico do prospecto (sem login, por token difícil de adivinhar)
alter table public.prospects add column report_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update public.prospects set report_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where report_token is null;
alter table public.prospects alter column report_token set not null;

-- Devolve apenas dados da análise pública (nunca e-mail, telefone, notas ou histórico). Nulo se não existir, não foi analisado ou foi descartado/descadastrado.
create or replace function public.public_prospect_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'category', p.category, 'website', p.website, 'rating', p.rating, 'reviews_count', p.reviews_count,
    'score', p.score, 'recommended_service', p.recommended_service, 'analyzed_at', p.analyzed_at,
    'site', p.analysis->'site', 'observations', coalesce(p.analysis->'observations', '[]'::jsonb))
  from public.prospects p
  where p.report_token = p_token and p.analyzed_at is not null and p.analysis is not null and p.status <> 'descartado'
$$;
revoke execute on function public.public_prospect_report(text) from public;
grant execute on function public.public_prospect_report(text) to anon, authenticated;
