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
