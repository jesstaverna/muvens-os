\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text default null) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO e nada ocorreu: %', sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if code is not null and sqlstate <> code then raise exception 'Erro % diferente de %: % (sql: %)', sqlstate, code, sqlerrm, sql; end if;
end $$;

-- perfis: designer não acessa prospecção; comercial sim
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin assert (select count(*) from prospects) = 0 and (select count(*) from outreach_settings) = 0, 'designer não vê prospecção'; end $$;
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into prospect_campaigns (id, name, niche, city) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Clínicas Campinas', 'clínica de estética', 'Campinas');
insert into prospects (id, campaign_id, source, place_id, name, website, email, google_fetched_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'google_maps', 'ChIJ_aaa', 'Clínica Bela', 'https://www.clinicabela.com.br/contato?x=1', 'Contato@ClinicaBela.com.br', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'google_maps', 'ChIJ_bbb', 'Estética Sol', null, 'sol@estetica.com', now() - interval '40 days');
do $$ begin
  assert (select website_domain from prospects where name = 'Clínica Bela') = 'clinicabela.com.br', 'domínio normalizado';
  assert (select email from prospects where name = 'Clínica Bela') = 'contato@clinicabela.com.br', 'e-mail em minúsculas';
end $$;
-- anti-duplicidade: place_id, domínio e e-mail
select pg_temp.expect_error($$insert into prospects (place_id, name) values ('ChIJ_aaa', 'dup')$$, '23505');
select pg_temp.expect_error($$insert into prospects (name, website) values ('dup2', 'http://clinicabela.com.br')$$, '23505');
select pg_temp.expect_error($$insert into prospects (name, email) values ('dup3', 'CONTATO@clinicabela.com.br')$$, '23505');
-- mensagens: 1 por passo e canal
insert into outreach_messages (prospect_id, channel, step, subject, body, status, approved_by, approved_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'email', 1, 'Olá', 'Corpo', 'aprovada', auth.uid(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'email', 1, 'Olá', 'Corpo', 'aprovada', auth.uid(), now());
select pg_temp.expect_error($$insert into outreach_messages (prospect_id, channel, step, body) values ('bbbbbbbb-0000-0000-0000-000000000001', 'email', 1, 'x')$$, '23505');
-- comercial não altera as configurações de envio; admin sim
do $$ declare n int; begin update outreach_settings set sending_enabled = true; get diagnostics n = row_count; assert n = 0, 'comercial não liga o envio'; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update outreach_settings set window_start_hour = 0, window_end_hour = 24, weekdays_only = false, daily_email_limit = 1;
reset role;

-- salvaguardas do envio (service role)
set role service_role;
do $$ begin
  assert (select count(*) from public.claim_outreach(10)) = 0, 'envio desligado por padrão';
end $$;
reset role;
update outreach_settings set sending_enabled = true;
set role service_role;
do $$ begin assert (select count(*) from public.claim_outreach(10)) = 0, 'sem identificação da empresa não envia'; end $$;
reset role;
update outreach_settings set sender_name = 'Equipe Muvens', sender_email = 'contato@muvens.test', company_legal_name = 'Muvens LTDA', company_document = '00.000.000/0001-00', company_address = 'Rua B, 20 — São Paulo/SP';
set role service_role;
do $$ declare r record; n int := 0; begin
  for r in select * from public.claim_outreach(10) loop n := n + 1; end loop;
  assert n = 1, 'respeita o limite diário (1): ' || n;
  assert (select count(*) from public.claim_outreach(10)) = 0, 'limite diário esgotado';
end $$;
reset role;
do $$ declare m uuid; begin
  select id into m from outreach_messages where status = 'enviando';
  perform public.finish_outreach(m, true, 'prov-123', null);
  assert (select status from outreach_messages where id = m) = 'enviada' and (select provider_id from outreach_messages where id = m) = 'prov-123', 'envio concluído';
  assert (select status from prospects where id = (select prospect_id from outreach_messages where id = m)) = 'contatado', 'prospecto vira contatado';
end $$;

-- janela de horário fecha o envio
update outreach_settings set daily_email_limit = 50, window_start_hour = 0, window_end_hour = 1, weekdays_only = false;
update outreach_messages set status = 'aprovada', sent_at = null where status = 'enviada' and step = 1 and prospect_id = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$ begin
  if extract(hour from (now() at time zone 'America/Sao_Paulo')) >= 1 then
    perform set_config('app.test_window', 'closed', true);
  end if;
end $$;
set role service_role;
do $$ begin
  if extract(hour from (now() at time zone 'America/Sao_Paulo')) >= 1 then assert (select count(*) from public.claim_outreach(10)) = 0, 'fora da janela não envia'; end if;
end $$;
reset role;
update outreach_settings set window_start_hour = 0, window_end_hour = 24;

-- descadastro público
update outreach_messages set status = 'aprovada' where prospect_id = (select id from prospects where name = 'Estética Sol');
set role anon;
do $$ begin
  assert public.unsubscribe_prospect('token-inexistente') = false, 'token inválido';
end $$;
reset role;
select unsub_token as tok from prospects where name = 'Estética Sol' \gset
set role anon;
select public.unsubscribe_prospect(:'tok');
reset role;
do $$ begin
  assert (select status from prospects where name = 'Estética Sol') = 'descartado', 'descadastro descarta o prospecto';
  assert exists (select 1 from suppression_list where email = 'sol@estetica.com' and source = 'descadastro'), 'e-mail entra na lista de bloqueio';
  assert (select count(*) from outreach_messages where prospect_id = (select id from prospects where name = 'Estética Sol') and status = 'aprovada') = 0, 'mensagens pendentes canceladas';
end $$;
set role service_role;
do $$ begin assert (select count(*) from public.claim_outreach(10)) = 0, 'lista de bloqueio impede novo envio'; end $$;
reset role;
-- bloqueio por domínio
insert into suppression_list (domain, source) values ('clinicabela.com.br', 'manual');
update outreach_messages set status = 'aprovada', sent_at = null where prospect_id = 'bbbbbbbb-0000-0000-0000-000000000001';
update prospects set status = 'contatado' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set role service_role;
do $$ begin assert (select count(*) from public.claim_outreach(10)) = 0, 'bloqueio por domínio impede envio'; end $$;
reset role;
set role anon;
select pg_temp.expect_error($$select * from prospects$$, '42501');
select pg_temp.expect_error($$select public.claim_outreach(1)$$, '42501');
reset role;

-- retenção de dados do Google (>30 dias, sem trabalho)
update prospects set address = 'Rua X', phone = '1999', website = 'https://estetica.com', maps_url = 'https://maps' where name = 'Estética Sol';
set role service_role;
do $$ begin assert (public.run_prospect_scans()->>'purged_google_snapshots')::int = 1, 'limpa dados do Google com mais de 30 dias'; end $$;
reset role;
do $$ begin assert (select phone from prospects where name = 'Estética Sol') is null and (select place_id from prospects where name = 'Estética Sol') = 'ChIJ_bbb', 'mantém só o place_id'; end $$;

-- follow-up: candidato após followup_days sem resposta
update prospects set status = 'contatado' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update outreach_messages set status = 'enviada', sent_at = now() - interval '5 days' where prospect_id = 'bbbbbbbb-0000-0000-0000-000000000001' and step = 1;
delete from suppression_list where domain = 'clinicabela.com.br';
set role service_role;
do $$ begin assert (select count(*) from public.followup_candidates()) = 1 and (select next_step from public.followup_candidates()) = 2, 'follow-up após 4 dias sem resposta'; end $$;
reset role;
update prospects set status = 'respondeu' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set role service_role;
do $$ begin assert (select count(*) from public.followup_candidates()) = 0, 'quem respondeu não recebe follow-up'; end $$;
reset role;

-- link público do diagnóstico: só dados da análise, e só enquanto o prospecto não for descartado
reset role;
update prospects set status = 'analisado', analysis = '{"site":null,"observations":["Não encontramos um site da empresa"],"reasons":[]}'::jsonb, analyzed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set role anon;
do $$ declare t text; r jsonb; begin
  reset role; select report_token into t from prospects where id = 'bbbbbbbb-0000-0000-0000-000000000001'; set role anon;
  r := public.public_prospect_report(t);
  assert r->>'name' is not null and r ? 'observations', 'anon lê o diagnóstico pelo token';
  assert not (r ? 'email') and not (r ? 'phone') and not (r ? 'notes'), 'diagnóstico não expõe contatos';
  assert public.public_prospect_report('nao-existe') is null, 'token inválido não devolve nada';
end $$;
reset role;
update prospects set status = 'descartado' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set role anon;
do $$ declare t text; begin
  reset role; select report_token into t from prospects where id = 'bbbbbbbb-0000-0000-0000-000000000001'; set role anon;
  assert public.public_prospect_report(t) is null, 'descartado/descadastrado deixa de ser público';
end $$;
reset role;
