-- MUVENS OS — setup completo (migrações concatenadas). Cole no Supabase > SQL Editor e clique em Run. Execute UMA vez, em projeto vazio. NÃO use junto com a integração GitHub.

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
