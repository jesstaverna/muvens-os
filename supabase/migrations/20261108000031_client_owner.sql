-- MUVENS OS — 0031 Responsável pela conta (quem da Muvens cuida do cliente)
alter table public.clients add column if not exists owner_id uuid references public.profiles(id) on delete set null;
create index if not exists clients_owner_idx on public.clients (owner_id) where owner_id is not null;
