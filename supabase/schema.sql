-- MoveCheck — schéma Supabase
-- À exécuter dans le SQL Editor de votre projet Supabase. Ce script peut être
-- réexécuté sans risque (tout est idempotent) : à chaque évolution du projet,
-- relancez-le en entier, vos données existantes ne sont pas touchées.

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
drop policy if exists "authenticated read all bilans" on public.bilans;
create policy "authenticated read all bilans"
  on public.bilans for select
  to authenticated
  using (true);

drop policy if exists "authenticated update all bilans" on public.bilans;
create policy "authenticated update all bilans"
  on public.bilans for update
  to authenticated
  using (true);

-- Mur en direct : le dashboard écoute les changements sur cette table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bilans'
  ) then
    alter publication supabase_realtime add table public.bilans;
  end if;
end $$;

-- Stockage des vidéos de filmage, bucket privé.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists "authenticated read videos" on storage.objects;
create policy "authenticated read videos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'videos');

-- Abonnement "suivi trimestriel" (45€ / 3 mois) : un abonnement Stripe donne
-- lieu à un rebilan (nouvelle ligne dans bilans) à chaque renouvellement,
-- avec un nouveau code et le même parcours de filmage que le bilan initial.
create table if not exists public.abonnements (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text not null,
  stripe_subscription_id text unique not null,
  prenom text not null,
  nom text not null,
  email text not null,
  status text not null default 'active', -- active | past_due | canceled
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

alter table public.abonnements enable row level security;

drop policy if exists "authenticated read all abonnements" on public.abonnements;
create policy "authenticated read all abonnements"
  on public.abonnements for select
  to authenticated
  using (true);

drop policy if exists "authenticated update all abonnements" on public.abonnements;
create policy "authenticated update all abonnements"
  on public.abonnements for update
  to authenticated
  using (true);

-- Un bilan peut désormais venir d'un paiement ponctuel ou d'un cycle
-- d'abonnement. stripe_session_id ne s'applique qu'au premier cycle
-- (créé via Checkout) ; les renouvellements s'identifient par facture.
alter table public.bilans alter column stripe_session_id drop not null;
alter table public.bilans add column if not exists kind text not null default 'ponctuel'; -- ponctuel | abonnement
alter table public.bilans add column if not exists abonnement_id uuid references public.abonnements(id);
alter table public.bilans add column if not exists cycle_number int not null default 1;
alter table public.bilans add column if not exists stripe_invoice_id text unique;
