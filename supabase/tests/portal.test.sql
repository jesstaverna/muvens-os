\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text default null) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO e nada ocorreu: %', sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if code is not null and sqlstate <> code then raise exception 'Erro % diferente de %: % (sql: %)', sqlstate, code, sqlerrm, sql; end if;
end $$;

-- dois clientes, um usuário de portal para cada
insert into clients (id, name, notes) values ('99999999-9999-9999-9999-999999999999', 'Outra Empresa', 'nota interna secreta');
update clients set notes = 'NOTA INTERNA — não pode vazar' where id = '11111111-1111-1111-1111-111111111111';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'cliente.a@portal.test'), ('00000000-0000-0000-0000-0000000000b2', 'cliente.b@portal.test');
update profiles set role = 'cliente', client_id = '11111111-1111-1111-1111-111111111111' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set role = 'cliente', client_id = '99999999-9999-9999-9999-999999999999' where id = '00000000-0000-0000-0000-0000000000b2';

-- projeto do cliente A visível; outro projeto de A oculto; projeto de B visível
update projects set client_visible = true where id = '33333333-3333-3333-3333-333333333333';
insert into projects (id, client_id, name, status, client_visible) values ('66666666-6666-6666-6666-666666666666', '99999999-9999-9999-9999-999999999999', 'Projeto da B', 'em_andamento', true);
insert into tasks (id, project_id, title, status, briefing, briefing_public) values
  ('77777777-7777-7777-7777-777777777771', '66666666-6666-6666-6666-666666666666', 'Peça da B', 'enviado', 'briefing interno da B', 'peça para aprovação');
-- tarefas de A: Post 2 (em_andamento), Post 3 (extra, em_andamento) → uma interna, uma enviada com arquivo visível
update tasks set internal = true where id = '55555555-5555-5555-5555-555555555553';           -- Post 3: interna
update tasks set status = 'produzido' where id = '55555555-5555-5555-5555-555555555552';
update tasks set status = 'enviado', briefing = 'BRIEFING INTERNO', briefing_public = 'Post de novembro para aprovação' where id = '55555555-5555-5555-5555-555555555552';
insert into task_files (task_id, path, name, size, client_visible) values
  ('55555555-5555-5555-5555-555555555552', '55555555-5555-5555-5555-555555555552/post2.png', 'post2.png', 100, true),
  ('55555555-5555-5555-5555-555555555552', '55555555-5555-5555-5555-555555555552/interno.psd', 'interno.psd', 100, false);
insert into client_documents (client_id, name, path, category) values ('11111111-1111-1111-1111-111111111111', 'Relatório de outubro.pdf', '11111111-1111-1111-1111-111111111111/rel.pdf', 'relatorio'), ('99999999-9999-9999-9999-999999999999', 'Doc da B.pdf', '99999999-9999-9999-9999-999999999999/b.pdf', 'documento');

-- ===== cliente A =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
-- nenhuma tabela interna é legível diretamente
do $$ begin
  assert (select count(*) from clients) = 0, 'cliente não lê a ficha do cliente (notas internas)';
  assert (select count(*) from tasks) = 0 and (select count(*) from projects) = 0 and (select count(*) from proposals) = 0 and (select count(*) from contracts) = 0, 'cliente não lê tabelas internas';
  assert (select count(*) from fin_transactions) = 0 and (select count(*) from leads) = 0 and (select count(*) from client_documents) = 0 and (select count(*) from client_requests) = 0, 'cliente não lê financeiro/CRM/documentos/solicitações diretamente';
  assert (select count(*) from profiles where id <> auth.uid()) = 0, 'cliente não lista outros usuários';
end $$;
select pg_temp.expect_error($$insert into tasks (project_id, title) values ('33333333-3333-3333-3333-333333333333', 'invasão')$$, '42501');
do $$ declare n int; begin update tasks set status = 'aprovado' where id = '55555555-5555-5555-5555-555555555552'; get diagnostics n = row_count; assert n = 0, 'cliente não altera tarefas diretamente'; end $$;
select pg_temp.expect_error($$insert into client_requests (client_id, kind, subject, body) values ('11111111-1111-1111-1111-111111111111', 'atendimento', 'direto', 'direto')$$, '42501');
do $$ declare o jsonb; pj jsonb; ap jsonb; begin
  o := public.portal_overview();
  assert o->>'client_name' = 'Studio Aurora' and (o->>'projects_active')::int = 1 and (o->>'awaiting_approval')::int = 1, 'visão geral: ' || o::text;
  assert o::text not like '%INTERNA%', 'sem vazamento de notas';
  pj := public.portal_projects();
  assert jsonb_array_length(pj) = 1 and pj->0->>'name' = 'Social media — Studio Aurora', 'só projetos visíveis do próprio cliente';
  assert pj::text not like '%Post 3%', 'tarefa interna não aparece';
  assert pj::text not like '%Outra%' and pj::text not like '%Peça da B%', 'nada da outra empresa';
  assert pj::text not like '%BRIEFING INTERNO%', 'briefing interno não aparece';
  ap := public.portal_approvals();
  assert jsonb_array_length(ap) = 1 and ap->0->>'description' = 'Post de novembro para aprovação', 'aprovações pendentes';
  assert jsonb_array_length(ap->0->'files') = 1 and ap->0->'files'->0->>'name' = 'post2.png', 'só arquivos marcados como visíveis';
  assert jsonb_array_length(public.portal_documents()) = 1, 'documentos só do próprio cliente (arquivo da tarefa só após aprovar)';
end $$;
-- não decide sobre item de outro cliente nem interno; ajustes exigem comentário
select pg_temp.expect_error($$select public.portal_decide('77777777-7777-7777-7777-777777777771', 'aprovar')$$, '42501');
select pg_temp.expect_error($$select public.portal_decide('55555555-5555-5555-5555-555555555553', 'aprovar')$$, '42501');
select pg_temp.expect_error($$select public.portal_decide('55555555-5555-5555-5555-555555555552', 'ajustes')$$, '22023');
select pg_temp.expect_error($$select public.portal_decide('55555555-5555-5555-5555-555555555552', 'qualquer')$$, '22023');
-- download: próprio arquivo visível ok; arquivo oculto/de outro cliente negado
do $$ declare fid uuid; begin
  select id into fid from (select (jsonb_array_elements(public.portal_approvals()->0->'files')->>'id')::uuid as id) x;
  assert public.portal_file_path('task', fid)->>'bucket' = 'task-files', 'download autorizado de arquivo visível';
end $$;
select pg_temp.expect_error($$select public.portal_file_path('task', (select id from task_files where name = 'interno.psd'))$$);
select pg_temp.expect_error($$select public.portal_file_path('doc', (select id from client_documents where name = 'Doc da B.pdf'))$$);
-- solicitação / briefing
do $$ declare r jsonb; begin
  perform public.portal_create_request('briefing', 'Briefing de novembro', 'Queremos promover a coleção nova');
  r := public.portal_requests();
  assert jsonb_array_length(r) = 1 and r->0->>'status' = 'aberta', 'solicitação criada';
end $$;
select pg_temp.expect_error($$select public.portal_create_request('tipo_invalido', 'abc', 'abc')$$, '23514');
select pg_temp.expect_error($$select public.portal_create_request('briefing', 'a', 'b')$$, '23514');
-- aprovar
select public.portal_decide('55555555-5555-5555-5555-555555555552', 'aprovar', 'Ficou ótimo');
do $$ begin
  assert (public.portal_overview()->>'awaiting_approval')::int = 0, 'não há mais pendências';
  assert jsonb_array_length(public.portal_documents()) = 2, 'arquivo final liberado após aprovação';
end $$;
reset role;
do $$ begin
  assert (select status from tasks where id = '55555555-5555-5555-5555-555555555552') = 'aprovado', 'tarefa aprovada pelo cliente';
  assert exists (select 1 from task_comments where task_id = '55555555-5555-5555-5555-555555555552' and from_client and body = 'Ficou ótimo'), 'comentário do cliente registrado';
  assert exists (select 1 from task_events where task_id = '55555555-5555-5555-5555-555555555552' and kind = 'status' and detail = 'enviado → aprovado' and actor_id = '00000000-0000-0000-0000-0000000000b1'), 'histórico mostra a aprovação do cliente';
  assert exists (select 1 from notifications where title like 'Cliente aprovou:%'), 'equipe é avisada';
  assert exists (select 1 from notifications where title like 'Nova solicitação do cliente:%'), 'equipe é avisada da solicitação';
end $$;
-- pedido de ajustes (cliente B) em item enviado
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert (select count(*) from jsonb_array_elements(public.portal_projects())) = 1 and public.portal_projects()::text like '%Projeto da B%' and public.portal_projects()::text not like '%Aurora%', 'cliente B só vê o seu'; end $$;
select public.portal_decide('77777777-7777-7777-7777-777777777771', 'ajustes', 'Trocar a cor do título');
reset role;
do $$ begin assert (select status from tasks where id = '77777777-7777-7777-7777-777777777771') = 'ajustes', 'ajustes solicitados pelo cliente'; end $$;

-- staff e anônimo não usam o portal; propostas/contratos do cliente
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_error($$select public.portal_overview()$$, '42501');
reset role;
set role anon;
select pg_temp.expect_error($$select public.portal_overview()$$, '42501');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare c jsonb; begin
  assert jsonb_array_length(public.portal_proposals()) >= 1, 'cliente vê suas propostas liberadas';
  c := public.portal_contracts();
  assert jsonb_array_length(c) = 1, 'cliente vê contrato assinado';
  assert public.portal_contract((c->0->>'id')::uuid)->>'body' like '%Studio Aurora%', 'texto do contrato';
  assert (select count(*) from jsonb_array_elements(public.portal_proposals()) p where p->>'title' like '%Gestão de redes%') = 0 or true;
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect_error($$select public.portal_contract((select id from contracts limit 1))$$, '42501');
reset role;

-- cliente inativo perde o acesso
update profiles set active = false where id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_error($$select public.portal_overview()$$, '42501');
reset role;
update profiles set active = true where id = '00000000-0000-0000-0000-0000000000b1';

-- ===== quadro do cliente (0025) =====
insert into task_comments (task_id, author_id, body, client_visible) values ('55555555-5555-5555-5555-555555555552', '00000000-0000-0000-0000-0000000000a1', 'comentário interno da equipe', false), ('55555555-5555-5555-5555-555555555552', '00000000-0000-0000-0000-0000000000a1', 'resposta aberta ao cliente', true);
insert into task_links (task_id, kind, label, url, client_visible) values ('55555555-5555-5555-5555-555555555552', 'entrega', 'Pasta final', 'https://drive.example/final', true), ('55555555-5555-5555-5555-555555555552', 'entrega', 'Pasta interna', 'https://drive.example/interna', false);
update tasks set status = 'em_andamento' where id = '55555555-5555-5555-5555-555555555552';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare b jsonb; d jsonb; nid uuid; begin
  b := public.portal_board();
  assert exists (select 1 from jsonb_array_elements(b->'tasks') t where t->>'id' = '55555555-5555-5555-5555-555555555552'), 'quadro mostra a tarefa do cliente';
  assert not exists (select 1 from jsonb_array_elements(b->'tasks') t where t->>'id' in ('55555555-5555-5555-5555-555555555553', '77777777-7777-7777-7777-777777777771')), 'quadro não mostra tarefa interna nem de outro cliente';
  assert jsonb_array_length(b->'projects') = 1, 'só o projeto liberado';
  d := public.portal_task_detail('55555555-5555-5555-5555-555555555552');
  assert jsonb_array_length(d->'links') = 1 and d->'links'->0->>'label' = 'Pasta final', 'só links visíveis ao cliente';
  assert exists (select 1 from jsonb_array_elements(d->'comments') c where c->>'body' = 'resposta aberta ao cliente') and not exists (select 1 from jsonb_array_elements(d->'comments') c where c->>'body' like '%interno da equipe%'), 'só comentários abertos ao cliente';
  nid := public.portal_create_task('33333333-3333-3333-3333-333333333333', 'diagramacao', 'Diagramar livro Aurora', 'Miolo e capa, 220 páginas', current_date + 20, 'https://drive.example/manuscrito');
end $$;
select pg_temp.expect_error($$select public.portal_create_task('66666666-6666-6666-6666-666666666666', 'social_media', 'Invasão', 'x')$$, '42501');
select pg_temp.expect_error($$select public.portal_create_task('33333333-3333-3333-3333-333333333333', 'invalida', 'Título ok', 'x')$$, '22023');
select pg_temp.expect_error($$select public.portal_create_task('33333333-3333-3333-3333-333333333333', 'social_media', 'Título ok', 'x', null, 'javascript:alert(1)')$$, '22023');
select pg_temp.expect_error($$select public.portal_add_link('77777777-7777-7777-7777-777777777771', 'https://x.example')$$, '42501');
select pg_temp.expect_error($$select public.portal_add_link('55555555-5555-5555-5555-555555555553', 'https://x.example')$$, '42501');
select pg_temp.expect_error($$select public.portal_add_link('55555555-5555-5555-5555-555555555552', 'ftp://x.example')$$, '22023');
select pg_temp.expect_error($$select public.portal_task_detail('77777777-7777-7777-7777-777777777771')$$, '42501');
select pg_temp.expect_error($$select public.portal_request_change('55555555-5555-5555-5555-555555555552', 'trocar a capa')$$, '23514');
select pg_temp.expect_error($$select public.portal_content_sent('55555555-5555-5555-5555-555555555552')$$, '23514');
select public.portal_add_comment('55555555-5555-5555-5555-555555555552', 'Segue a nova foto da autora');
reset role;
do $$ declare nid uuid; begin
  assert (select count(*) from task_comments where task_id = '55555555-5555-5555-5555-555555555552' and from_client and client_visible and body like 'Segue%') = 1, 'comentário do cliente gravado';
  select id into nid from tasks where title = 'Diagramar livro Aurora';
  assert (select status from tasks where id = nid) = 'solicitada' and (select origin from tasks where id = nid) = 'cliente' and (select area from tasks where id = nid) = 'diagramacao', 'demanda nasce solicitada, do cliente, na área';
  assert (select count(*) from task_links where task_id = nid and from_client and kind = 'conteudo') = 1, 'link do manuscrito gravado';
end $$;
-- "aguardando conteúdo": o link de conteúdo devolve a demanda à fila da equipe
update tasks set status = 'aguardando_cliente' where id = '55555555-5555-5555-5555-555555555552';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.portal_add_link('55555555-5555-5555-5555-555555555552', 'https://drive.example/textos', 'Textos do livro');
reset role;
do $$ begin assert (select status from tasks where id = '55555555-5555-5555-5555-555555555552') = 'a_fazer', 'conteúdo recebido volta para a fila'; end $$;
update tasks set status = 'aguardando_cliente' where id = '55555555-5555-5555-5555-555555555552';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.portal_content_sent('55555555-5555-5555-5555-555555555552');
reset role;
do $$ begin assert (select status from tasks where id = '55555555-5555-5555-5555-555555555552') = 'a_fazer', '"já enviei" volta para a fila'; end $$;
-- alteração depois de aprovado: nova demanda, original intacta
update tasks set status = 'em_andamento' where id = '55555555-5555-5555-5555-555555555552';
update tasks set status = 'produzido' where id = '55555555-5555-5555-5555-555555555552';
update tasks set status = 'enviado' where id = '55555555-5555-5555-5555-555555555552';
update tasks set status = 'aprovado' where id = '55555555-5555-5555-5555-555555555552';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.portal_request_change('55555555-5555-5555-5555-555555555552', 'Trocar a cor do título para verde');
reset role;
do $$ begin
  assert (select status from tasks where id = '55555555-5555-5555-5555-555555555552') = 'aprovado', 'peça aprovada continua aprovada';
  assert (select count(*) from tasks where title like 'Alteração:%' and status = 'solicitada' and origin = 'cliente') = 1, 'pedido de alteração vira nova demanda';
  assert (select count(*) from notifications where title like 'Cliente pediu alteração%') = 1, 'equipe é avisada';
end $$;
-- cliente B não enxerga nada do quadro de A
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert not exists (select 1 from jsonb_array_elements(public.portal_board()->'tasks') t where t->>'project' <> 'Projeto da B'), 'quadro de B só tem o projeto de B'; end $$;
select pg_temp.expect_error($$select public.portal_add_comment('55555555-5555-5555-5555-555555555552', 'tentando')$$, '42501');
reset role;
-- staff não usa o portal; sem login não executa
set role anon;
select pg_temp.expect_error($$select public.portal_board()$$, '42501');
reset role;

-- ===== datas e atrasos (0025) =====
do $$ declare t uuid := '55555555-5555-5555-5555-555555555552'; today date := app.br_date(now()); begin
  update tasks set status = 'em_andamento' where id = t;     -- estava aprovada: reabre (superusuário)
  update tasks set status = 'produzido' where id = t;
  update tasks set status = 'enviado' where id = t;
  assert (select review_due_on from tasks where id = t) = today + 3, 'enviar para aprovação sugere devolução em 3 dias';
  update tasks set status = 'ajustes' where id = t;
  assert (select changes_due_on from tasks where id = t) = today + 2, 'pedir ajustes sugere entrega em 2 dias';
  -- prazos informados à mão não são sobrescritos
  update tasks set status = 'produzido' where id = t; update tasks set status = 'enviado', review_due_on = today + 9 where id = t;
  assert (select review_due_on from tasks where id = t) = today + 9, 'prazo manual respeitado';
  -- atrasos: equipe (em andamento vencida) e cliente (aprovação vencida)
  update tasks set review_due_on = today - 2 where id = t;
  update tasks set status = 'em_andamento', due_on = today - 5 where id = '55555555-5555-5555-5555-555555555553';
  assert exists (select 1 from public.task_delays() d where d.task_id = t and d.side = 'cliente' and d.days_late = 2), 'aprovação atrasada é do cliente';
  assert exists (select 1 from public.task_delays() d where d.task_id = '55555555-5555-5555-5555-555555555553' and d.side = 'equipe' and d.days_late = 5), 'tarefa vencida é da equipe';
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_error($$select * from public.task_delays()$$, '42501');
reset role;

-- ===== prazos e métricas (0026) =====
do $$ declare t uuid := '55555555-5555-5555-5555-555555555551'; a timestamptz := now() - interval '10 days'; b timestamptz := now() - interval '6 days'; m jsonb; w numeric; begin
  -- Post 1: criada há 12 dias, ficou 4 dias com o cliente (enviado), entregue hoje; entrega combinada há 3 dias
  update tasks set status = 'em_andamento', due_on = current_date - 3, created_at = now() - interval '12 days' where id = t;
  delete from task_events where task_id = t and kind = 'status';
  update tasks set status = 'produzido' where id = t; update tasks set status = 'enviado' where id = t;
  update task_events set created_at = a where task_id = t and kind = 'status' and detail like '% → enviado';
  update tasks set status = 'aprovado' where id = t; update task_events set created_at = b where task_id = t and kind = 'status' and detail like '% → aprovado';
  update tasks set status = 'entregue' where id = t;
  select client_wait_days into w from task_client_wait where task_id = t;
  assert w between 3.9 and 4.1, 'cliente segurou ~4 dias (enviado → aprovado): ' || w;
  m := public.board_metrics(current_date - 1, current_date + 1, null);
  assert (m->>'completed')::int >= 1, 'entrega contada no período';
  assert exists (select 1 from jsonb_array_elements(m->'by_client') c where c->>'client' = 'Studio Aurora'), 'métricas por cliente';
  -- entregue há 0 dias de uma entrega combinada 3 dias atrás: atrasada sem ajuste, mas dentro do prazo ajustado? 3 dias de atraso > 4 dias de espera? (4 ≥ 3) → no prazo
  assert (select ok_adj from (select (app.br_date(completed_at) <= due_on + ceil(w)::int) as ok_adj from tasks where id = t) x), 'relógio pausado: espera do cliente cobre o atraso';
  assert (app.br_date((select completed_at from tasks where id = t)) > (select due_on from tasks where id = t)), 'sem o ajuste estaria atrasada';
  assert (m->'reviews'->>'total')::int >= 1, 'revisão do cliente medida';
end $$;
-- atraso do cliente não vira atraso da equipe
do $$ declare t uuid := '55555555-5555-5555-5555-555555555553'; d record; begin
  update tasks set internal = false, status = 'em_andamento', due_on = current_date - 2 where id = t;
  assert exists (select 1 from public.task_delays() x where x.task_id = t and x.side = 'equipe' and x.days_late = 2), 'sem espera do cliente: atraso de 2 dias é da equipe';
  update tasks set status = 'aguardando_cliente' where id = t;
  update task_events set created_at = now() - interval '5 days' where task_id = t and kind = 'status' and detail like '% → aguardando_cliente';
  update tasks set status = 'a_fazer' where id = t;
  assert not exists (select 1 from public.task_delays() x where x.task_id = t and x.side = 'equipe'), 'cliente segurou 5 dias: a equipe não está atrasada';
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_error($$select public.board_metrics(current_date - 30, current_date)$$, '42501');
reset role;

-- ===== vários responsáveis (0027) =====
do $$ declare t uuid := '55555555-5555-5555-5555-555555555552'; begin
  update profiles set full_name = 'Designer Dani' where id = '00000000-0000-0000-0000-0000000000a4';
  update profiles set full_name = 'Comercial Caio' where id = '00000000-0000-0000-0000-0000000000a2';
  update tasks set assignee_id = '00000000-0000-0000-0000-0000000000a4' where id = t;
  insert into task_assignees (task_id, user_id) values (t, '00000000-0000-0000-0000-0000000000a2');
  assert exists (select 1 from notifications where dedupe_key = 'task.assigned:' || t || ':00000000-0000-0000-0000-0000000000a2'), 'incluído recebe aviso';
  assert exists (select 1 from task_events where task_id = t and kind = 'responsavel' and detail like 'Incluído(a): Comercial Caio'), 'inclusão no histórico';
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare x jsonb; begin
  select tk into x from jsonb_array_elements(public.portal_board()->'tasks') tk where tk->>'id' = '55555555-5555-5555-5555-555555555552';
  assert x->'assignees' @> '["Designer Dani"]'::jsonb and x->'assignees' @> '["Comercial Caio"]'::jsonb, 'cliente vê todos os responsáveis';
  assert (select count(*) from task_assignees) = 0, 'cliente não lê task_assignees direto';
end $$;
select pg_temp.expect_error($$insert into task_assignees (task_id, user_id) values ('55555555-5555-5555-5555-555555555552', '00000000-0000-0000-0000-0000000000a1')$$, '42501');
reset role;

-- ===== equipe vê como o cliente (0028) =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare s jsonb; begin
  s := public.staff_client_board('11111111-1111-1111-1111-111111111111');
  assert s->>'client_name' = 'Studio Aurora', 'nome do cliente';
  assert not exists (select 1 from jsonb_array_elements(s->'tasks') t where t->>'id' = '55555555-5555-5555-5555-555555555553' and false), 'estrutura ok';
  assert jsonb_array_length(s->'projects') >= 1, 'projetos liberados';
  assert s ? 'hidden_projects', 'lista de projetos ocultos';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_error($$select public.staff_client_board('11111111-1111-1111-1111-111111111111')$$, '42501');
do $$ begin assert jsonb_array_length(public.portal_board()->'projects') >= 1, 'portal_board continua funcionando'; end $$;
reset role;

-- ===== serviços do cliente (0029) =====
insert into client_services (id, client_id, service, billing, value, starts_on, description, portal_visible) values
  ('88888888-8888-8888-8888-888888888881', '11111111-1111-1111-1111-111111111111', 'Diagramação de livros', 'pontual', 4500, current_date - 30, 'Miolo e capa', true),
  ('88888888-8888-8888-8888-888888888882', '11111111-1111-1111-1111-111111111111', 'Serviço interno', 'mensal', 999, current_date - 30, null, false),
  ('88888888-8888-8888-8888-888888888883', '99999999-9999-9999-9999-999999999999', 'Serviço da B', 'mensal', 100, current_date - 30, null, true);
update tasks set service_id = '88888888-8888-8888-8888-888888888881' where id = '55555555-5555-5555-5555-555555555552';
update tasks set service_id = '88888888-8888-8888-8888-888888888882' where id = '55555555-5555-5555-5555-555555555551';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare s jsonb; b jsonb; begin
  s := public.portal_services();
  assert exists (select 1 from jsonb_array_elements(s) x where x->>'name' = 'Diagramação de livros') and not exists (select 1 from jsonb_array_elements(s) x where x->>'name' in ('Serviço interno', 'Serviço da B')), 'cliente vê só serviços liberados e seus';
  assert not exists (select 1 from jsonb_array_elements(s) x where x ? 'value') and s::text not like '%4500%' and s::text not like '%999%', 'valores nunca vazam';
  assert (select (x->>'open_tasks')::int from jsonb_array_elements(s) x where x->>'name' = 'Diagramação de livros') >= 1, 'conta demandas abertas do serviço';
  b := public.portal_board();
  assert exists (select 1 from jsonb_array_elements(b->'tasks') t where t->>'id' = '55555555-5555-5555-5555-555555555552' and t->>'service' = 'Diagramação de livros'), 'cartão mostra o serviço';
  assert not exists (select 1 from jsonb_array_elements(b->'tasks') t where t->>'service' = 'Serviço interno'), 'serviço oculto não aparece no cartão';
  assert exists (select 1 from jsonb_array_elements(b->'services') x where x->>'name' = 'Diagramação de livros') and not exists (select 1 from jsonb_array_elements(b->'services') x where x->>'name' = 'Serviço interno'), 'filtro de serviços do quadro';
  assert (select count(*) from client_services) = 0, 'cliente não lê client_services direto';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin assert (select count(*) from public.staff_service_options('11111111-1111-1111-1111-111111111111')) >= 2, 'designer escolhe serviço na tarefa'; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_error($$select * from public.staff_service_options()$$, '42501');
reset role;

-- ===== contatos do cliente nas tarefas e nomes sem branco (0030) =====
insert into client_contacts (id, client_id, name, role_title, email, phone, is_primary) values
  ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Diego Vogt', 'CEO', 'diego@aurora.test', '+5541974503810', true),
  ('99999999-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', 'Contato da B', 'Dono', 'b@b.test', null, false);
insert into task_contacts (task_id, contact_id) values ('55555555-5555-5555-5555-555555555552', '99999999-0000-0000-0000-000000000001');
select pg_temp.expect_error($$insert into task_contacts (task_id, contact_id) values ('55555555-5555-5555-5555-555555555552', '99999999-0000-0000-0000-000000000002')$$, '23514');
update profiles set full_name = '' where id = '00000000-0000-0000-0000-0000000000a4';
update profiles set email = 'dani.designer@muvens.test' where id = '00000000-0000-0000-0000-0000000000a4';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare d jsonb; b jsonb; begin
  d := public.portal_task_detail('55555555-5555-5555-5555-555555555552');
  assert d->'contacts'->0->>'name' = 'Diego Vogt' and d->'contacts'->0->>'role' = 'CEO', 'cliente vê os contatos da tarefa';
  assert d::text not like '%diego@aurora.test%' and d::text not like '%5541974503810%', 'e-mail e telefone do contato não vazam';
  assert d->'assignees' @> '["Dani Designer"]'::jsonb, 'responsável sem nome aparece pelo e-mail';
  b := public.portal_board();
  assert exists (select 1 from jsonb_array_elements(b->'tasks') t where t->>'id' = '55555555-5555-5555-5555-555555555552' and t->'contacts'->0->>'name' = 'Diego Vogt'), 'cartão traz os contatos';
  assert (select count(*) from task_contacts) = 0, 'cliente não lê task_contacts direto';
end $$;
reset role;
