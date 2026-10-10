-- MUVENS OS — 0007: serviços adicionais (Design de posts, Consultoria), escolha/troca de modelo no contrato

alter table public.proposals drop constraint if exists proposals_template_check;
alter table public.proposals add constraint proposals_template_check
  check (template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','personalizado'));
alter table public.contract_templates drop constraint if exists contract_templates_service_template_check;
alter table public.contract_templates add constraint contract_templates_service_template_check
  check (service_template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','personalizado'));

-- novos modelos a partir do modelo-base já existente
insert into public.contract_templates (service_template, name, body)
select s, 'Modelo padrão', (select body from public.contract_templates where service_template = 'personalizado' order by name limit 1)
from unnest(array['design_posts','consultoria']) s
on conflict (service_template, name) do nothing;

alter table public.contracts add column service_template text;
update public.contracts c set service_template = t.service_template from public.contract_templates t where t.id = c.template_id;

-- variáveis do contrato (extraído para reuso na geração e na troca de modelo)
create or replace function app.contract_vars(p_proposal uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.proposals; c public.clients; a public.agency_settings; v_escopo text; v_entreg text; v_pay text;
begin
  select * into p from public.proposals where id = p_proposal;
  select * into c from public.clients where id = p.client_id;
  select * into a from public.agency_settings where id = 1;
  select coalesce(string_agg('- ' || description, E'\n' order by position), '') into v_escopo from public.proposal_items where proposal_id = p.id;
  v_escopo := v_escopo || coalesce(E'\n' || (select string_agg('- ' || x, E'\n') from jsonb_array_elements_text(coalesce(p.content->'escopo', '[]'::jsonb)) x), '');
  select string_agg('- ' || x, E'\n') into v_entreg from jsonb_array_elements_text(coalesce(p.content->'entregaveis', '[]'::jsonb)) x;
  v_pay := concat_ws(E'\n',
    case when p.subtotal_one_time > 0 then 'Parte pontual: ' || app.brl(greatest(p.subtotal_one_time - p.discount_value, 0)) || ' em ' || p.installments || ' parcela(s).' end,
    case when p.subtotal_monthly > 0 then 'Mensalidade: ' || app.brl(p.subtotal_monthly) || ' por ' || p.contract_months || ' meses.' end,
    nullif(btrim(p.payment_terms), ''));
  return jsonb_build_object(
    'servico', p.title, 'contratante_nome', coalesce(nullif(c.legal_name, ''), c.name, p.client_display_name), 'contratante_documento', c.document, 'contratante_endereco', c.address,
    'contratada_nome', coalesce(a.legal_name, a.trade_name), 'contratada_documento', a.document, 'contratada_endereco', a.address,
    'contratada_representante', concat_ws(', ', a.representative_name, a.representative_role),
    'escopo', v_escopo, 'entregaveis', v_entreg, 'prazo_execucao', p.content->>'cronograma',
    'valor_total', app.brl(p.total_value), 'forma_pagamento', v_pay, 'vigencia', p.contract_months || ' meses, contados da data de início',
    'reajuste', '', 'cidade', a.city, 'data', to_char(app.br_date(now()), 'DD/MM/YYYY'));
end $$;

create or replace function app.generate_contract_core(p_proposal uuid, p_template uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.proposals; t public.contract_templates; v_id uuid;
begin
  select id into v_id from public.contracts where proposal_id = p_proposal and status <> 'cancelado';
  if v_id is not null then return v_id; end if;
  select * into p from public.proposals where id = p_proposal;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if p.status <> 'aceita' then raise exception 'Só é possível gerar contrato de proposta aceita' using errcode = '23514'; end if;
  if p_template is not null then select * into t from public.contract_templates where id = p_template and active;
  else select * into t from public.contract_templates where service_template = p.template and active order by name limit 1; end if;
  if t.id is null then select * into t from public.contract_templates where service_template = 'personalizado' and active order by name limit 1; end if;
  if t.id is null then raise exception 'Nenhum modelo de contrato ativo' using errcode = '23514'; end if;
  insert into public.contracts (proposal_id, client_id, template_id, service_template, title, body, total_value, contract_months, created_by)
  values (p.id, p.client_id, t.id, t.service_template, 'Contrato — ' || p.title, app.render_template(t.body, app.contract_vars(p.id)), p.total_value, p.contract_months, auth.uid())
  returning id into v_id;
  perform app.notify('Rascunho de contrato gerado', 'Proposta #' || p.number || ' (' || p.client_display_name || '): revise e aprove o contrato.', '/contratos/' || v_id, 'info', null, null, 'contract.draft:' || v_id);
  return v_id;
end $$;

-- Troca o modelo (serviço) enquanto o contrato ainda é rascunho/em revisão: regera o texto.
create or replace function public.change_contract_template(p_contract uuid, p_template uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contracts; t public.contract_templates;
begin
  if not app.has_role('admin','comercial') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status not in ('rascunho','em_revisao') then raise exception 'O modelo só pode ser trocado em rascunho ou revisão' using errcode = '23514'; end if;
  select * into t from public.contract_templates where id = p_template and active;
  if not found then raise exception 'Modelo não encontrado ou inativo' using errcode = '23514'; end if;
  update public.contracts set template_id = t.id, service_template = t.service_template, body = app.render_template(t.body, app.contract_vars(c.proposal_id)) where id = c.id;
end $$;

revoke execute on function public.change_contract_template(uuid, uuid) from public, anon;
grant execute on function public.change_contract_template(uuid, uuid) to authenticated;
revoke execute on function app.contract_vars(uuid) from public, anon, authenticated;
