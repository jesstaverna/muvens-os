\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text default null) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO e nada ocorreu: %', sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if code is not null and sqlstate <> code then raise exception 'Erro % diferente de %: % (sql: %)', sqlstate, code, sqlerrm, sql; end if;
end $$;

-- cenário novo: cliente + proposta sem lead, aceita via link público
insert into clients (id, name, document, address) values ('11111111-1111-1111-1111-111111111111', 'Studio Aurora', '12.345.678/0001-90', 'Rua A, 10');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into proposals (id, title, template, client_id, client_display_name, installments, contract_months, valid_until, content, payment_terms)
  values ('22222222-2222-2222-2222-222222222222', 'Site institucional', 'site_institucional', '11111111-1111-1111-1111-111111111111', 'Studio Aurora', 2, 1, current_date + 10,
          '{"escopo":["5 páginas"],"entregaveis":["Site publicado"],"cronograma":"Prazo a validar com a produção"}', '50% na assinatura e 50% na entrega');
insert into proposal_items (proposal_id, description, billing, quantity, unit_price) values ('22222222-2222-2222-2222-222222222222', 'Desenvolvimento de site', 'pontual', 1, 4000);
update proposals set status = 'enviada' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select token as tok from proposals where id = '22222222-2222-2222-2222-222222222222' \gset
set role anon;
select public.proposal_public_accept(:'tok', 'Ana', 'ana@aurora.com');
reset role;

do $$ declare c contracts; begin
  select * into c from contracts where proposal_id = '22222222-2222-2222-2222-222222222222';
  assert c.id is not null and c.status = 'rascunho', 'aceite gera rascunho de contrato automaticamente';
  assert c.body like '%Studio Aurora%' and c.body like '%12.345.678/0001-90%', 'dados do contratante preenchidos';
  assert c.body like '%R$ 4.000,00%', 'valor formatado em R$: ' || c.body;
  assert c.body like '%Desenvolvimento de site%' and c.body like '%5 páginas%', 'escopo preenchido';
  assert c.body like '%[PREENCHER: contratada_documento]%', 'dados da agência ausentes ficam marcados';
  assert exists (select 1 from notifications where dedupe_key = 'contract.draft:' || c.id), 'alerta de rascunho';
end $$;

-- revisão humana obrigatória
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_error($$update contracts set status = 'aprovado' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '23514');                  -- pula revisão
update contracts set status = 'em_revisao' where proposal_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error($$update contracts set status = 'aprovado' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '23514');                  -- ainda tem [PREENCHER]
select pg_temp.expect_error($$update contracts set status = 'assinado' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '23514');                  -- transição inválida
reset role;
-- admin completa dados da agência e o texto
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
-- troca de modelo (serviço) em revisão
do $$ declare c uuid; t uuid; begin
  select id into c from contracts where proposal_id = '22222222-2222-2222-2222-222222222222';
  select id into t from contract_templates where service_template = 'consultoria';
  assert t is not null, 'modelo de consultoria existe';
  perform public.change_contract_template(c, t);
  assert (select service_template from contracts where id = c) = 'consultoria', 'serviço do contrato trocado';
  assert (select body from contracts where id = c) like '%Studio Aurora%', 'texto regerado com os dados da proposta';
  assert exists (select 1 from contract_templates where service_template = 'design_posts'), 'modelo de design de posts existe';
end $$;
update agency_settings set legal_name = 'Muvens Agência LTDA', document = '00.000.000/0001-00', address = 'Rua B, 20', city = 'São Paulo', representative_name = 'Responsável', representative_role = 'Sócia';
update contracts set body = regexp_replace(body, '\[PREENCHER[^\]]*\]', 'definido', 'g') where proposal_id = '22222222-2222-2222-2222-222222222222';
update contracts set status = 'aprovado' where proposal_id = '22222222-2222-2222-2222-222222222222';
do $$ declare c contracts; begin
  select * into c from contracts where proposal_id = '22222222-2222-2222-2222-222222222222'; assert c.status = 'aprovado' and c.approved_by = auth.uid() and c.approved_at is not null, 'aprovação registra quem aprovou';
end $$;
select pg_temp.expect_error($$update contracts set body = body || ' x' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '23514');                  -- texto travado após aprovação
select pg_temp.expect_error($$update contracts set status = 'enviado_assinatura' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '23514');
select pg_temp.expect_error($$select public.change_contract_template((select id from contracts where proposal_id = '22222222-2222-2222-2222-222222222222'), (select id from contract_templates limit 1))$$, '23514');  -- aprovado não troca modelo        -- integração pendente
reset role;
-- comercial não registra assinatura; financeiro não altera contrato
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_error($$update contracts set status = 'assinado' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '42501');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ declare n int; begin
  assert (select count(*) from contracts) >= 1, 'financeiro lê contratos';
  update contracts set title = 'hack' where proposal_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count; assert n = 0, 'financeiro não altera contratos (RLS)';
end $$;
reset role;

-- assinatura manual (admin) → ativa cliente, serviços, recebíveis, job e alerta
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update contracts set signature_note = 'PDF assinado recebido por e-mail', status = 'assinado' where proposal_id = '22222222-2222-2222-2222-222222222222';
reset role;
do $$ declare c contracts; begin
  select * into c from contracts where proposal_id = '22222222-2222-2222-2222-222222222222';
  assert c.status = 'assinado' and c.signed_at is not null and c.signature_provider = 'manual', 'assinatura registrada';
  assert c.starts_on is not null and c.ends_on = (c.starts_on + interval '1 month')::date, 'vigência calculada';
  assert (select activated_at from proposals where id = c.proposal_id) is not null, 'proposta ativada pela assinatura';
  assert (select sum(amount) from fin_transactions where proposal_id = c.proposal_id) = 4000, 'recebíveis gerados = valor do contrato';
  assert (select count(*) from fin_transactions where proposal_id = c.proposal_id) = 2, '2 parcelas';
  assert (select status from clients where id = c.client_id) = 'ativo', 'cliente ativo';
  assert exists (select 1 from jobs where type = 'contract.signed' and payload->>'contract_id' = c.id::text), 'job de onboarding';
end $$;
-- contrato assinado é imutável e não volta de status
select pg_temp.expect_error($$update contracts set status = 'cancelado' where proposal_id = '22222222-2222-2222-2222-222222222222'$$, '23514');
-- alertas de vencimento
update contracts set ends_on = current_date + 20, readjust_on = current_date + 5 where proposal_id = '22222222-2222-2222-2222-222222222222';
set role service_role;
do $$ begin
  assert (public.run_contract_scans()->>'contract_alerts')::int >= 2, 'alertas de vencimento e reajuste';
  assert (public.run_contract_scans()->>'contract_alerts')::int >= 2 and (select count(*) from notifications where dedupe_key like 'contract.expiring:%') = 1, 'alertas deduplicados';
end $$;
reset role;
-- anon não gera contrato; comercial gera de proposta aceita e é idempotente
set role anon;
select pg_temp.expect_error($$select public.generate_contract('22222222-2222-2222-2222-222222222222')$$, '42501');
reset role;
