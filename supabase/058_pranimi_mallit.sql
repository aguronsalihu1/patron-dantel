-- 058: 🚚 Pranimi i mallit (vendim i Aguronit, 14.11.2026): kur vjen malli i ri shënohet ngarkesa → pakot (sa kg) →
-- produktet në çdo pako (kodi, pesha) → prej aty krijohen artikujt e rinj me foto dhe çmim (regjistrimet_mallit, ura e shkrimit live)
-- dhe pyetet destinacioni (departamenti / magazina e Pro-Data-s ku hyn malli).
create table if not exists public.app_pranimet (
  id uuid primary key default gen_random_uuid(),
  krijuar timestamptz not null default now(),
  krijuar_nga uuid not null default auth.uid() references auth.users(id),
  krijuar_emri text,
  furnitori text,
  origjina text,                          -- turqi | kine | indi (parazgjedhje për produktet)
  nr_dokumentit text,                     -- fatura / CMR / nr. i dërgesës
  magazina text not null,                 -- destinacioni kryesor (kodi i magazinës në Pro-Data)
  shenim text,
  statusi text not null default 'hapur' check (statusi in ('hapur', 'mbyllur', 'anuluar'))
);
create index if not exists app_pranimet_krijuar on public.app_pranimet (krijuar desc);

create table if not exists public.app_pranimet_pakot (
  id uuid primary key default gen_random_uuid(),
  pranimi_id uuid not null references public.app_pranimet(id) on delete cascade,
  nr integer not null check (nr > 0),
  pesha_kg numeric(10,3) check (pesha_kg is null or (pesha_kg >= 0 and pesha_kg < 100000)),
  shenim text,
  unique (pranimi_id, nr)
);

alter table public.regjistrimet_mallit
  add column if not exists pranimi_id uuid references public.app_pranimet(id),
  add column if not exists pako_id uuid references public.app_pranimet_pakot(id),
  add column if not exists pesha_kg numeric(10,3) check (pesha_kg is null or (pesha_kg >= 0 and pesha_kg < 100000)),
  add column if not exists kodi_furnitorit text;
create index if not exists regjistrimet_mallit_pranimi on public.regjistrimet_mallit (pranimi_id) where pranimi_id is not null;

alter table public.app_pranimet enable row level security;
alter table public.app_pranimet_pakot enable row level security;

drop policy if exists lexim on public.app_pranimet;
create policy lexim on public.app_pranimet for select to authenticated using ((select public.prodata_lejuar()));
drop policy if exists krijim on public.app_pranimet;
create policy krijim on public.app_pranimet for insert to authenticated
  with check ((select public.prodata_lejo_regjistrim()) and krijuar_nga = (select auth.uid()));
drop policy if exists ndryshim on public.app_pranimet;
create policy ndryshim on public.app_pranimet for update to authenticated
  using ((select public.prodata_lejo_regjistrim())) with check ((select public.prodata_lejo_regjistrim()));

drop policy if exists lexim on public.app_pranimet_pakot;
create policy lexim on public.app_pranimet_pakot for select to authenticated using ((select public.prodata_lejuar()));
drop policy if exists krijim on public.app_pranimet_pakot;
create policy krijim on public.app_pranimet_pakot for insert to authenticated with check ((select public.prodata_lejo_regjistrim()));
drop policy if exists ndryshim on public.app_pranimet_pakot;
create policy ndryshim on public.app_pranimet_pakot for update to authenticated
  using ((select public.prodata_lejo_regjistrim())) with check ((select public.prodata_lejo_regjistrim()));

grant select, insert, update on public.app_pranimet, public.app_pranimet_pakot to authenticated;
