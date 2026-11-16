-- 061: "🗑️ Fshije" te 📦 Regjistro mall (16.11.2026, Aguroni): regjistrimi që s'ka hyrë ende në Pro-Data (ne_pritje / gabim)
-- shënohet 'anuluar' (s'fshihet fizikisht: mbetet gjurma). Vetë personi ose Super Admini/arka. Ato në Pro-Data nuk preken këtu.
drop policy if exists ndryshim on public.regjistrimet_mallit;
create policy ndryshim on public.regjistrimet_mallit for update to authenticated
  using ((select public.prodata_lejuar()) and ((select public.prodata_roli()) = any (array['admin', 'arka'])
         or (krijuar_nga = (select auth.uid()) and statusi in ('ne_pritje', 'gabim'))))
  with check ((select public.prodata_lejuar()) and ((select public.prodata_roli()) = any (array['admin', 'arka'])
         or (krijuar_nga = (select auth.uid()) and statusi in ('ne_pritje', 'gabim', 'anuluar'))));
