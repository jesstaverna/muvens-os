-- Testes de regras de negócio, RLS e fluxos principais. Falha (exceção) = teste quebrado.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text default null) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO e nada ocorreu: %', sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if code is not null and sqlstate <> code then raise exception 'Erro % diferente de %: % (sql: %)', sqlstate, code, sqlerrm, sql; end if;
end $$;

-- ===== usuários (primeiro vira admin; demais entram sem acesso) =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@muvens.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'comercial@muvens.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'financeiro@muvens.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'designer@muvens.test');
do $$ begin
  assert (select role from profiles where email = 'admin@muvens.test') = 'admin', 'primeiro usuário deve ser admin';
  assert (select role from profiles where email = 'comercial@muvens.test') = 'cliente', 'demais entram como cliente sem acesso';
end $$;
update profiles set role = 'comercial'  where email = 'comercial@muvens.test';
update profiles set role = 'financeiro' where email = 'financeiro@muvens.test';
update profiles set role = 'designer'   where email = 'designer@muvens.test';

-- ===== anti-escalada de privilégio =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_error($$update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a2'$$, '42501');
update profiles set full_name = 'Comercial Teste' where id = auth.uid();   -- nome pode
reset role;

-- ===== CRM: duplicidade e motivo de perda =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into leads (name, company, email, whatsapp, potential_value, stage_id, owner_id, service_interest)
  select 'Maria Silva', 'Padaria Pão Bom', 'Maria@PaoBom.com', '(11) 98888-7777', 5000, id, auth.uid(), 'Gestão de redes sociais'
  from pipeline_stages where name = 'Novo Lead';
select pg_temp.expect_error($$insert into leads (name, email, stage_id) select 'Outra', ' maria@paobom.com ', id from pipeline_stages where name='Novo Lead'$$, '23505');
select pg_temp.expect_error($$insert into leads (name, phone, stage_id) select 'Outra', '+55 11 98888-7777', id from pipeline_stages where name='Novo Lead'$$, '23505');
select pg_temp.expect_error($$insert into leads (name, stage_id) select 'Sem contato', id from pipeline_stages where name='Novo Lead'$$, '23514');
select pg_temp.expect_error($$update leads set stage_id = (select id from pipeline_stages where kind='lost')$$, '23514');
update leads set stage_id = (select id from pipeline_stages where kind='lost'), lost_reason = 'Preço' ;
update leads set stage_id = (select id from pipeline_stages where name='Qualificação');
do $$ begin assert (select lost_reason from leads) is null and (select closed_at from leads) is null, 'reabrir limpa motivo/fechamento'; end $$;
insert into lead_interactions (lead_id, kind, content, created_by) select id, 'whatsapp', 'Primeiro contato', auth.uid() from leads;
do $$ begin assert (select last_contact_at from leads) is not null, 'interação atualiza último contato'; end $$;
reset role;

-- RLS: designer e financeiro não veem leads; anon não vê nada
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin assert (select count(*) from leads) = 0, 'designer não vê leads'; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin assert (select count(*) from leads) = 0, 'financeiro não vê leads'; end $$;
reset role;
set role anon; reset request.jwt.claim.sub;
select pg_temp.expect_error($$select * from leads$$, '42501');
select pg_temp.expect_error($$select * from proposals$$, '42501');
reset role;

-- ===== Propostas =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into proposals (title, template, lead_id, client_display_name, installments, contract_months, valid_until, owner_id, created_by)
  select 'Gestão de redes sociais', 'redes_sociais', id, 'Padaria Pão Bom', 2, 6, current_date + 15, auth.uid(), auth.uid() from leads;
insert into proposal_items (proposal_id, description, billing, quantity, unit_price, position)
  select id, 'Setup e identidade de conteúdo', 'pontual', 1, 1500, 1 from proposals
  union all select id, 'Gestão de redes (12 posts/mês)', 'mensal', 1, 2000, 2 from proposals;
do $$ declare p proposals; begin
  select * into p from proposals;
  assert p.subtotal_one_time = 1500 and p.subtotal_monthly = 2000, 'subtotais';
  assert p.total_value = 1500 + 2000 * 6, 'total = pontual + mensal×vigência';
end $$;
select pg_temp.expect_error($$update proposals set discount_value = 500$$, '42501');   -- comercial não dá desconto
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update proposals set discount_value = 500;
do $$ declare p proposals; begin
  select * into p from proposals;
  assert p.discount_authorized_by = '00000000-0000-0000-0000-0000000000a1', 'desconto registra quem autorizou';
  assert p.total_value = 13000, 'total com desconto: ' || p.total_value;
end $$;
select pg_temp.expect_error($$update proposals set discount_value = 999999$$, '23514');
select public.proposal_snapshot((select id from proposals), 'v1 enviada ao cliente');
do $$ begin assert (select count(*) from proposal_versions) = 1 and (select version from proposals) = 1, 'snapshot'; end $$;
update proposals set status = 'enviada';
do $$ begin
  assert (select s.name from leads l join pipeline_stages s on s.id = l.stage_id) = 'Proposta Enviada', 'enviar proposta move lead';
  assert (select sent_at from proposals) is not null;
end $$;
reset role;

-- link público (anon)
set role anon;
do $$ declare t text; r jsonb; begin
  reset role; select token into t from proposals; set role anon;
  assert public.proposal_public_open('token-inexistente') is null, 'token inválido → null';
  r := public.proposal_public_open(t);
  assert r->>'title' = 'Gestão de redes sociais' and (r->>'total_value')::numeric = 13000, 'proposta pública';
  assert not (r ? 'token') and not (r ? 'discount_authorized_by'), 'não vaza campos internos';
  assert public.proposal_public_request_changes(t, 'Maria', 'Podemos reduzir para 8 posts?') = true, 'solicitar alteração';
  assert public.proposal_public_accept(t, 'Maria Silva', 'maria@paobom.com') = true, 'aceite em negociação';
  assert public.proposal_public_accept(t, 'Maria Silva', 'maria@paobom.com') = false, 'segundo aceite não repete';
  begin perform public.proposal_public_accept(t, '', 'x'); assert false, 'validação de aceite'; exception when sqlstate '22023' then null; end;
end $$;
reset role;
do $$ declare p proposals; begin
  select * into p from proposals;
  assert p.status = 'aceita' and p.accepted_by_name = 'Maria Silva' and p.accepted_at is not null, 'registro do aceite';
  assert p.view_count = 1 and p.first_viewed_at is not null, 'visualização registrada';
  assert p.client_id is not null, 'cliente criado automaticamente a partir do lead';
  assert (select client_id from leads) = p.client_id, 'lead vinculado ao cliente';
  assert (select s.kind from leads l join pipeline_stages s on s.id = l.stage_id) = 'won', 'lead movido para Fechado';
  assert (select count(*) from jobs where type = 'proposal.accepted') = 1, 'job de contrato enfileirado';
  assert (select count(*) from notifications where dedupe_key like 'proposal.accepted:%') = 1, 'notificação de aceite';
  assert exists (select 1 from proposal_events where kind = 'alteracao_solicitada'), 'histórico de negociação';
  assert exists (select 1 from proposal_events where kind = 'visualizada'), 'evento de visualização';
  assert exists (select 1 from audit_log where table_name = 'proposals'), 'auditoria';
end $$;

-- ===== Ativação (financeiro/admin) =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_error($$select public.activate_proposal((select id from proposals), current_date)$$, '42501');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select public.activate_proposal((select id from proposals), date_trunc('month', current_date)::date);
select pg_temp.expect_error($$select public.activate_proposal((select id from proposals), current_date)$$, '23505');
do $$ begin
  assert (select count(*) from fin_transactions where proposal_id is not null) = 2 + 6, '2 parcelas + 6 mensalidades';
  assert (select sum(amount) from fin_transactions where proposal_id is not null) = 13000, 'recebíveis somam o total contratado';
  assert (select count(*) from client_services where billing = 'mensal') = 1;
end $$;
reset role;

-- ===== Financeiro: status, métricas, recorrência =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
update fin_transactions set status = 'emitido' where installment_no = 1 and installment_total = 2;
update fin_transactions set status = 'liquidado' where installment_no = 1 and installment_total = 2;
insert into fin_recurring (description, vendor, direction, category_id, amount, day_of_month, is_subscription)
  select 'Assinatura', 'Adobe Creative Cloud', 'out', id, 300, 31, true from fin_categories where name = 'Ferramentas e assinaturas';
do $$ begin
  assert public.generate_recurring(current_date) = 1, 'gera despesa fixa do mês';
  assert public.generate_recurring(current_date) = 0, 'idempotente';
end $$;
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare m jsonb; d1 date := date_trunc('month', current_date)::date; d2 date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date; begin
  m := public.dashboard_metrics(d1, d2, null);
  assert (m->>'received')::numeric = 500, 'recebido: ' || (m->>'received');
  assert (m->>'issued')::numeric = 500, 'emitido: ' || (m->>'issued');
  assert (m->>'contracted')::numeric = 13000, 'contratado: ' || (m->>'contracted');
  assert (m->>'contracts_closed')::int = 1, m::text;
  assert (m->>'mrr')::numeric = 2000, 'MRR: ' || (m->>'mrr');
  assert (m->>'expenses_fixed')::numeric = 300, 'despesa fixa: ' || (m->>'expenses_fixed');
  assert (m->>'receivable_open')::numeric = 12500, 'a receber: ' || (m->>'receivable_open');
  assert (m->>'active_clients')::int = 1, m::text;
  assert (m->>'leads_received')::int = 1, m::text;
  assert (m->>'proposals_sent')::int = 1, m::text;
  -- filtro por cliente isola números
  assert (public.dashboard_metrics(d1, d2, gen_random_uuid())->>'contracted')::numeric = 0, 'filtro por cliente';
end $$;
-- pagar a despesa fixa → resultado operacional
update fin_transactions set status = 'liquidado' where recurring_id is not null;
do $$ declare m jsonb; begin
  m := public.dashboard_metrics(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, null);
  assert (m->>'expenses_paid')::numeric = 300 and (m->>'received')::numeric = 500, 'caixa realizado';
  assert (select count(*) from public.finance_monthly_series(12)) = 12, 'série de 12 meses';
end $$;
reset role;

-- comercial não vê financeiro; designer não vê propostas; admin vê tudo
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin assert (select count(*) from fin_transactions) = 0, 'comercial não vê financeiro'; end $$;
select pg_temp.expect_error($$insert into fin_transactions (direction, description, amount, due_date) values ('in','x',1,current_date)$$, '42501');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin assert (select count(*) from proposals) = 0 and (select count(*) from fin_transactions) = 0 and (select count(*) from client_services) = 0, 'designer isolado'; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin assert (select count(*) from audit_log) > 0, 'admin lê auditoria'; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin assert (select count(*) from audit_log) = 0, 'financeiro não lê auditoria'; end $$;
reset role;

-- ===== Fila de jobs e varreduras =====
-- vencimento no passado → alerta crítico
update fin_transactions set due_date = current_date - 10 where proposal_id is not null and status = 'previsto' and installment_no = 2 and installment_total = 2;
set role service_role;
do $$ declare r jsonb; j jobs; n int; begin
  r := public.run_scheduled_scans();
  assert (r->>'overdue')::int >= 1, 'alerta de atraso: ' || r::text;
  assert exists (select 1 from notifications where title = 'Pagamento em atraso' and severity = 'critical');
  perform public.run_scheduled_scans();
  assert (select count(*) from notifications where title = 'Pagamento em atraso') = (r->>'overdue')::int, 'alertas deduplicados';
  select count(*) into n from public.claim_jobs(10);
  assert n >= 2, 'jobs reivindicados: ' || n;
  assert (select count(*) from public.claim_jobs(10)) = 0, 'jobs em execução não são reivindicados de novo';
  select * into j from jobs where type = 'lead.created';
  perform public.finish_job(j.id, 'falha simulada');
  assert (select status from jobs where id = j.id) = 'failed' and (select run_at from jobs where id = j.id) > now(), 'retentativa com backoff';
  update jobs set attempts = max_attempts, status = 'running' where id = j.id;
  perform public.finish_job(j.id, 'falha final');
  assert (select status from jobs where id = j.id) = 'dead', 'esgotou tentativas → dead';
end $$;
reset role;
select pg_temp.expect_error($$set role authenticated; select public.claim_jobs(1)$$, '42501');
reset role;
