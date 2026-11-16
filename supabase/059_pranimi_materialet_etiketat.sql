-- 059: Pranimi i mallit sipas Excel-it të furnizimit (p.sh. "furnizim 007 India 14.11.26"), vendim i Aguronit 16.11.2026:
--  ngarkesa (nr. i furnizimit, transportuesi, origjina) → pakot (kg) → MATERIALET (kodi i furnitorit, kodi i materialit
--  nga furnitori, kodi ynë i materialit p.sh. I103, emri, çmimi/m) → NGJYRAT e secilit material (ngjyra, nr., rollet × metra,
--  kg total → kg/m, foto) = një artikull në Pro-Data (kodi = I103 + 0 + çmimi + /nr). Pastaj njoftim te depoja → etiketat → ✔️.
alter table public.app_pranimet
  add column if not exists nr_furnizimit text,
  add column if not exists transportuesi text,
  add column if not exists etiketat_statusi text check (etiketat_statusi in ('ne_pritje', 'perfunduar')),
  add column if not exists etiketat_njoftuar timestamptz,
  add column if not exists etiketat_perfunduar timestamptz,
  add column if not exists etiketat_perfunduar_nga text;

create table if not exists public.app_pranimet_materialet (
  id uuid primary key default gen_random_uuid(),
  krijuar timestamptz not null default now(),
  pranimi_id uuid not null references public.app_pranimet(id) on delete cascade,
  kodi_furnitorit text,                    -- p.sh. pd303
  kodi_materialit_furnitorit text,         -- p.sh. r-36639
  materiali text,                          -- dantelle | bazike | aksesore | cope
  origjina text,                           -- turqi | kine | indi
  kodi_materialit text not null,           -- kodi ynë i materialit pa çmim e ngjyrë, p.sh. I103 (rezervon numrin 103)
  emri text not null,
  cmimi numeric(12,2) not null check (cmimi > 0 and cmimi < 100000),   -- çmimi i shitjes me TVSH për metër/copë
  njesia text not null default 'M'
);
create index if not exists app_pranimet_materialet_pr on public.app_pranimet_materialet (pranimi_id);

alter table public.regjistrimet_mallit
  add column if not exists materiali_id uuid references public.app_pranimet_materialet(id),
  add column if not exists rollet jsonb,                 -- [{ "n": 2, "m": 6.5 }] = 2 rolle nga 6.5 m
  add column if not exists ngjyra_emri text,             -- p.sh. hiri, gold
  add column if not exists kodi_materialit_furnitorit text;

alter table public.app_pranimet_materialet enable row level security;
drop policy if exists lexim on public.app_pranimet_materialet;
create policy lexim on public.app_pranimet_materialet for select to authenticated using ((select public.prodata_lejuar()));
drop policy if exists krijim on public.app_pranimet_materialet;
create policy krijim on public.app_pranimet_materialet for insert to authenticated with check ((select public.prodata_lejo_regjistrim()));
drop policy if exists ndryshim on public.app_pranimet_materialet;
create policy ndryshim on public.app_pranimet_materialet for update to authenticated
  using ((select public.prodata_lejo_regjistrim())) with check ((select public.prodata_lejo_regjistrim()));
grant select, insert, update on public.app_pranimet_materialet to authenticated;

-- Depoja (roli depo) duhet të mund ta shënojë "✔️ etiketat u printuan" edhe pa lejen e regjistrimit të mallit.
create or replace function public.pranimi_etiketat_perfundo(p_pranimi uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (select prodata_lejuar()) then raise exception 'Nuk ke të drejtë'; end if;
  update regjistrimet_mallit set etiketa_printuar = coalesce(etiketa_printuar, now())
   where pranimi_id = p_pranimi and statusi = 'kryer';
  get diagnostics n = row_count;
  update app_pranimet set etiketat_statusi = 'perfunduar', etiketat_perfunduar = now(),
         etiketat_perfunduar_nga = (select coalesce(nullif(emri, ''), 'llogaria') from prodata_perdoruesit where user_id = auth.uid())
   where id = p_pranimi;
  return n;
end $$;
revoke all on function public.pranimi_etiketat_perfundo(uuid) from public;
grant execute on function public.pranimi_etiketat_perfundo(uuid) to authenticated;

-- Njoftimet live te depoja (faqja dëgjon ndryshimet e ngarkesave)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_pranimet') then
    alter publication supabase_realtime add table public.app_pranimet;
  end if;
end $$;

-- kodi_i_radhes: edhe kodet e materialeve të pranimit (p.sh. I103) e zënë numrin, që dy materiale të mos marrin të njëjtin numër
create or replace function public.kodi_i_radhes(p_prefiksi text)
 returns table(prefiksi text, seq text, gjatesia integer, kodi_fundit text, emri_fundit text, nr bigint)
 language sql stable security definer set search_path to 'public'
as $function$
with arg as (select upper(replace(trim(p_prefiksi), '-', '')) as a),
src as (
  select prodata_id::bigint as rendi, kodi, emri, cmimi from prodata_artikujt, arg
   where kodi is not null and prodata_id ~ '^[0-9]+$' and upper(replace(kodi, '-', '')) like arg.a || '%' and (select prodata_lejuar())
  union all
  select 900000000000 + row_number() over (order by krijuar), kodi, emri, cmimi_shitjes from regjistrimet_mallit, arg
   where lloji = 'artikull_i_ri' and statusi in ('ne_pritje', 'ne_proces') and kodi is not null
     and upper(replace(kodi, '-', '')) like arg.a || '%' and (select prodata_lejuar())
  union all
  select 950000000000 + row_number() over (order by krijuar), kodi_materialit, emri, null::numeric from app_pranimet_materialet, arg
   where upper(replace(kodi_materialit, '-', '')) like arg.a || '%' and (select prodata_lejuar())
),
p as (
  select rendi, kodi, emri, substring(kodi from '^[A-Za-zëËçÇ]*-?') as pref,
         substring(substring(kodi from length(substring(kodi from '^[A-Za-zëËçÇ]*-?')) + 1) from '^[0-9.]+') as d,
         case when cmimi > 0 then trim_scale(cmimi)::text end as ps
  from src
),
s as (
  select p.*, coalesce(
    (select left(p.d, length(p.d) - length(repeat('0', k) || p.ps)) from generate_series(3, 1, -1) k
      where p.ps is not null and right(p.d, length(repeat('0', k) || p.ps)) = repeat('0', k) || p.ps and length(p.d) > length(repeat('0', k) || p.ps) limit 1),
    case when p.ps is null and p.d ~ '^[0-9]+$' then p.d end) as seq
  from p, arg where p.d is not null and upper(replace(p.pref, '-', '')) = arg.a
),
f as (select s.*, length(s.seq) as gj, s.seq::bigint as n, row_number() over (order by s.rendi desc) as rr from s where s.seq ~ '^[0-9]+$' and length(s.seq) in (3, 4)),
gjat as (select coalesce((select gj from f where rr <= 40 group by gj order by count(distinct n) desc, gj limit 1), 3) as gj),
seri as (select f.*, row_number() over (order by f.rendi desc) as rs from f, gjat where f.gj = gjat.gj),
emri_pref as (select coalesce((select pref from p, arg where upper(replace(pref, '-', '')) = arg.a group by pref order by count(*) desc limit 1), trim(p_prefiksi)) as pr),
mx as (select coalesce(max(n) filter (where rs <= 20), 0) as m, coalesce(array_agg(n), '{}'::bigint[]) as zena from seri)
select (select pr from emri_pref),
       lpad((select min(x) from mx, generate_series(mx.m + 1, mx.m + 1000) x where x <> all (mx.zena))::text, (select gj from gjat), '0'),
       (select gj from gjat),
       (select kodi from seri where rs = 1), (select emri from seri where rs = 1), (select count(*) from seri);
$function$;
