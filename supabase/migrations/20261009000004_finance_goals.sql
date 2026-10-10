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
