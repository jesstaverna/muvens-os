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
