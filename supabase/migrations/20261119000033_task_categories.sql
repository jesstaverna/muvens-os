-- Categorias de trabalho independentes da etapa do Kanban.
alter table public.tasks add column if not exists category text;
alter table public.tasks drop constraint if exists tasks_category_check;
alter table public.tasks add constraint tasks_category_check
check (category is null or category in
('interno','automacao_nutricao','branding_identidade','campanha_revops',
'diagnostico_gratuito','landing_page','site','trafego_pago','social_media','estrategia'));
comment on column public.tasks.category is 'Categoria da demanda, distinta do status e da área de produção.';
create index if not exists tasks_category_idx on public.tasks(category) where category is not null;
