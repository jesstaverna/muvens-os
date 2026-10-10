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
