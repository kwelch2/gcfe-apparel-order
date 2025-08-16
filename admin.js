/******** CONFIG ********/
// Your Google OAuth Client ID (you provided this)
const GIS_CLIENT_ID = '841013736027-qvvar311ihlv00k08jjpiomn4b0ajj0j.apps.googleusercontent.com';

// Optional: set your /exec here so the page works without typing it.
// Or pass it via URL like .../admin.html?base=https://script.google.com/macros/s/XXXX/exec
const DEFAULT_BASE  = 'https://script.google.com/macros/s/AKfycbyUVS_fgzCDUfGMFnXTA8do80dK2OtDZwrhgKYNPidyxpGQtfWaPzZhGsBP4P-k2Ua5Ww/exec'; // e.g., 'https://script.google.com/macros/s/AKfycb.../exec'

let ID_TOKEN = '';

/******** SETTINGS ********/
function getSettings() {
  return { base: localStorage.getItem('admin_base') || '' };
}
function setSettings(base){
  localStorage.setItem('admin_base', (base||'').trim());
}
function initBase() {
  const urlBase = new URL(location.href).searchParams.get('base');
  const saved   = localStorage.getItem('admin_base');
  const pick    = urlBase || saved || DEFAULT_BASE;
  if (pick) {
    setSettings(pick);
    const el = document.getElementById('baseUrl');
    if (el) el.value = pick;
  }
}
function buildUrl(qs){
  const { base } = getSettings();
  if (!base || !/^https?:\/\//.test(base) || !/\/exec$/.test(base)) {
    throw new Error('Set a valid Apps Script /exec base URL.');
  }
  return base + qs;
}

function adminUrl(qs) {
  if (!ID_TOKEN) throw new Error('Not signed in.');
  const joiner = qs.includes('?') ? '&' : '?';
  return buildUrl(qs + joiner + 'idToken=' + encodeURIComponent(ID_TOKEN));
}


/******** ADMIN API CALLS ********/
async function ping(){
  const res = await fetch(buildUrl('?__ping=1')); // public
  if (!res.ok) throw new Error('Ping failed');
  return res.text();
}
async function getLockState(){
  const res = await fetch(adminUrl(`?path=admin&action=getState`));
  if (!res.ok) throw new Error('State check failed');
  return res.json();
}
async function setLock(lock){
  const action = lock ? 'lockOrders' : 'unlockOrders';
  const res = await fetch(adminUrl(`?path=admin&action=${action}`));
  if (!res.ok) throw new Error('Toggle failed');
  return res.json();
}
async function searchOrders(q, paidFilter, fromDate, toDate){
  const url = adminUrl(`?path=admin&action=search&q=${encodeURIComponent(q)}&paid=${encodeURIComponent(paidFilter||'')}&from=${encodeURIComponent(fromDate||'')}&to=${encodeURIComponent(toDate||'')}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
async function togglePaid(orderId, paid){
  const action = paid ? 'markPaid' : 'markUnpaid';
  const res = await fetch(adminUrl(`?path=admin&action=${action}&orderId=${encodeURIComponent(orderId)}`));
  if (!res.ok) throw new Error('Paid toggle failed');   // restore this
  return res.json();
}
async function getOrder(orderId, lastLower){ // public lookup
  const res = await fetch(buildUrl(`?path=lookup&orderId=${encodeURIComponent(orderId)}&last=${encodeURIComponent(lastLower)}`));
  if (!res.ok) throw new Error('Lookup failed');
  return res.json();
}
async function paidTotals(){
  const res = await fetch(adminUrl(`?path=admin&action=paidTotals`));
  if (!res.ok) throw new Error('Totals failed');
  return res.json();
}
async function exportPaidCSV(){
  const res = await fetch(adminUrl(`?path=admin&action=exportPaidCSV`));
  if (!res.ok) throw new Error('Export failed');
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'paid_orders.csv';
  a.click();
}

/******** RENDERING ********/
function currency(n){ return new Intl.NumberFormat(undefined,{style:'currency', currency:'USD'}).format(n||0); }

function renderResults(list){
  const box = document.getElementById('results');
  if (!list || !list.length) { box.innerHTML = '<p style="color:#555">No results.</p>'; return; }
  const thead = `<thead><tr><th>Order ID</th><th>Name</th><th class="right">Total</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>`;
  let tbody = '<tbody>';
  list.forEach(r => {
    const paid = !!r.paid;
    const badge = paid ? '<span class="badge paid">PAID</span>' : '<span class="badge unpaid">UNPAID</span>';
    tbody += `<tr data-id="${r.orderId}" data-last="${String(r.last||'').toLowerCase()}">
      <td class="mono oid">${r.orderId}</td>
      <td class="name">${r.last}, ${r.first}</td>
      <td class="total right">${currency(Number(r.total||0))}</td>
      <td class="created">${new Date(r.created).toLocaleString()}</td>
      <td class="status">${badge}</td>
      <td class="actions">
        <button class="btn" data-toggle>${paid?'Mark Unpaid':'Mark Paid'}</button>
        <button class="btn" data-expand>Details</button>
      </td>
    </tr>`;
  });
  tbody += '</tbody>';
  box.innerHTML = `<table class="table">${thead}${tbody}</table>`;

  box.querySelectorAll('button[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const tr = ev.target.closest('tr');
      const id = tr.dataset.id;
      const isPaid = tr.querySelector('.status .paid') != null;
      try {
        await togglePaid(id, !isPaid);
        document.getElementById('searchBtn').click();
      } catch (e) { alert(e.message); }
    });
  });
  box.querySelectorAll('button[data-expand]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const tr = ev.target.closest('tr');
      const id = tr.dataset.id;
      const last = tr.dataset.last;
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('detail-row')) { next.remove(); return; }
      try {
        const o = await getOrder(id, last);
        const detail = buildDetailRow(o);
        tr.insertAdjacentElement('afterend', detail);
      } catch (e) { alert(e.message); }
    });
  });
}

function buildDetailRow(o){
  const tmpl = document.getElementById('detailTemplate');
  const row = tmpl.content.firstElementChild.cloneNode(true);
  row.querySelector('.contact').textContent = `${o.last}, ${o.first}`;
  row.querySelector('.email').textContent = o.email || '';
  row.querySelector('.phone').textContent = o.phone || '';
  const tbody = row.querySelector('.lines');
  (o.lines||[]).forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${l.sku||''}</td><td>${l.item||''}</td><td>${l.size||''}</td><td>${l.qty||0}</td><td>${l.customName||''}</td><td>${currency(l.unitPrice||0)}</td><td>${currency(l.lineTotal||0)}</td>`;
    tbody.appendChild(tr);
  });
  row.querySelector('[data-view]').href = buildUrl(`?path=lookup&orderId=${encodeURIComponent(o.orderId)}&last=${encodeURIComponent(String(o.last||'').toLowerCase())}`);
  row.querySelector('[data-print]').addEventListener('click', () => printPackSlip(o));
  return row;
}

function printPackSlip(o){
  const win = window.open('', '_blank', 'width=800,height=900');
  const lines = (o.lines||[]).map(l => (
    `<tr><td>${l.qty||0}</td><td>${l.size||''}</td><td>${l.item||''}</td><td>${l.customName||''}</td></tr>`
  )).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pack Slip ${o.orderId}</title>
    <style>
      body{font-family: system-ui, sans-serif;padding:20px;}
      table{width:100%;border-collapse:collapse;}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;}
    </style>
  </head><body>
    <h1>Packing Ticket</h1>
    <div><strong>Order:</strong> ${o.orderId}</div>
    <div><strong>Name:</strong> ${o.last}, ${o.first}</div>
    <div><strong>Created:</strong> ${new Date(o.created).toLocaleString()}</div>
    <div><strong>Email:</strong> ${o.email||''} — <strong>Phone:</strong> ${o.phone||''}</div>
    <table><thead><tr><th>Qty</th><th>Size</th><th>Item</th><th>Custom Name</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <h3 style="text-align:right">Total: ${currency(o.total||0)}</h3>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  win.document.write(html);
  win.document.close();
}

/******** GOOGLE SIGN-IN ********/
function onSignInSuccess(response) {
  ID_TOKEN = response.credential;
  const msg = document.getElementById('loginMsg');
  msg.textContent = 'Signing in…';

  // Build GET URL with idToken in the query (no headers, no preflight)
  let url;
  try {
    url = buildUrl(`?path=admin&action=verifyLogin&idToken=${encodeURIComponent(ID_TOKEN)}`);
  } catch (e) {
    msg.textContent = 'Base URL missing/invalid. Enter it and click Save.';
    return;
  }

  // You accidentally deleted this fetch(...) line — put it back
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data && data.allowed) {
        msg.textContent = 'Signed in as ' + (data.email || '');
        document.getElementById('login').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('testConn').click(); // ping + lock state
      } else {
        msg.textContent = 'Access denied for this Google account.';
      }
    })
    .catch(e => { msg.textContent = 'Login check failed: ' + e.message; });
}

function renderGsiButton() {
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({ client_id: GIS_CLIENT_ID, callback: onSignInSuccess });
    google.accounts.id.renderButton(document.getElementById('gsi'), { theme: 'outline', size: 'large' });
  } else {
    setTimeout(renderGsiButton, 200);
  }
}



/******** BOOT ********/
window.addEventListener('unhandledrejection', e => console.error('UNHANDLED:', e.reason));
window.addEventListener('error', e => console.error('ERROR:', e.message, e.error));

document.addEventListener('DOMContentLoaded', () => {
  initBase(); // fills the Base URL from ?base=, saved, or DEFAULT_BASE

  // Save/Test
  document.getElementById('saveConn').addEventListener('click', () => {
    const base = document.getElementById('baseUrl').value;
    setSettings(base);
    document.getElementById('connMsg').textContent = 'Saved.';
  });
  document.getElementById('testConn').addEventListener('click', async () => {
    try {
      const t = await ping();
      document.getElementById('connMsg').textContent = 'Ping OK: ' + t;
      const st = await getLockState();
      document.getElementById('lockState').textContent = st.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
    } catch (e) {
      document.getElementById('connMsg').textContent = e.message;
    }
  });

  // Search
  document.getElementById('searchBtn').addEventListener('click', async () => {
    const q = document.getElementById('query').value.trim();
    const pf = document.getElementById('paidFilter').value;
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;
    try {
      const out = await searchOrders(q, pf, from, to);
      renderResults(out.results);
    } catch (e) { alert(e.message); }
  });

  // Lock/Unlock
  document.getElementById('lockBtn').addEventListener('click', async () => {
    await setLock(true);
    const st = await getLockState();
    document.getElementById('lockState').textContent = st.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
  });
  document.getElementById('unlockBtn').addEventListener('click', async () => {
    await setLock(false);
    const st = await getLockState();
    document.getElementById('lockState').textContent = st.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
  });

  // Totals/Export
  document.getElementById('refreshTotals').addEventListener('click', async () => {
    const p = await paidTotals();
    document.getElementById('paidSum').textContent = 'Paid Sum: ' + currency(p.sum||0);
    document.getElementById('paidCount').textContent = 'Paid Orders: ' + (p.count||0);
    document.getElementById('totalsBreakdown').textContent = (p.byLast||[]).map(x => `${x.last}: ${currency(x.total)}`).join('  |  ');
  });
  document.getElementById('exportPaid').addEventListener('click', exportPaidCSV);

  // Render Google button
  renderGsiButton();
});
