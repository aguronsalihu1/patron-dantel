-- 060: raporti i furnizimit (PDF me foto) printohet te printeri A4 i arkës përmes robotit, si letrat e Tel-Post-it:
-- faqja e ngarkon PDF-në te telposta-letrat/raportet/… dhe printimet merr {"pdf": "raportet/…pdf"}. 16.11.2026
drop policy if exists raportet_ngarkim on storage.objects;
create policy raportet_ngarkim on storage.objects for insert to authenticated
  with check (bucket_id = 'telposta-letrat' and name like 'raportet/%' and name ~ '^raportet/[A-Za-z0-9_\-./]+\.pdf$' and (select public.prodata_lejuar()));
