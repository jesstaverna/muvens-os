\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text default null) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO e nada ocorreu: %', sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if code is not null and sqlstate <> code then raise exception 'Erro % diferente de %: % (sql: %)', sqlstate, code, sqlerrm, sql; end if;
end $$;

-- onboarding automático criado pela assinatura do contrato (contracts.test.sql)
do $$ declare pr uuid; begin
  select id into pr from projects where name like 'Onboarding — Studio Aurora%';
  assert pr is not null, 'assinatura cria projeto de onboarding';
  assert (select count(*) from tasks where project_id = pr) = 4, '4 tarefas de onboarding';
  assert (select contract_id from projects where id = pr) is not null, 'projeto vinculado ao contrato';
  assert exists (select 1 from notifications where dedupe_key = 'onboarding:' || pr), 'alerta de onboarding';
end $$;

-- designer cria projeto/tarefas; financeiro só lê
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into projects (id, client_id, name, status) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Social media — Studio Aurora', 'em_andamento');
insert into deliverable_plans (id, client_id, project_id, name, period_month, quantity) values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Posts de Instagram', date_trunc('month', current_date)::date, 2);
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select pg_temp.expect_error($$insert into deliverable_plans (client_id, name, period_month, quantity) values ('11111111-1111-1111-1111-111111111111', 'x', date_trunc('month', current_date)::date, 1)$$, '42501');  -- designer não cria plano contratado
insert into tasks (id, project_id, deliverable_plan_id, title, assignee_id, due_on) values
  ('55555555-5555-5555-5555-555555555551', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'Post 1', auth.uid(), current_date - 2),
  ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'Post 2', auth.uid(), current_date + 3),
  ('55555555-5555-5555-5555-555555555553', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'Post 3 (extra)', auth.uid(), current_date + 5);
do $$ begin
  assert (select out_of_scope from tasks where title = 'Post 3 (extra)'), 'excedente vira fora do escopo automaticamente';
  assert not (select out_of_scope from tasks where title = 'Post 2'), 'dentro da quantidade contratada fica no escopo';
end $$;
-- fluxo de aprovação: não pula etapas
select pg_temp.expect_error($$update tasks set status = 'enviado' where title = 'Post 1'$$, '23514');
select pg_temp.expect_error($$update tasks set status = 'aprovado' where title = 'Post 1'$$, '23514');
update tasks set status = 'em_andamento' where title = 'Post 1';
update tasks set status = 'produzido' where title = 'Post 1';
update tasks set status = 'enviado' where title = 'Post 1';
update tasks set status = 'ajustes' where title = 'Post 1';
update tasks set status = 'produzido' where title = 'Post 1';
update tasks set status = 'enviado' where title = 'Post 1';
update tasks set status = 'aprovado' where title = 'Post 1';
update tasks set status = 'entregue' where title = 'Post 1';
update tasks set status = 'em_andamento' where title = 'Post 2';
do $$ declare d record; begin
  select * into d from deliverable_progress where id = '44444444-4444-4444-4444-444444444444';
  assert d.quantity = 2 and d.iniciados = 2 and d.produzidos = 1 and d.enviados = 1 and d.aprovados = 1 and d.entregues = 1 and d.fora_escopo = 1, 'progresso dos entregáveis: ' || row_to_json(d)::text;
  assert (select count(*) from task_events where task_id = '55555555-5555-5555-5555-555555555551' and kind = 'status') = 8, 'histórico de status';
  assert (select completed_at from tasks where title = 'Post 1') is not null, 'conclusão registrada';
end $$;
-- reabrir entregue: só admin
select pg_temp.expect_error($$update tasks set status = 'em_andamento' where title = 'Post 1'$$, '42501');
-- horas, checklist, comentário
insert into time_entries (task_id, minutes, note) values ('55555555-5555-5555-5555-555555555551', 90, 'Criação da arte');
select pg_temp.expect_error($$insert into time_entries (task_id, minutes, user_id) values ('55555555-5555-5555-5555-555555555551', 30, '00000000-0000-0000-0000-0000000000a1')$$, '42501');
select pg_temp.expect_error($$insert into time_entries (task_id, minutes) values ('55555555-5555-5555-5555-555555555551', 0)$$, '23514');
insert into task_checklist_items (task_id, text) values ('55555555-5555-5555-5555-555555555551', 'Revisar texto');
insert into task_comments (task_id, body) values ('55555555-5555-5555-5555-555555555551', 'Cliente pediu logo maior');
do $$ begin assert (select count(*) from staff_rates) = 0, 'designer não vê custo/hora'; end $$;
reset role;

-- financeiro lê mas não escreve tarefas; define custo/hora
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ declare n int; begin
  assert (select count(*) from tasks) >= 7, 'financeiro lê tarefas';
  update tasks set title = 'x'; get diagnostics n = row_count; assert n = 0, 'financeiro não altera tarefas';
end $$;
select pg_temp.expect_error($$insert into projects (client_id, name) values ('11111111-1111-1111-1111-111111111111', 'x')$$, '42501');
insert into staff_rates (user_id, hourly_cost) values ('00000000-0000-0000-0000-0000000000a4', 60);
do $$ declare r record; begin
  select * into r from public.client_profitability(date_trunc('month', current_date)::date, current_date) where client_id = '11111111-1111-1111-1111-111111111111';
  assert r.minutes = 90 and r.labor_cost = 90, 'custo de mão de obra = 1,5h × R$60: ' || coalesce(row_to_json(r)::text, 'null');
  assert r.minutes_without_rate = 0, 'todas as horas têm custo';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select pg_temp.expect_error($$select * from public.client_profitability(current_date, current_date)$$, '42501');
reset role;

-- alertas de atraso (service role), deduplicados; notificação de atribuição
set role service_role;
do $$ declare r jsonb; begin
  r := public.run_project_scans();
  assert (r->>'late_tasks')::int >= 0;
end $$;
reset role;
update tasks set status = 'em_andamento', due_on = current_date - 3 where title = 'Post 3 (extra)';
set role service_role;
do $$ begin
  assert (public.run_project_scans()->>'late_tasks')::int >= 1, 'tarefa atrasada gera alerta';
  perform public.run_project_scans();
  assert (select count(*) from notifications where dedupe_key like 'task.late:%') = (select count(*) from tasks where due_on < current_date and status in ('a_fazer','em_andamento','produzido','ajustes')), 'alertas de atraso deduplicados';
end $$;
reset role;
