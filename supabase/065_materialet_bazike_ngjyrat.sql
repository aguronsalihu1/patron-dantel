-- 065: Materialet bazike pa ngjyrë + lista e ngjyrave (Aguroni, 19.11.2026).
-- Një etiketë për çdo material bazik (p.sh. B-0000204 Saten rus). Kur skanohet te shitja, faqja pyet ngjyrën (1–31)
-- dhe në Pro-Data shkon artikulli i ngjyrës B-0000204/<nr> që ekziston tashmë (stoku për ngjyrë mbetet i saktë).
create table if not exists public.ngjyrat (
  nr int primary key,
  emri text not null,
  hex text not null,
  aktive boolean not null default true
);
create table if not exists public.materialet_bazike (
  kodi text primary key,
  emri text not null,
  cmimi numeric(10,2) not null check (cmimi >= 0),
  njesia text not null default 'M',
  rendi int not null default 0,
  aktiv boolean not null default true,
  perditesuar timestamptz not null default now()
);
alter table public.ngjyrat enable row level security;
alter table public.materialet_bazike enable row level security;
drop policy if exists lexim on public.ngjyrat;
create policy lexim on public.ngjyrat for select to authenticated using ((select public.prodata_lejuar()));
drop policy if exists admin on public.ngjyrat;
create policy admin on public.ngjyrat for all to authenticated using ((select public.prodata_roli()) = 'admin') with check ((select public.prodata_roli()) = 'admin');
drop policy if exists lexim on public.materialet_bazike;
create policy lexim on public.materialet_bazike for select to authenticated using ((select public.prodata_lejuar()));
drop policy if exists admin on public.materialet_bazike;
create policy admin on public.materialet_bazike for all to authenticated using ((select public.prodata_roli()) = 'admin') with check ((select public.prodata_roli()) = 'admin');

insert into public.ngjyrat (nr, emri, hex) values
 (1,'Bardhë','#ffffff'),(2,'Qumësht','#f3eed9'),(3,'Nude','#f2c4ae'),(4,'Zezë','#111111'),(5,'Kuqe','#d9443f'),
 (6,'Gjelbërt','#6aae7e'),(7,'Kaltër','#1e88e5'),(8,'Vjollcë','#5b48b0'),(9,'Mint','#bfe3d6'),(10,'Babyblue','#9ec5ec'),
 (11,'Lejla','#b9c8f0'),(12,'Babypink','#f4c6dc'),(13,'Gold','#f0c886'),(14,'Pjepër','#f0957e'),(15,'Pink fuchia','#e8559a'),
 (16,'Kafe','#7a4a2a'),(17,'Orange','#f5a15a'),(18,'Verdhë','#f7e81e'),(19,'Lime','#2e9e6a'),(20,'Hiri','#a6a6a6'),
 (21,'Turkuaz','#2e9cbf'),(22,'Puder','#f5cfa0'),(23,'Silver','#d4d4d4'),(24,'Olive','#1f5e3b'),(25,'Pjeshkë','#f3a876'),
 (26,'Teget','#0d3f80'),(27,'Rosegold','#e38c9e'),(28,'Aqua','#2a8fe0'),(29,'Vishnje','#8e1f30'),(30,'Colorfull','multi'),
 (31,'Shampanjë','#ebddc3')
on conflict (nr) do nothing;

insert into public.materialet_bazike (rendi, emri, kodi, cmimi) values
 (1,'Saten mendafsh','B-00003010',10),(2,'Saten rus','B-0000204',4),(3,'Saten mat-amerikan','B-0000504',4),(4,'Taft','B-00006012',12),
 (5,'Krep','B-00004010',10),(6,'Gome e hollë','B-0000703',3),(7,'Gome e plotë','B-00008010',10),(8,'Gome me shkëlqim','B-0000908',8),
 (9,'Shtof gome','B-0001006',6),(10,'Gome Milano','B-0001210',10),(11,'Tyl konfeksion','B-0003605',5),(12,'Tyl hajal','B-0001302',2),
 (13,'Tyl kristal','B-0001602',2),(14,'Tyl i mirë','B-0001408',8),(15,'Tyl i mirë 3 m','B-0001508',8),(16,'Rrjet najllon','B-0001705',5),
 (17,'Rrjet e fortë','B-0001805',5),(18,'Organtin','B-0001906',6),(19,'Organtin','B-00021012',12),(20,'Organtin','B-0002025',25),
 (21,'Tyl plise','B-0002205',5),(22,'Zhorzhet plise','B-00023012',12),(23,'Zhorzhet','B-0002406',6),(24,'Zhorzhet me shkëlqim','B-00025012',12),
 (25,'Organtin me dizajn','B-00026015',15),(26,'Saten plise','B-00027015',15),(27,'Saten me shkëlqim 3 m','B-00029025',25),
 (28,'Ostar i thjeshtë','B-0003001.5',1.5),(29,'Mikado','B-00031015',15),(30,'Mikado 3 m','B-00034025',25),(31,'Brokade','B-00033024',24),
 (32,'Plish','B-0001107',7)
on conflict (kodi) do nothing;
