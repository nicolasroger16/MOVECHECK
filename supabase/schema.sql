-- MoveCheck — schéma Supabase
-- À exécuter une fois dans le SQL Editor de votre projet Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.bilans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  stripe_session_id text unique not null,
  prenom text not null,
  nom text not null,
  email text not null,
  telephone text,
  zone text,
  status text not null default 'paye', -- paye | filme | termine
  observations jsonb not null default '{}'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  email_sent boolean not null default false,
  created_at timestamptz not null default now(),
  filmed_at timestamptz
);

alter table public.bilans enable row level security;

-- Le dashboard praticien (Supabase Auth) peut tout lire et mettre à jour.
-- Les patients n'accèdent jamais directement à cette table : ils passent
-- toujours par les Edge Functions (clé service_role, qui contourne RLS).
create policy "authenticated read all bilans"
  on public.bilans for select
  to authenticated
  using (true);

create policy "authenticated update all bilans"
  on public.bilans for update
  to authenticated
  using (true);

-- Mur en direct : le dashboard écoute les changements sur cette table.
alter publication supabase_realtime add table public.bilans;

-- Stockage des vidéos de filmage, bucket privé.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

create policy "authenticated read videos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'videos');
