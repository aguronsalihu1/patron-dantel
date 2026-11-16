-- 062: komanda "fshi_mall" (🗑️ te 📦 Regjistro mall, aprovuar nga Aguroni 16.11.2026): ura fshin në Pro-Data artikullin
-- dhe dokumentin e stokut (SF001) që i ka krijuar vetë. Vetëm Super Admini mund ta kërkojë.
alter table public.prodata_komandat drop constraint if exists prodata_komandat_lloji_check;
alter table public.prodata_komandat add constraint prodata_komandat_lloji_check check (lloji = any (array['artikull', 'cmim', 'klient', 'transfer', 'hyrje', 'dalje',
  'shpenzim', 'porosi_shitje', 'porosi_blerje', 'inventar', 'shitje', 'fature', 'fshi_mall']));
drop policy if exists shtim_te_lejuarit on public.prodata_komandat;
create policy shtim_te_lejuarit on public.prodata_komandat for insert to authenticated with check (
  (select public.prodata_lejuar()) and statusi = 'ne_pritje' and krijuar_nga = (select auth.uid())
  and (lloji = any (array['transfer', 'porosi_shitje', 'hyrje', 'dalje', 'shpenzim'])
       or (lloji = 'fshi_mall' and (select public.prodata_roli()) = 'admin')));
