-- MUVENS OS — 0015 Novos serviços: RD Station Marketing, RD Station Conversas, Estratégia de automação, IA aplicada
alter table public.proposals drop constraint if exists proposals_template_check;
alter table public.proposals add constraint proposals_template_check
  check (template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','rd_marketing','rd_conversas','automacao','ia_aplicada','personalizado'));
alter table public.contract_templates drop constraint if exists contract_templates_service_template_check;
alter table public.contract_templates add constraint contract_templates_service_template_check
  check (service_template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','rd_marketing','rd_conversas','automacao','ia_aplicada','personalizado'));

-- modelos de contrato a partir do modelo-base já existente
insert into public.contract_templates (service_template, name, body)
select s, 'Modelo padrão', (select body from public.contract_templates where service_template = 'personalizado' order by name limit 1)
from unnest(array['rd_marketing','rd_conversas','automacao','ia_aplicada']) s
on conflict (service_template, name) do nothing;
