
// --- simple passcode gate ---
const PASSCODE = 'GemFireEms';

function getSettings() {
  return {
    base: localStorage.getItem('admin_base') || '',
    token: localStorage.getItem('admin_token') || ''
  };
}
function setSettings(base, token){
  localStorage.setItem('admin_base', base.trim());
  localStorage.setItem('admin_token', token.trim());
}
function buildUrl(qs){
  const { base } = getSettings();
  if (!base || !/^https?:\/\//.test(base) || !/\/exec$/.test(base)) {
    throw new Error('Set a valid Apps Script /exec base URL.');
  }
  return base + qs;
}
async function ping(){
  const res = await fetch(buildUrl('?__ping=1'));
  if (!res.ok) throw new Error('Ping failed');
  return res.text();
}
async function getLockState(){
  const { token } = getSettings();
  const res = await fetch(buildUrl(`?path=admin&action=getState&token=${encodeURIComponent(token)}`));
  if (!res.ok) throw new Error('State check failed');
  return res.json();
}
async function setLock(lock){
  const { token } = getSettings();
  const action = lock ? 'lockOrders' : 'unlockOrders';
  const res = await fetch(buildUrl(`?path=admin&action=${action}&token=${encodeURIComponent(token)}`));
  if (!res.ok) throw new Error('Toggle failed');
  return res.json();
}
async function searchOrders(q, paidFilter, fromDate, toDate){
  const { token } = getSettings();
  const url = buildUrl(`?path=admin&action=search&q=${encodeURIComponent(q)}&paid=${encodeURIComponent(paidFilter||'')}&from=${encodeURIComponent(fromDate||'')}&to=${encodeURIComponent(toDate||'')}&token=${encodeURIComponent(token)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
async function togglePaid(orderId, paid){
  const { token } = getSettings();
  const action = paid ? 'markPaid' : 'markUnpaid';
  const res = await fetch(buildUrl(`?path=admin&action=${action}&orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`));
  if (!res.ok) throw new Error('Paid toggle failed');
  return res.json();
}
async function getOrder(orderId, lastLower){
  const res = await fetch(buildUrl(`?path=lookup&orderId=${encodeURIComponent(orderId)}&last=${encodeURIComponent(lastLower)}`));
  if (!res.ok) throw new Error('Lookup failed');
  return res.json();
}
async function paidTotals(){
  const { token } = getSettings();
  const res = await fetch(buildUrl(`?path=admin&action=paidTotals&token=${encodeURIComponent(token)}`));
  if (!res.ok) throw new Error('Totals failed');
  return res.json();
}
async function exportPaidCSV(){
  const { token } = getSettings();
  const res = await fetch(buildUrl(`?path=admin&action=exportPaidCSV&token=${encodeURIComponent(token)}`));
  if (!res.ok) throw new Error('Export failed');
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'paid_orders.csv';
  a.click();
}

function currency(n){ return new Intl.NumberFormat(undefined,{style:'currency', currency:'USD'}).format(n||0); }

function renderResults(list){
  const box = document.getElementById('results');
  if (!list || !list.length) { box.innerHTML = '<p class="muted">No results.</p>'; return; }
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

  // handlers
  box.querySelectorAll('button[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const tr = ev.target.closest('tr');
      const id = tr.dataset.id;
      const isPaid = tr.querySelector('.status .paid') != null;
      try {
        await togglePaid(id, !isPaid);
        document.getElementById('searchBtn').click(); // refresh
      } catch (e) { alert(e.message); }
    });
  });
  box.querySelectorAll('button[data-expand]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const tr = ev.target.closest('tr');
      const id = tr.dataset.id;
      const last = tr.dataset.last;
      // collapse any existing detail row under this one
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
  const view = row.querySelector('[data-view]');
  view.href = buildUrl(`?path=lookup&orderId=${encodeURIComponent(o.orderId)}&last=${encodeURIComponent(String(o.last||'').toLowerCase())}`);
  const btn = row.querySelector('[data-print]');
  btn.addEventListener('click', () => printPackSlip(o));
  return row;
}

function printPackSlip(o){
  const win = window.open('', '_blank', 'width=800,height=900');
  const lines = (o.lines||[]).map(l => (
    `<tr><td>${l.qty||0}</td><td>${l.size||''}</td><td>${l.item||''}</td><td>${l.customName||''}</td></tr>`
  )).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pack Slip ${o.orderId}</title>
    <style>
      body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;padding:20px;}
      h1{margin:0 0 10px;}
      table{width:100%;border-collapse:collapse;margin-top:10px;}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;}
      .right{text-align:right}
      .muted{color:#555}
    </style>
  </head><body>
    <h1>Packing Ticket</h1>
    <div><strong>Order:</strong> ${o.orderId}</div>
    <div><strong>Name:</strong> ${o.last}, ${o.first}</div>
    <div><strong>Created:</strong> ${new Date(o.created).toLocaleString()}</div>
    <div class="muted"><strong>Email:</strong> ${o.email||''} — <strong>Phone:</strong> ${o.phone||''}</div>
    <table><thead><tr><th>Qty</th><th>Size</th><th>Item</th><th>Custom Name</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <h3 class="right">Total: ${currency(o.total||0)}</h3>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  win.document.write(html);
  win.document.close();
}

document.addEventListener('DOMContentLoaded', async () => {
  // passcode gate
  const app = document.getElementById('app');
  document.getElementById('passOk').addEventListener('click', () => {
    const val = (document.getElementById('passcode').value || '').trim();
    if (val === PASSCODE) {
      app.classList.remove('hidden');
      document.getElementById('passMsg').textContent = 'Unlocked.';
    } else {
      document.getElementById('passMsg').textContent = 'Wrong passcode.';
    }
  });

  // Load saved settings
  const s = getSettings();
  document.getElementById('baseUrl').value = s.base;
  document.getElementById('token').value = s.token;

  document.getElementById('saveConn').addEventListener('click', () => {
    const base = document.getElementById('baseUrl').value;
    const token = document.getElementById('token').value;
    setSettings(base, token);
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

  document.getElementById('lockBtn').addEventListener('click', async () => {
    try {
      await setLock(true);
      const st = await getLockState();
      document.getElementById('lockState').textContent = st.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
    } catch (e) { alert(e.message); }
  });
  document.getElementById('unlockBtn').addEventListener('click', async () => {
    try {
      await setLock(false);
      const st = await getLockState();
      document.getElementById('lockState').textContent = st.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
    } catch (e) { alert(e.message); }
  });

  document.getElementById('refreshTotals').addEventListener('click', async () => {
    try {
      const p = await paidTotals();
      document.getElementById('paidSum').textContent = 'Paid Sum: ' + currency(p.sum||0);
      document.getElementById('paidCount').textContent = 'Paid Orders: ' + (p.count||0);
      document.getElementById('totalsBreakdown').textContent = (p.byLast||[]).map(x => `${x.last}: ${currency(x.total)}`).join('  |  ');
    } catch (e) { alert(e.message); }
  });

  document.getElementById('exportPaid').addEventListener('click', exportPaidCSV);
});
