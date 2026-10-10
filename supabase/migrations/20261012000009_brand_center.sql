-- MUVENS OS — Fase 2 / Brand Center (identidade visual por cliente) e base de conhecimento para a IA

create table public.brand_profiles (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  tone_of_voice    text,
  design_rules     text,
  restrictions     text,          -- restrições de aplicação (o que NÃO fazer)
  ai_instructions  text,          -- instruções específicas para a IA/briefings desta marca
  updated_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);
create table public.brand_colors (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null default 'primaria' check (role in ('primaria','secundaria','apoio','neutra')),
  position int not null default 0
);
create index brand_colors_client_idx on public.brand_colors (client_id, position);
create table public.brand_fonts (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, usage text not null default 'texto' check (usage in ('titulo','texto','destaque')), source_url text,
  position int not null default 0
);
create index brand_fonts_client_idx on public.brand_fonts (client_id);
create table public.brand_links (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null default 'outro' check (kind in ('figma','drive','outro')), label text not null,
  url text not null check (url ~* '^https?://')
);
create index brand_links_client_idx on public.brand_links (client_id);
create table public.brand_assets (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('logo','variacao','kv','brandbook','foto','elemento','template','referencia','editavel','outro')),
  name text not null, description text, tags text[] not null default '{}',
  path text not null unique, size bigint, mime text,
  downloadable boolean not null default true,     -- false = só administrador baixa (download autorizado)
  uploaded_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create index brand_assets_client_idx on public.brand_assets (client_id, category);
create index brand_assets_search_idx on public.brand_assets (lower(name));

create trigger trg_brand_profiles_audit after insert or update or delete on public.brand_profiles for each row execute function app.audit();
create or replace function app.brand_profiles_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
create trigger trg_brand_profiles_touch before insert or update on public.brand_profiles for each row execute function app.brand_profiles_touch();
create trigger trg_brand_assets_audit after insert or update or delete on public.brand_assets for each row execute function app.audit();

-- Base de conhecimento da marca para a IA (Fase 4): regras criativas + paleta + tipografia + links + inventário de arquivos.
-- security invoker: respeita a permissão de quem consulta.
create or replace function public.brand_knowledge(p_client uuid) returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'client', (select name from public.clients where id = p_client),
    'tone_of_voice', (select tone_of_voice from public.brand_profiles where client_id = p_client),
    'design_rules', (select design_rules from public.brand_profiles where client_id = p_client),
    'restrictions', (select restrictions from public.brand_profiles where client_id = p_client),
    'ai_instructions', (select ai_instructions from public.brand_profiles where client_id = p_client),
    'colors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'hex', hex, 'role', role) order by position) from public.brand_colors where client_id = p_client), '[]'::jsonb),
    'fonts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'usage', usage) order by position) from public.brand_fonts where client_id = p_client), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'url', url)) from public.brand_links where client_id = p_client), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'name', name, 'description', description, 'tags', tags)) from public.brand_assets where client_id = p_client), '[]'::jsonb))
$$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['brand_profiles','brand_colors','brand_fonts','brand_links','brand_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_role(''admin'',''comercial'',''designer'',''trafego''))', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.has_role(''admin'',''comercial'',''designer'')) with check (app.has_role(''admin'',''comercial'',''designer''))', t || '_write', t);
  end loop;
end $$;
revoke execute on function public.brand_knowledge(uuid) from public, anon;
grant execute on function public.brand_knowledge(uuid) to authenticated, service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('brand-assets', 'brand-assets', false, 52428800) on conflict (id) do nothing;
    execute $p$create policy "brand assets read" on storage.objects for select to authenticated using (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "brand assets write" on storage.objects for insert to authenticated with check (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer'))$p$;
    execute $p$create policy "brand assets delete" on storage.objects for delete to authenticated using (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer'))$p$;
  end if;
end $$;
