-- 063: raporti me foto kalon kufirin 400 KB të printimet.html → faqja e ngarkon raportin si skedar HTML te
-- telposta-letrat/raportet/…html dhe printimet merr vetëm { raport_rruga }. Roboti e shkarkon dhe e kthen në PDF A4. 16.11.2026
drop policy if exists raportet_ngarkim on storage.objects;
create policy raportet_ngarkim on storage.objects for insert to authenticated
  with check (bucket_id = 'telposta-letrat' and name like 'raportet/%' and name ~ '^raportet/[A-Za-z0-9_\-./]+\.(pdf|html)$' and (select public.prodata_lejuar()));
