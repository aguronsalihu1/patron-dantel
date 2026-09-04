const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let CURRENT_EMPLOYEE = null;
let CURRENT_TAB = null;
let SCANNER = null;

/* ---------------- UTIL ---------------- */
function $(sel, root=document){ return root.querySelector(sel); }
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }
function fmtDate(d){ return new Date(d).toLocaleDateString('sq-AL',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function fmtMoney(n){ return (n==null? '—' : Number(n).toFixed(2)+' €'); }
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h); toast._h = setTimeout(()=>t.classList.remove('show'), 2400);
}
function genCode(prefix){
  const n = Math.floor(Math.random()*90000)+10000;
  return `${prefix}-${Date.now().toString().slice(-5)}${n%100}`;
}
function genBarcode(){
  let s=''; for(let i=0;i<12;i++) s+=Math.floor(Math.random()*10);
  return s;
}
function closeModal(){ $('#modal-root').innerHTML=''; if(SCANNER){ SCANNER.stop().catch(()=>{}); SCANNER=null; } }
function openModal(title, bodyNode, opts={}){
  closeModal();
  const wrap = el(`<div class="modal-backdrop"><div class="modal">
    <div class="modal-head"><h2 style="margin:0;">${title}</h2><button aria-label="Mbyll">&times;</button></div>
    <div class="modal-body"></div>
  </div></div>`);
  wrap.querySelector('.modal-head button').onclick = closeModal;
  wrap.addEventListener('click', e=>{ if(e.target===wrap) closeModal(); });
  wrap.querySelector('.modal-body').appendChild(bodyNode);
  $('#modal-root').appendChild(wrap);
}

async function startScanner(onDecoded){
  const box = el(`<div><div class="scan-box"><div id="reader"></div><p class="hint">Drejtoje kamerën te barkodi i materialit</p></div></div>`);
  openModal('Skano barkodin', box);
  await new Promise(r=>setTimeout(r,80)); // let modal mount
  SCANNER = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: 220, formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE ]};
  try{
    await SCANNER.start({ facingMode: "environment" }, config, (text)=>{
      const s = SCANNER; SCANNER = null;
      s.stop().then(()=>{ closeModal(); onDecoded(text); }).catch(()=>{ closeModal(); onDecoded(text); });
    });
  }catch(err){
    box.querySelector('.scan-box').innerHTML = `<p class="error-msg">Kamera s'u hap. Kontrollo lejet e shfletuesit.</p>`;
  }
}

function phoneToEmail(phone){
  const digits = String(phone).replace(/\D/g,'');
  return `p${digits}@patrondantel.local`;
}

/* ---------------- AUTH ---------------- */
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const raw = $('#login-email').value.trim();
  const pass = $('#login-pass').value;
  $('#login-error').style.display='none';
  let { error } = await sb.auth.signInWithPassword({ email: phoneToEmail(raw), password: pass });
  if(error && raw.includes('@')){
    ({ error } = await sb.auth.signInWithPassword({ email: raw, password: pass }));
  }
  if(error){ $('#login-error').textContent = 'Numri i telefonit/email-i ose fjalëkalimi gabim.'; $('#login-error').style.display='block'; return; }
  await afterLogin();
});
$('#logout-link').addEventListener('click', async (e)=>{ e.preventDefault(); await sb.auth.signOut(); location.reload(); });

async function afterLogin(){
  const { data: { user } } = await sb.auth.getUser();
  if(!user) return;
  const { data: emp, error } = await sb.from('employees').select('*').eq('auth_user_id', user.id).maybeSingle();
  if(error || !emp){
    $('#login-error').textContent = 'Llogaria jote nuk është e lidhur me asnjë punëtor. Kontakto adminin.';
    $('#login-error').style.display='block';
    await sb.auth.signOut();
    return;
  }
  CURRENT_EMPLOYEE = emp;
  $('#login-screen').style.display='none';
  $('#app').classList.add('active');
  $('#who-name').textContent = emp.full_name;
  $('#who-dept').textContent = DEPT_LABEL[emp.department] || emp.department;
  buildTabs();
}

const DEPT_LABEL = { shitje_online:'Shitje Online', shitje_fizike:'Shitje Fizike', arke:'Arkë', admin:'Admin' };

const ALL_TABS = [
  { id:'llogaria', label:'Llogaria', icon:'\ud83d\udc64', roles:['shitje_online','shitje_fizike','arke','admin'], render: renderLlogariaIme },
  { id:'depo', label:'Depo', icon:'📦', roles:['shitje_fizike','admin'], render: renderDepo },
  { id:'fizike', label:'Shitje', icon:'💳', roles:['shitje_fizike','admin'], render: renderShitjeFizike },
  { id:'fatura', label:'Faturë', icon:'🧾', roles:['shitje_fizike','admin'], render: renderFaturaTab },
  { id:'arka', label:'Arka', icon:'🏧', roles:['arke','admin'], render: renderArkaTab },
  { id:'online', label:'Online', icon:'💬', roles:['shitje_online','admin'], render: renderShitjeOnline },
  { id:'kliente', label:'Klientë', icon:'👥', roles:['shitje_online','shitje_fizike','admin'], render: renderKliente },
  { id:'puntore', label:'Punëtorë', icon:'🧑‍💼', roles:['admin'], render: renderPuntore },
  { id:'marketing', label:'Marketing', icon:'📣', roles:['admin'], render: renderMarketing },
  { id:'raporte', label:'Raporte', icon:'📊', roles:['admin'], render: renderRaporte },
];

function buildTabs(){
  const tabs = ALL_TABS.filter(t=>t.roles.includes(CURRENT_EMPLOYEE.department));
  const nav = $('#tabs'); nav.innerHTML='';
  tabs.forEach(t=>{
    const b = el(`<button data-id="${t.id}"><span class="ico">${t.icon}</span>${t.label}</button>`);
    b.onclick = ()=> switchTab(t.id);
    nav.appendChild(b);
  });
  switchTab(tabs[0].id);
}
function switchTab(id){
  CURRENT_TAB = id;
  [...$('#tabs').children].forEach(b=>b.classList.toggle('active', b.dataset.id===id));
  const tab = ALL_TABS.find(t=>t.id===id);
  const main = $('#main'); main.innerHTML = '<div class="empty">Duke ngarkuar…</div>';
  tab.render(main);
}

/* restore session on load */
sb.auth.getSession().then(({data})=>{ if(data.session) afterLogin(); });

/* =================================================================
   LLOGARIA IME \u2014 personal sales stats
   ================================================================= */
async function renderLlogariaIme(main){
  main.innerHTML = `
    <h1>Llogaria ime</h1>
    <div class="card">
      <div class="hint" style="margin:0 0 .3em;">${CURRENT_EMPLOYEE.full_name} \u00b7 ${DEPT_LABEL[CURRENT_EMPLOYEE.department]}</div>
    </div>
    <div id="li-body"><div class="empty">Duke llogaritur\u2026</div></div>
  `;
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

  const [{ data: fAll }, { data: oAll }] = await Promise.all([
    sb.from('physical_sales').select('quantity, price, created_at').eq('employee_id', CURRENT_EMPLOYEE.id).gte('created_at', startOfMonth.toISOString()),
    sb.from('online_orders').select('total_amount, created_at').eq('employee_id', CURRENT_EMPLOYEE.id).gte('created_at', startOfMonth.toISOString()),
  ]);

  const isToday = (d)=> new Date(d) >= startOfDay;
  const fToday = (fAll||[]).filter(s=>isToday(s.created_at));
  const oToday = (oAll||[]).filter(o=>isToday(o.created_at));

  const sumPrice = (arr, key)=> arr.reduce((a,x)=>a+(x[key]||0),0);

  const todayCount = fToday.length + oToday.length;
  const todayAmt = sumPrice(fToday,'price') + sumPrice(oToday,'total_amount');
  const monthCount = (fAll||[]).length + (oAll||[]).length;
  const monthAmt = sumPrice(fAll||[],'price') + sumPrice(oAll||[],'total_amount');

  $('#li-body').innerHTML = `
    <div class="card">
      <h2>Sot</h2>
      <div class="stats-row">
        <div class="stat"><span class="n">${todayCount}</span><span class="l">shitje</span></div>
        <div class="stat"><span class="n">${todayAmt.toFixed(0)}\u20ac</span><span class="l">vler\u00eb totale</span></div>
      </div>
    </div>
    <div class="card">
      <h2>K\u00ebt\u00eb muaj</h2>
      <div class="stats-row">
        <div class="stat"><span class="n">${monthCount}</span><span class="l">shitje</span></div>
        <div class="stat"><span class="n">${monthAmt.toFixed(0)}\u20ac</span><span class="l">vler\u00eb totale</span></div>
      </div>
    </div>
  `;
}

/* =================================================================
   DEPO \u2014 Inventari
   ================================================================= */
async function renderDepo(main){
  main.innerHTML = `
    <div class="row between"><h1>Depo</h1><button id="add-mat">+ Regjistro material</button></div>
    <div class="row" style="margin-bottom:1em;">
      <button class="secondary" id="scan-lookup">📷 Skano për të parë sasinë</button>
    </div>
    <div class="search-bar">
      <input id="mat-search" placeholder="Kërko sipas emrit, kodit ose barkodit…">
    </div>
    <div id="mat-list"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#add-mat').onclick = ()=> openMaterialForm();
  $('#scan-lookup').onclick = ()=> startScanner(async (code)=>{
    const m = await findMaterialByCode(code);
    if(!m){ toast('Nuk u gjet material me këtë kod.'); return; }
    showMaterialDetail(m);
  });
  $('#mat-search').addEventListener('input', debounce(loadMaterials, 250));
  await loadMaterials();
}
async function findMaterialByCode(code){
  const { data } = await sb.from('materials').select('*').or(`barcode.eq.${code},code.eq.${code}`).maybeSingle();
  return data;
}
function debounce(fn, ms){ let h; return (...a)=>{ clearTimeout(h); h=setTimeout(()=>fn(...a), ms); }; }

async function loadMaterials(){
  const q = ($('#mat-search')?.value || '').trim();
  let query = sb.from('materials').select('*').order('created_at',{ascending:false});
  if(q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,barcode.ilike.%${q}%,color.ilike.%${q}%`);
  const { data, error } = await query.limit(100);
  const box = $('#mat-list'); if(!box) return;
  if(error){ box.innerHTML = `<div class="empty">Gabim: ${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = `<div class="empty">Nuk ka materiale ende.</div>`; return; }
  box.innerHTML = '';
  data.forEach(m=>{
    const low = m.quantity_available <= 5;
    const row = el(`<div class="card" style="display:flex;gap:.8em;align-items:center;cursor:pointer;">
      <img class="material-photo" style="width:56px;height:56px;margin:0;flex:none;" src="${m.photo_url || ''}" onerror="this.style.visibility='hidden'">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;">${m.name} ${m.color? '· '+m.color:''}</div>
        <div class="hint" style="margin:0;">${m.code} ${m.barcode? '· '+m.barcode:''}</div>
        <div class="hint" style="margin:0;">📍 ${m.location || 'pa lokacion'}</div>
      </div>
      <div style="text-align:right;">
        <div class="pill ${low?'danger':'ok'}">${m.quantity_available} ${m.unit}</div>
      </div>
    </div>`);
    row.onclick = ()=> showMaterialDetail(m);
    box.appendChild(row);
  });
}

function showMaterialDetail(m){
  const body = el(`<div>
    ${m.photo_url? `<img class="material-photo" src="${m.photo_url}">` : ''}
    <div class="grid2">
      <div><label>Kodi</label>${m.code}</div>
      <div><label>Barkodi</label>${m.barcode||'—'}</div>
      <div><label>Ngjyra</label>${m.color||'—'}</div>
      <div><label>Lloji</label>${m.material_type||'—'}</div>
      <div><label>Furnizuesi</label>${m.supplier||'—'}</div>
      <div><label>Origjina</label>${m.origin_country||'—'}</div>
      <div><label>Lokacioni</label>${m.location||'—'}</div>
      <div><label>Sasia e mbetur</label><strong>${m.quantity_available} ${m.unit}</strong></div>
    </div>
    <div class="row" style="margin-top:1em;">
      <button class="secondary small" id="edit-loc">Ndrysho lokacionin</button>
    </div>
  </div>`);
  openModal(m.name, body);
  body.querySelector('#edit-loc').onclick = async ()=>{
    const loc = prompt('Lokacioni i ri:', m.location||'');
    if(loc==null) return;
    await sb.from('materials').update({location:loc}).eq('id', m.id);
    toast('Lokacioni u përditësua.'); closeModal(); loadMaterials();
  };
}

function openMaterialForm(){
  const form = el(`<form id="mat-form">
    <label>Foto e materialit</label>
    <input type="file" accept="image/*" capture="environment" id="mf-photo">
    <img id="mf-preview" class="material-photo" style="display:none;">
    <label>Emri i materialit *</label><input id="mf-name" required>
    <div class="grid2">
      <div><label>Ngjyra</label><input id="mf-color"></div>
      <div><label>Lloji i materialit</label><input id="mf-type"></div>
      <div><label>Furnizuesi</label><input id="mf-supplier"></div>
      <div><label>Vendi i origjinës</label><input id="mf-origin"></div>
      <div><label>Sasia (metra) *</label><input id="mf-qty" type="number" step="0.1" required></div>
      <div><label>Lokacioni në depo</label><input id="mf-loc" placeholder="p.sh. Rafti A-3"></div>
      <div><label>Kodi i brendshëm</label><input id="mf-code" placeholder="Auto-gjenerohet nëse lihet bosh"></div>
      <div><label>Barkodi</label><input id="mf-barcode" placeholder="Auto-gjenerohet nëse lihet bosh"></div>
    </div>
    <button type="submit" style="width:100%;margin-top:1.2em;">Regjistro hyrjen</button>
  </form>`);
  form.querySelector('#mf-photo').addEventListener('change', (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const img = form.querySelector('#mf-preview');
    img.src = URL.createObjectURL(f); img.style.display='block';
  });
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Duke ruajtur…';
    try{
      let photo_url = null;
      const file = form.querySelector('#mf-photo').files[0];
      if(file){
        const path = `${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
        const { error: upErr } = await sb.storage.from('material-photos').upload(path, file);
        if(upErr) throw upErr;
        photo_url = sb.storage.from('material-photos').getPublicUrl(path).data.publicUrl;
      }
      const qty = parseFloat(form.querySelector('#mf-qty').value);
      const code = form.querySelector('#mf-code').value.trim() || genCode('PD');
      const barcode = form.querySelector('#mf-barcode').value.trim() || genBarcode();
      const payload = {
        code, barcode,
        name: form.querySelector('#mf-name').value.trim(),
        color: form.querySelector('#mf-color').value.trim() || null,
        material_type: form.querySelector('#mf-type').value.trim() || null,
        supplier: form.querySelector('#mf-supplier').value.trim() || null,
        origin_country: form.querySelector('#mf-origin').value.trim() || null,
        location: form.querySelector('#mf-loc').value.trim() || null,
        quantity_total: qty, quantity_available: qty,
        photo_url, added_by: CURRENT_EMPLOYEE.id,
      };
      const { data: mat, error } = await sb.from('materials').insert(payload).select().single();
      if(error) throw error;
      await sb.from('material_movements').insert({ material_id: mat.id, type:'hyrje', quantity_change:0, employee_id: CURRENT_EMPLOYEE.id, note:'Regjistrim fillestar' });
      toast('Materiali u regjistrua.');
      closeModal(); loadMaterials();
    }catch(err){ alert('Gabim: '+err.message); btn.disabled=false; btn.textContent='Regjistro hyrjen'; }
  });
  openModal('Regjistro hyrje malli', form);
}

/* =================================================================
   SHITJE FIZIKE
   ================================================================= */
async function renderShitjeFizike(main){
  main.innerHTML = `
    <div class="row between"><h1>Shitje fizike</h1><button id="sf-scan">📷 Skano barkodin</button></div>
    <div class="search-bar"><input id="sf-search" placeholder="Ose kërko materialin me emër/kod…"></div>
    <div id="sf-results"></div>
    <h2 style="margin-top:1.4em;">Shitjet e sotme</h2>
    <div id="sf-today"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#sf-scan').onclick = ()=> startScanner(async (code)=>{
    const m = await findMaterialByCode(code);
    if(!m){ toast('Nuk u gjet material.'); return; }
    openSaleForm(m);
  });
  $('#sf-search').addEventListener('input', debounce(async ()=>{
    const q = $('#sf-search').value.trim();
    const box = $('#sf-results'); if(!q){ box.innerHTML=''; return; }
    const { data } = await sb.from('materials').select('*').or(`name.ilike.%${q}%,code.ilike.%${q}%`).limit(8);
    box.innerHTML='';
    (data||[]).forEach(m=>{
      const row = el(`<div class="card" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
        <div><strong>${m.name}</strong> <span class="hint">${m.code}</span></div>
        <div class="pill ok">${m.quantity_available} ${m.unit}</div>
      </div>`);
      row.onclick = ()=> openSaleForm(m);
      box.appendChild(row);
    });
  }, 250));
  await loadTodaySales();
}
function openSaleForm(m){
  const form = el(`<form id="sale-form">
    <p>Sasia e mbetur: <strong>${m.quantity_available} ${m.unit}</strong></p>
    <label>Sasia e shitur (${m.unit}) *</label><input id="sf-qty" type="number" step="0.1" max="${m.quantity_available}" required>
    <label>Çmimi total (€)</label><input id="sf-price" type="number" step="0.01">
    <label>Klienti (opsionale)</label><input id="sf-customer" placeholder="Emri i klientit">
    <button type="submit" style="width:100%;margin-top:1.2em;">Regjistro shitjen</button>
  </form>`);
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const qty = parseFloat(form.querySelector('#sf-qty').value);
    if(qty > m.quantity_available){ alert('Sasia e kërkuar e kalon sasinë e mbetur.'); return; }
    const btn = form.querySelector('button'); btn.disabled=true;
    let customer_id = null;
    const custName = form.querySelector('#sf-customer').value.trim();
    if(custName){
      const { data: existing } = await sb.from('customers').select('*').ilike('name', custName).maybeSingle();
      if(existing){ customer_id = existing.id; }
      else{ const { data: nc } = await sb.from('customers').insert({name:custName, customer_type:'klient_thjeshte'}).select().single(); customer_id = nc?.id; }
    }
    const price = parseFloat(form.querySelector('#sf-price').value) || null;
    await sb.from('physical_sales').insert({ material_id:m.id, customer_id, quantity:qty, price, employee_id: CURRENT_EMPLOYEE.id });
    await sb.from('material_movements').insert({ material_id:m.id, type:'shitje_fizike', quantity_change:-qty, employee_id: CURRENT_EMPLOYEE.id });
    toast('Shitja u regjistrua.'); closeModal(); renderShitjeFizike($('#main'));
  });
  openModal(`Shit: ${m.name}`, form);
}
async function loadTodaySales(){
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const { data, error } = await sb.from('physical_sales').select('*, materials(name,unit), employees(full_name)').gte('created_at', startOfDay.toISOString()).order('created_at',{ascending:false});
  const box = $('#sf-today'); if(!box) return;
  if(error){ box.innerHTML=`<div class="empty">Gabim: ${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty">Ende s\'ka shitje sot.</div>'; return; }
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Materiali</th><th>Sasia</th><th>Çmimi</th><th>Shitësi</th></tr></thead><tbody>
    ${data.map(s=>`<tr><td>${s.materials?.name||'—'}</td><td>${s.quantity} ${s.materials?.unit||''}</td><td>${fmtMoney(s.price)}</td><td>${s.employees?.full_name||'—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

/* =================================================================
   FATURË — shitësja i përgatit faturën, klienti e çon te arka
   ================================================================= */
const INVOICE_STATUS_LABEL = { draft:'Në pritje të pagesës', paid:'Paguar', cancelled:'Anuluar' };

function genInvoiceCode(){
  const n = Math.floor(Math.random()*900000)+100000;
  return `F${n}`;
}

async function renderFaturaTab(main){
  main.innerHTML = `
    <div class="row between"><h1>Faturë e re</h1><button id="new-invoice">+ Krijo faturë</button></div>
    <p class="hint">Shto materialet që zgjodhi klienti, krijo faturën, dhe tregoja klientit kodin/barkodin që del — e çon te arka për ta paguar.</p>
    <h2 style="margin-top:1.2em;">Faturat e mia sot</h2>
    <div id="inv-list"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#new-invoice').onclick = ()=> openInvoiceForm();
  await loadMyInvoices();
}

async function loadMyInvoices(){
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const { data, error } = await sb.from('invoices').select('*').eq('created_by', CURRENT_EMPLOYEE.id).gte('created_at', startOfDay.toISOString()).order('created_at',{ascending:false});
  const box = $('#inv-list'); if(!box) return;
  if(error){ box.innerHTML = `<div class="empty">Gabim: ${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty">Ende s\'ke krijuar asnjë faturë sot.</div>'; return; }
  box.innerHTML = '';
  data.forEach(inv=>{
    const statusClass = inv.status==='paid' ? 'ok' : inv.status==='cancelled' ? 'muted' : 'warn';
    const row = el(`<div class="card row between" style="cursor:pointer;">
      <div>
        <strong>${inv.code}</strong> ${inv.customer_name? '· '+inv.customer_name:''}
        <div class="hint" style="margin:0;">${fmtMoney(inv.total_amount)} · ${fmtDate(inv.created_at)}</div>
      </div>
      <span class="pill ${statusClass}">${INVOICE_STATUS_LABEL[inv.status]}</span>
    </div>`);
    row.onclick = ()=> showInvoiceBarcode(inv);
    box.appendChild(row);
  });
}

function openInvoiceForm(){
  const items = [];
  const form = el(`<form id="inv-form">
    <label>Klienti (emri, opsionale)</label>
    <input id="if-customer" placeholder="Emri i klientit">

    <label>Materialet</label>
    <div class="row">
      <input id="if-mat-search" placeholder="Kërko material me emër/kod…" style="flex:2;">
      <button type="button" id="if-scan" class="secondary small">📷 Skano</button>
    </div>
    <div id="if-mat-results"></div>
    <div id="if-items" style="margin:.6em 0;"></div>
    <div class="row between" style="margin-top:.4em;">
      <strong>Total</strong><strong id="if-total">0.00 €</strong>
    </div>
    <button type="submit" style="width:100%;margin-top:1.2em;">Krijo faturën</button>
    <div class="error-msg" id="if-error" style="display:none;"></div>
  </form>`);

  function renderItems(){
    const total = items.reduce((a,it)=>a+it.line_total,0);
    form.querySelector('#if-total').textContent = fmtMoney(total);
    form.querySelector('#if-items').innerHTML = items.map((it,i)=>`
      <div class="row between" style="padding:.3em 0;border-bottom:1px solid var(--line);">
        <span>${it.name} · ${it.quantity} ${it.unit}</span>
        <span class="row" style="gap:.4em;">${fmtMoney(it.line_total)}<button type="button" data-i="${i}" class="ghost small rm-item">✕</button></span>
      </div>`).join('') || '<div class="hint">Ende pa materiale</div>';
    form.querySelectorAll('.rm-item').forEach(b=> b.onclick = ()=>{ items.splice(+b.dataset.i,1); renderItems(); });
  }

  function addItemFlow(m){
    const qty = prompt(`Sasia e ${m.name} (${m.unit}), e mbetur: ${m.quantity_available} ${m.unit}`, '1');
    if(!qty) return;
    const q = parseFloat(qty);
    if(!q || q<=0 || q>m.quantity_available){ alert('Sasi e pavlefshme.'); return; }
    const price = prompt(`Çmimi total për ${q} ${m.unit} ${m.name} (€):`, '');
    if(price==null) return;
    const p = parseFloat(price) || 0;
    items.push({ material_id:m.id, name:m.name, unit:m.unit, quantity:q, line_total:p });
    form.querySelector('#if-mat-search').value=''; form.querySelector('#if-mat-results').innerHTML='';
    renderItems();
  }

  form.querySelector('#if-mat-search').addEventListener('input', debounce(async ()=>{
    const q = form.querySelector('#if-mat-search').value.trim();
    const box = form.querySelector('#if-mat-results'); if(!q){ box.innerHTML=''; return; }
    const { data } = await sb.from('materials').select('*').or(`name.ilike.%${q}%,code.ilike.%${q}%`).limit(6);
    box.innerHTML='';
    (data||[]).forEach(m=>{
      const row = el(`<div class="card" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:.6em .8em;">
        <div><strong>${m.name}</strong> <span class="hint">${m.code}</span></div>
        <div class="pill ok">${m.quantity_available} ${m.unit}</div>
      </div>`);
      row.onclick = ()=> addItemFlow(m);
      box.appendChild(row);
    });
  }, 250));
  form.querySelector('#if-scan').onclick = ()=> startScanner(async (code)=>{
    const m = await findMaterialByCode(code);
    if(!m){ toast('Nuk u gjet material me këtë kod.'); return; }
    addItemFlow(m);
  });
  renderItems();

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!items.length){ alert('Shto të paktën një material.'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    const total = items.reduce((a,it)=>a+it.line_total,0);
    const code = genInvoiceCode();
    const { data: inv, error } = await sb.from('invoices').insert({
      code, customer_name: form.querySelector('#if-customer').value.trim()||null,
      items, total_amount: total, created_by: CURRENT_EMPLOYEE.id,
    }).select().single();
    if(error){ form.querySelector('#if-error').textContent = error.message; form.querySelector('#if-error').style.display='block'; btn.disabled=false; return; }
    closeModal(); loadMyInvoices();
    showInvoiceBarcode(inv);
  });
  openModal('Faturë e re', form);
}

function showInvoiceBarcode(inv){
  const items = Array.isArray(inv.items) ? inv.items : [];
  const body = el(`<div style="text-align:center;">
    <div class="pill ${inv.status==='paid'?'ok':inv.status==='cancelled'?'muted':'warn'}" style="margin-bottom:.8em;">${INVOICE_STATUS_LABEL[inv.status]}</div>
    <svg id="inv-barcode"></svg>
    <h2 style="margin:.4em 0;">${fmtMoney(inv.total_amount)}</h2>
    <p class="hint">${inv.customer_name || 'Pa emër klienti'}</p>
    <div class="table-wrap" style="text-align:left;margin-top:1em;">
      <table><thead><tr><th>Materiali</th><th>Sasia</th><th>Çmimi</th></tr></thead><tbody>
        ${items.map(it=>`<tr><td>${it.name}</td><td>${it.quantity} ${it.unit}</td><td>${fmtMoney(it.line_total)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <p class="hint" style="margin-top:1em;">Tregoja klientit këtë ekran te arka — arkatarja e skanon dhe realizon pagesën.</p>
  </div>`);
  openModal(`Faturë ${inv.code}`, body);
  setTimeout(()=>{
    try{ JsBarcode('#inv-barcode', inv.code, { format:'CODE128', width:2.4, height:70, fontSize:18, margin:8 }); }catch(e){}
  }, 30);
}

/* =================================================================
   ARKA — arkatarja skanon faturën, merr pagesën, mbyll shitjen
   ================================================================= */
async function renderArkaTab(main){
  main.innerHTML = `
    <h1>Arka</h1>
    <div class="card">
      <label>Skano barkodin e faturës (me lexues USB ose kamerë)</label>
      <div class="row">
        <input id="ar-code" placeholder="Kodi i faturës (p.sh. F123456)" autofocus>
        <button type="button" id="ar-scan" class="secondary">📷</button>
      </div>
    </div>
    <div id="ar-result"></div>
    <h2 style="margin-top:1.4em;">Barazimi i sotëm — ${CURRENT_EMPLOYEE.full_name}</h2>
    <div id="ar-recon"><div class="empty">Duke ngarkuar…</div></div>
  `;
  const input = $('#ar-code');
  input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){ e.preventDefault(); lookupInvoiceCode(input.value.trim()); input.value=''; }
  });
  $('#ar-scan').onclick = ()=> startScanner((code)=> lookupInvoiceCode(code));
  await loadReconciliation();
}

async function lookupInvoiceCode(code){
  if(!code) return;
  const { data: inv, error } = await sb.from('invoices').select('*').eq('code', code.trim()).maybeSingle();
  const box = $('#ar-result');
  if(error || !inv){ box.innerHTML = `<div class="card"><p class="error-msg">Nuk u gjet asnjë faturë me kodin "${code}".</p></div>`; return; }
  renderInvoiceAtRegister(inv);
}

function renderInvoiceAtRegister(inv){
  const box = $('#ar-result'); if(!box) return;
  const items = Array.isArray(inv.items) ? inv.items : [];
  if(inv.status === 'paid'){
    box.innerHTML = `<div class="card"><p class="pill ok">Tashmë e paguar</p><h2>${fmtMoney(inv.total_amount)}</h2><p class="hint">Fatura ${inv.code} u pagua më ${fmtDate(inv.paid_at)}.</p></div>`;
    return;
  }
  if(inv.status === 'cancelled'){
    box.innerHTML = `<div class="card"><p class="pill muted">Anuluar</p><p class="hint">Fatura ${inv.code} është anuluar.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="card">
    <div class="hint" style="margin:0;">${inv.code} ${inv.customer_name? '· '+inv.customer_name:''}</div>
    <div class="table-wrap" style="margin:.6em 0;">
      <table><thead><tr><th>Materiali</th><th>Sasia</th><th>Çmimi</th></tr></thead><tbody>
        ${items.map(it=>`<tr><td>${it.name}</td><td>${it.quantity} ${it.unit}</td><td>${fmtMoney(it.line_total)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="row between"><h2 style="margin:0;">Për pagesë:</h2><h2 style="margin:0;">${fmtMoney(inv.total_amount)}</h2></div>
    <button id="ar-confirm" style="width:100%;margin-top:1em;">Konfirmo pagesën (Cash)</button>
  </div>`;
  box.querySelector('#ar-confirm').onclick = async ()=>{
    const btn = box.querySelector('#ar-confirm'); btn.disabled=true; btn.textContent='Duke konfirmuar…';
    try{
      const { error: updErr } = await sb.from('invoices').update({ status:'paid', paid_at:new Date().toISOString(), cashier_id: CURRENT_EMPLOYEE.id }).eq('id', inv.id).eq('status','draft');
      if(updErr) throw updErr;
      for(const it of items){
        await sb.from('material_movements').insert({ material_id: it.material_id, type:'shitje_fizike', quantity_change:-it.quantity, employee_id: CURRENT_EMPLOYEE.id, note:`Faturë ${inv.code}` });
        await sb.from('physical_sales').insert({ material_id: it.material_id, quantity: it.quantity, price: it.line_total, customer_id: inv.customer_id, employee_id: inv.created_by, invoice_id: inv.id });
      }
      toast(`Pagesa u konfirmua — ${fmtMoney(inv.total_amount)}`);
      box.innerHTML = `<div class="card"><p class="pill ok">U realizua</p><h2>${fmtMoney(inv.total_amount)}</h2><p class="hint">Vendose në arkë.</p></div>`;
      loadReconciliation();
    }catch(err){ alert('Gabim: '+err.message); btn.disabled=false; btn.textContent='Konfirmo pagesën (Cash)'; }
  };
}

async function loadReconciliation(){
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const box = $('#ar-recon'); if(!box) return;
  let query = sb.from('invoices').select('*').eq('status','paid').gte('paid_at', startOfDay.toISOString()).order('paid_at',{ascending:false});
  if(CURRENT_EMPLOYEE.department !== 'admin') query = query.eq('cashier_id', CURRENT_EMPLOYEE.id);
  const { data, error } = await query;
  if(error){ box.innerHTML = `<div class="empty">${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty">Ende s\'ka pagesa sot.</div>'; return; }
  const total = data.reduce((a,i)=>a+(i.total_amount||0),0);
  box.innerHTML = `
    <div class="stats-row" style="margin-bottom:.8em;">
      <div class="stat"><span class="n">${data.length}</span><span class="l">fatura të paguara</span></div>
      <div class="stat"><span class="n">${total.toFixed(0)}€</span><span class="l">gjithsej në arkë</span></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Kodi</th><th>Ora</th><th>Shuma</th></tr></thead><tbody>
      ${data.map(i=>`<tr><td>${i.code}</td><td>${new Date(i.paid_at).toLocaleTimeString('sq-AL',{hour:'2-digit',minute:'2-digit'})}</td><td>${fmtMoney(i.total_amount)}</td></tr>`).join('')}
    </tbody></table></div>
  `;
}

/* =================================================================
   SHITJE ONLINE
   ================================================================= */
const PLATFORM_LABEL = { facebook:'Facebook', instagram:'Instagram', tiktok:'TikTok', viber:'Viber', whatsapp:'WhatsApp', tjeter:'Tjetër' };
const STATUS_LABEL = { regjistruar:'Regjistruar', paketuar:'Paketuar', dergohet:'Në dërgesë', dorezuar:'Dorëzuar', problem:'Problem', anuluar:'Anuluar' };

async function renderShitjeOnline(main){
  main.innerHTML = `
    <div class="row between"><h1>Shitje online</h1><button id="new-order">+ Porosi e re</button></div>
    <div id="oo-list"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#new-order').onclick = ()=> openOrderForm();
  await loadOrders();
}
async function loadOrders(){
  const { data, error } = await sb.from('online_orders').select('*, customers(name, blacklisted)').order('created_at',{ascending:false}).limit(60);
  const box = $('#oo-list'); if(!box) return;
  if(error){ box.innerHTML=`<div class="empty">Gabim: ${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty">Ende s\'ka porosi online.</div>'; return; }
  box.innerHTML = '';
  data.forEach(o=>{
    const items = Array.isArray(o.items) ? o.items : [];
    const row = el(`<div class="card">
      <div class="row between">
        <div><strong>${o.customers?.name || 'Klient i panjohur'}</strong> ${o.customers?.blacklisted? '<span class="bl-flag">⛔ BLACKLIST</span>':''}</div>
        <span class="pill muted">${PLATFORM_LABEL[o.platform]||o.platform}</span>
      </div>
      <div class="hint" style="margin:.3em 0;">${items.map(i=>`${i.name} × ${i.quantity}`).join(', ')}</div>
      <div class="row between">
        <span class="hint" style="margin:0;">${fmtDate(o.created_at)} ${o.tel_post_tracking_id? '· Tel Post: '+o.tel_post_tracking_id:''}</span>
        <select data-id="${o.id}" class="oo-status" style="width:auto;">
          ${Object.entries(STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>`);
    row.querySelector('.oo-status').addEventListener('change', async (e)=>{
      await sb.from('online_orders').update({status:e.target.value, updated_at:new Date().toISOString()}).eq('id', o.id);
      toast('Statusi u përditësua.');
    });
    box.appendChild(row);
  });
}

async function openOrderForm(){
  const { data: materials } = await sb.from('materials').select('id,name,unit,quantity_available').order('name');
  const items = [];
  const form = el(`<form id="oo-form">
    <label>Klienti (kërko ose shkruaj emër të ri) *</label>
    <input id="oo-customer" list="oo-cust-list" required placeholder="Emri i klientit">
    <datalist id="oo-cust-list"></datalist>
    <div id="oo-bl-warn" class="error-msg" style="display:none;">⛔ Ky klient është në black listë!</div>
    <label>Platforma *</label>
    <select id="oo-platform">${Object.entries(PLATFORM_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>

    <label>Artikujt e porosisë</label>
    <div class="row">
      <select id="oo-mat-pick" style="flex:2;">${materials.map(m=>`<option value="${m.id}">${m.name} (${m.quantity_available} ${m.unit})</option>`).join('')}</select>
      <input id="oo-mat-qty" type="number" step="0.1" placeholder="Sasia" style="flex:1;">
      <button type="button" id="oo-add-item" class="secondary small">Shto</button>
    </div>
    <div id="oo-items" style="margin:.6em 0;"></div>

    <label>Çmimi total (€)</label><input id="oo-total" type="number" step="0.01">
    <label>Nr. gjurmimi Tel Post (nëse ka)</label><input id="oo-telpost" placeholder="Plotësohet pas krijimit të porosisë në telposta.com">
    <button type="submit" style="width:100%;margin-top:1.2em;">Regjistro porosinë</button>
  </form>`);

  async function refreshCustomerList(q){
    const dl = form.querySelector('#oo-cust-list'); dl.innerHTML='';
    if(!q) return;
    const { data } = await sb.from('customers').select('id,name,blacklisted').ilike('name', `%${q}%`).limit(6);
    (data||[]).forEach(c=>dl.appendChild(el(`<option value="${c.name}" data-bl="${c.blacklisted}">`)));
  }
  form.querySelector('#oo-customer').addEventListener('input', debounce(async (e)=>{
    await refreshCustomerList(e.target.value.trim());
    const opt = [...form.querySelector('#oo-cust-list').children].find(o=>o.value===e.target.value);
    form.querySelector('#oo-bl-warn').style.display = (opt && opt.dataset.bl==='true') ? 'block':'none';
  }, 250));

  function renderItems(){
    form.querySelector('#oo-items').innerHTML = items.map((it,i)=>`<div class="row between"><span>${it.name} × ${it.quantity}</span><button type="button" data-i="${i}" class="ghost small rm-item">✕</button></div>`).join('') || '<div class="hint">Ende pa artikuj</div>';
    form.querySelectorAll('.rm-item').forEach(b=> b.onclick = ()=>{ items.splice(+b.dataset.i,1); renderItems(); });
  }
  form.querySelector('#oo-add-item').onclick = ()=>{
    const sel = form.querySelector('#oo-mat-pick');
    const qty = parseFloat(form.querySelector('#oo-mat-qty').value);
    if(!qty || qty<=0) return;
    const m = materials.find(x=>x.id===sel.value);
    items.push({ material_id:m.id, name:m.name, quantity:qty });
    form.querySelector('#oo-mat-qty').value='';
    renderItems();
  };
  renderItems();

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!items.length){ alert('Shto të paktën një artikull.'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled=true;
    const custName = form.querySelector('#oo-customer').value.trim();
    let customer;
    const { data: existing } = await sb.from('customers').select('*').ilike('name', custName).maybeSingle();
    if(existing) customer = existing;
    else { const { data: nc } = await sb.from('customers').insert({name:custName, customer_type:'klient_thjeshte'}).select().single(); customer = nc; }

    const { data: order, error } = await sb.from('online_orders').insert({
      customer_id: customer.id,
      platform: form.querySelector('#oo-platform').value,
      items,
      total_amount: parseFloat(form.querySelector('#oo-total').value) || null,
      tel_post_tracking_id: form.querySelector('#oo-telpost').value.trim() || null,
      employee_id: CURRENT_EMPLOYEE.id,
    }).select().single();
    if(error){ alert('Gabim: '+error.message); btn.disabled=false; return; }
    for(const it of items){
      await sb.from('material_movements').insert({ material_id: it.material_id, type:'shitje_online', quantity_change:-it.quantity, employee_id: CURRENT_EMPLOYEE.id, note:`Porosia ${order.id}` });
    }
    toast('Porosia u regjistrua.'); closeModal(); loadOrders();
  });
  openModal('Porosi e re online', form);
}

/* =================================================================
   KLIENTË
   ================================================================= */
async function renderKliente(main){
  main.innerHTML = `
    <div class="row between"><h1>Klientë</h1><button id="new-cust">+ Klient i ri</button></div>
    <div class="search-bar"><input id="c-search" placeholder="Kërko klientin…"></div>
    <div id="c-list"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#new-cust').onclick = ()=> openCustomerForm();
  $('#c-search').addEventListener('input', debounce(loadCustomers, 250));
  await loadCustomers();
}
async function loadCustomers(){
  const q = ($('#c-search')?.value||'').trim();
  let query = sb.from('customers').select('*').order('created_at',{ascending:false});
  if(q) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query.limit(100);
  const box = $('#c-list'); if(!box) return;
  if(error){ box.innerHTML = `<div class="empty">Gabim: ${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty">Ende s\'ka klientë.</div>'; return; }
  box.innerHTML = '';
  data.forEach(c=>{
    const row = el(`<div class="card row between">
      <div>
        <strong>${c.name}</strong> ${c.blacklisted? '<span class="bl-flag">⛔ Blackliste</span>':''}
        <div class="hint" style="margin:0;">${c.customer_type||'—'} ${c.phone? '· '+c.phone:''}</div>
      </div>
      <button class="ghost small bl-toggle">${c.blacklisted?'Hiq nga lista':'Vendos në blackliste'}</button>
    </div>`);
    row.querySelector('.bl-toggle').onclick = async ()=>{
      let reason = null;
      if(!c.blacklisted){ reason = prompt('Arsyeja (opsionale):') || null; }
      await sb.from('customers').update({blacklisted: !c.blacklisted, blacklist_reason: reason}).eq('id', c.id);
      loadCustomers();
    };
    box.appendChild(row);
  });
}
function openCustomerForm(){
  const form = el(`<form id="cust-form">
    <label>Emri *</label><input id="cf-name" required>
    <label>Lloji</label>
    <select id="cf-type"><option value="klient_thjeshte">Klient i thjeshtë</option><option value="dizajner">Dizajner</option><option value="lokal">Lokal materialesh</option></select>
    <label>Telefoni</label><input id="cf-phone">
    <label>Shënime</label><textarea id="cf-notes" rows="2"></textarea>
    <button type="submit" style="width:100%;margin-top:1.2em;">Ruaj klientin</button>
  </form>`);
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    await sb.from('customers').insert({
      name: form.querySelector('#cf-name').value.trim(),
      customer_type: form.querySelector('#cf-type').value,
      phone: form.querySelector('#cf-phone').value.trim()||null,
      notes: form.querySelector('#cf-notes').value.trim()||null,
    });
    toast('Klienti u ruajt.'); closeModal(); loadCustomers();
  });
  openModal('Klient i ri', form);
}

/* =================================================================
   PUNTORË (admin)
   ================================================================= */
async function renderPuntore(main){
  main.innerHTML = `
    <div class="row between"><h1>Punëtorë</h1><button id="new-emp">+ Punëtor i ri</button></div>
    <p class="hint">Kliko "+ Punëtor i ri" për të krijuar direkt llogarinë e tij (telefon + fjalëkalim) — pa pasur nevojë të hysh te Supabase.</p>
    <div id="emp-list"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#new-emp').onclick = ()=> openEmployeeForm();
  await loadEmployees();
}
async function callManageEmployee(payload){
  const { data: { session } } = await sb.auth.getSession();
  const resp = await fetch(`${window.SUPABASE_URL}/functions/v1/manage-employee`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`, 'apikey': window.SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  });
  const result = await resp.json();
  if(!resp.ok) throw new Error(result.error || 'Gabim i panjohur.');
  return result;
}
async function loadEmployees(){
  const { data: emps, error } = await sb.from('employees').select('*').order('created_at',{ascending:false});
  const box = $('#emp-list'); if(!box) return;
  if(error){ box.innerHTML = `<div class="empty">${error.message}</div>`; return; }
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0,0,0,0);
  const { data: fSales } = await sb.from('physical_sales').select('employee_id, quantity, price').gte('created_at', startMonth.toISOString());
  const { data: oOrders } = await sb.from('online_orders').select('employee_id, total_amount').gte('created_at', startMonth.toISOString());
  box.innerHTML = '';
  emps.forEach(emp=>{
    const fs = (fSales||[]).filter(s=>s.employee_id===emp.id);
    const oo = (oOrders||[]).filter(o=>o.employee_id===emp.id);
    const totalAmt = fs.reduce((a,s)=>a+(s.price||0),0) + oo.reduce((a,o)=>a+(o.total_amount||0),0);
    const count = fs.length + oo.length;
    const isMe = emp.auth_user_id === CURRENT_EMPLOYEE.auth_user_id;
    const card = el(`<div class="card">
      <div class="row between">
        <div><strong>${emp.full_name}</strong><div class="hint" style="margin:0;">${DEPT_LABEL[emp.department]}${emp.phone? ' · '+emp.phone:''}</div></div>
        <span class="pill ${emp.active?'ok':'muted'}">${emp.active?'Aktiv':'Joaktiv'}</span>
      </div>
      <div class="stats-row" style="margin-top:.6em;">
        <div class="stat"><span class="n">${count}</span><span class="l">shitje këtë muaj</span></div>
        <div class="stat"><span class="n">${totalAmt.toFixed(0)}€</span><span class="l">vlerë e gjeneruar</span></div>
      </div>
      <div class="row" style="margin-top:.8em;">
        <button type="button" class="ghost small ef-reset">Ndrysho fjalëkalimin</button>
        <button type="button" class="ghost small ef-toggle">${emp.active?'Çaktivizo':'Aktivizo'}</button>
        ${isMe? '' : '<button type="button" class="danger small ef-delete">Fshij</button>'}
      </div>
    </div>`);
    card.querySelector('.ef-reset').onclick = async ()=>{
      const np = prompt(`Fjalëkalimi i ri për ${emp.full_name}:`, genTempPassword());
      if(!np) return;
      try{ await callManageEmployee({ action:'reset_password', employee_id: emp.id, new_password: np }); toast('Fjalëkalimi u ndryshua. Jepja punëtorit.'); }
      catch(err){ alert(err.message); }
    };
    card.querySelector('.ef-toggle').onclick = async ()=>{
      try{ await callManageEmployee({ action:'toggle_active', employee_id: emp.id }); loadEmployees(); }
      catch(err){ alert(err.message); }
    };
    const delBtn = card.querySelector('.ef-delete');
    if(delBtn) delBtn.onclick = async ()=>{
      if(!confirm(`Të fshihet përgjithmonë llogaria e ${emp.full_name}? Ky veprim s'kthehet mbrapa.`)) return;
      try{ await callManageEmployee({ action:'delete', employee_id: emp.id }); toast('Llogaria u fshi.'); loadEmployees(); }
      catch(err){ alert(err.message); }
    };
    box.appendChild(card);
  });
}
function genTempPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s=''; for(let i=0;i<10;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function openEmployeeForm(){
  const suggested = genTempPassword();
  const form = el(`<form id="emp-form">
    <label>Emri i plotë *</label><input id="ef-name" required>
    <label>Numri i telefonit (do ta përdorë për të hyrë) *</label><input id="ef-phone" type="tel" required placeholder="p.sh. 044 123 456">
    <label>Fjalëkalimi fillestar *</label>
    <div class="row"><input id="ef-pass" value="${suggested}" required style="flex:1;"><button type="button" id="ef-regen" class="ghost small">↻</button></div>
    <p class="hint">Jepja këtë fjalëkalim punëtorit — mund ta ndryshosh sërish më vonë nga kjo faqe.</p>
    <label>Departamenti *</label>
    <select id="ef-dept"><option value="shitje_fizike">Shitje Fizike</option><option value="shitje_online">Shitje Online</option><option value="arke">Arkë</option><option value="admin">Admin</option></select>
    <button type="submit" style="width:100%;margin-top:1.2em;">Krijo llogarinë e punëtorit</button>
    <div class="error-msg" id="ef-error" style="display:none;"></div>
  </form>`);
  form.querySelector('#ef-regen').onclick = ()=>{ form.querySelector('#ef-pass').value = genTempPassword(); };
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Duke krijuar…';
    const errBox = form.querySelector('#ef-error'); errBox.style.display='none';
    try{
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${window.SUPABASE_URL}/functions/v1/create-employee`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`, 'apikey': window.SUPABASE_ANON_KEY },
        body: JSON.stringify({
          full_name: form.querySelector('#ef-name').value.trim(),
          phone: form.querySelector('#ef-phone').value.trim(),
          password: form.querySelector('#ef-pass').value,
          department: form.querySelector('#ef-dept').value,
        }),
      });
      const result = await resp.json();
      if(!resp.ok) throw new Error(result.error || 'Gabim i panjohur.');
      toast('Llogaria u krijua. Jepja numrin e telefonit dhe fjalëkalimin punëtorit.');
      closeModal(); loadEmployees();
    }catch(err){
      errBox.textContent = err.message; errBox.style.display='block';
      btn.disabled=false; btn.textContent='Krijo llogarinë e punëtorit';
    }
  });
  openModal('Punëtor i ri', form);
}

/* =================================================================
   MARKETING
   ================================================================= */
async function renderMarketing(main){
  main.innerHTML = `
    <div class="row between"><h1>Marketing</h1><button id="new-post">+ Regjistro postim</button></div>
    <p class="hint">Regjistro postimet/storiet dhe rezultatet e tyre për të parë çka po funksionon.</p>
    <div id="mk-list"><div class="empty">Duke ngarkuar…</div></div>
  `;
  $('#new-post').onclick = ()=> openPostForm();
  await loadPosts();
}
async function loadPosts(){
  const { data, error } = await sb.from('marketing_posts').select('*, materials(name)').order('post_date',{ascending:false}).limit(50);
  const box = $('#mk-list'); if(!box) return;
  if(error){ box.innerHTML = `<div class="empty">${error.message}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty">Ende s\'ka postime të regjistruara.</div>'; return; }
  box.innerHTML = '';
  data.forEach(p=>{
    box.appendChild(el(`<div class="card">
      <div class="row between"><strong>${PLATFORM_LABEL[p.platform]||p.platform}</strong><span class="hint">${p.post_date? fmtDate(p.post_date):''}</span></div>
      <div>${p.description||''} ${p.materials?.name? '· <em>'+p.materials.name+'</em>':''}</div>
      <div class="stats-row" style="margin-top:.4em;">
        <div class="stat"><span class="n">${p.likes||0}</span><span class="l">pëlqime</span></div>
        <div class="stat"><span class="n">${p.comments||0}</span><span class="l">komente</span></div>
        <div class="stat"><span class="n">${p.shares||0}</span><span class="l">ndarje</span></div>
        <div class="stat"><span class="n">${p.resulted_sales_count||0}</span><span class="l">shitje rezultuese</span></div>
      </div>
      ${p.post_url? `<p style="margin-top:.5em;"><a href="${p.post_url}" target="_blank" rel="noopener">Shiko postimin ↗</a></p>`:''}
    </div>`));
  });
}
async function openPostForm(){
  const { data: materials } = await sb.from('materials').select('id,name').order('name');
  const form = el(`<form id="post-form">
    <label>Platforma *</label>
    <select id="pf-platform">${Object.entries(PLATFORM_LABEL).filter(([k])=>k!=='tjeter').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
    <label>Lidhja e postimit</label><input id="pf-url" placeholder="https://…">
    <label>Data</label><input id="pf-date" type="date">
    <label>Përshkrimi</label><textarea id="pf-desc" rows="2" placeholder="Çka u postua"></textarea>
    <label>Materiali i lidhur (opsionale)</label>
    <select id="pf-mat"><option value="">—</option>${materials.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select>
    <div class="grid2">
      <div><label>Pëlqime</label><input id="pf-likes" type="number"></div>
      <div><label>Komente</label><input id="pf-comments" type="number"></div>
      <div><label>Ndarje</label><input id="pf-shares" type="number"></div>
      <div><label>Shitje rezultuese</label><input id="pf-sales" type="number"></div>
    </div>
    <button type="submit" style="width:100%;margin-top:1.2em;">Ruaj</button>
  </form>`);
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    await sb.from('marketing_posts').insert({
      platform: form.querySelector('#pf-platform').value,
      post_url: form.querySelector('#pf-url').value.trim()||null,
      post_date: form.querySelector('#pf-date').value||null,
      description: form.querySelector('#pf-desc').value.trim()||null,
      related_material_id: form.querySelector('#pf-mat').value||null,
      likes: parseInt(form.querySelector('#pf-likes').value)||0,
      comments: parseInt(form.querySelector('#pf-comments').value)||0,
      shares: parseInt(form.querySelector('#pf-shares').value)||0,
      resulted_sales_count: parseInt(form.querySelector('#pf-sales').value)||0,
    });
    toast('Postimi u ruajt.'); closeModal(); loadPosts();
  });
  openModal('Regjistro postim', form);
}

/* =================================================================
   RAPORTE
   ================================================================= */
async function renderRaporte(main){
  main.innerHTML = `<h1>Raporte</h1><div id="rp-body"><div class="empty">Duke llogaritur…</div></div>`;
  const { data: moves } = await sb.from('material_movements').select('material_id, type, quantity_change, materials(name,color,material_type)').in('type',['shitje_fizike','shitje_online']);
  const byMat = {}; const byColor = {}; const byType = {};
  (moves||[]).forEach(m=>{
    const qty = Math.abs(m.quantity_change);
    const name = m.materials?.name || '—';
    byMat[name] = (byMat[name]||0) + qty;
    if(m.materials?.color) byColor[m.materials.color] = (byColor[m.materials.color]||0)+qty;
    if(m.materials?.material_type) byType[m.materials.material_type] = (byType[m.materials.material_type]||0)+qty;
  });
  const top = (obj)=> Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const bar = (rows, unit='m')=> rows.length? rows.map(([k,v])=>`<div class="row between" style="padding:.3em 0;border-bottom:1px solid var(--line);"><span>${k}</span><strong>${v.toFixed(1)} ${unit}</strong></div>`).join('') : '<div class="empty">Ende pa të dhëna.</div>';

  $('#rp-body').innerHTML = `
    <div class="card"><h2>Materialet më të shitura</h2>${bar(top(byMat))}</div>
    <div class="card"><h2>Ngjyrat më të kërkuara</h2>${bar(top(byColor))}</div>
    <div class="card"><h2>Llojet e materialit më të kërkuara</h2>${bar(top(byType))}</div>
  `;
}
