// admin.js (simplified version)

/******** CONFIG ********/
const GIS_CLIENT_ID = '841013736027-qvvar311ihlv00k08jjpiomn4b0ajj0j.apps.googleusercontent.com';
let ID_TOKEN = '';

/******** GOOGLE SIGN-IN ********/
function onSignInSuccess(response) {
  ID_TOKEN = response.credential;
  const msg = document.getElementById('loginMsg');
  msg.textContent = 'Signing in…';

  google.script.run
    .withSuccessHandler(data => {
      if (data && data.allowed) {
        msg.textContent = 'Signed in as ' + (data.email || '');
        document.getElementById('login').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        
        // Get initial lock state
        google.script.run.withSuccessHandler(s => {
          document.getElementById('lockState').textContent = s.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
        }).adminGetState(ID_TOKEN);

      } else {
        msg.textContent = 'Access denied for this Google account.';
      }
    })
    .withFailureHandler(err => {
      msg.textContent = 'Login check failed: ' + err.message;
    })
    .adminVerifyLogin(ID_TOKEN);
}

function renderGsiButton() {
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({ client_id: GIS_CLIENT_ID, callback: onSignInSuccess });
    google.accounts.id.renderButton(document.getElementById('gsi'), { theme: 'outline', size: 'large' });
  } else {
    setTimeout(renderGsiButton, 200);
  }
}

/******** API CALL WRAPPERS ********/
// These functions now call your Apps Script functions directly
function setLock(lock) {
  google.script.run
    .withSuccessHandler(s => {
      document.getElementById('lockState').textContent = s.ordersLocked ? 'Currently: LOCKED' : 'Currently: OPEN';
    })
    .withFailureHandler(err => alert('Failed to update lock: ' + err.message))
    .adminSetLock(ID_TOKEN, lock);
}

function searchOrders() {
  const q = document.getElementById('query').value.trim();
  const pf = document.getElementById('paidFilter').value;
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;

  google.script.run
    .withSuccessHandler(out => renderResults(out.results))
    .withFailureHandler(err => alert('Search failed: ' + err.message))
    .adminSearch(ID_TOKEN, q, pf, from, to);
}

function togglePaid(orderId, paid) {
  google.script.run
    .withSuccessHandler(() => searchOrders()) // Refresh search results on success
    .withFailureHandler(err => alert('Toggle failed: ' + err.message))
    .adminTogglePaid(ID_TOKEN, orderId, paid);
}

function getOrder(orderId, last, tr) {
  google.script.run
    .withSuccessHandler(o => {
      const detail = buildDetailRow(o);
      tr.insertAdjacentElement('afterend', detail);
    })
    .withFailureHandler(err => alert('Lookup failed: ' + err.message))
    .adminLookup(orderId, last);
}

function refreshTotals() {
  google.script.run
    .withSuccessHandler(p => {
        document.getElementById('paidSum').textContent = 'Paid Sum: ' + currency(p.sum||0);
        document.getElementById('paidCount').textContent = 'Paid Orders: ' + (p.count||0);
        document.getElementById('totalsBreakdown').textContent = (p.byLast||[]).map(x => `${x.last}: ${currency(x.total)}`).join('  |  ');
    })
    .withFailureHandler(err => alert('Totals failed: ' + err.message))
    .adminPaidTotals(ID_TOKEN);
}

function exportPaidCsv() {
    google.script.run
        .withSuccessHandler(info => {
            if (info && info.url) {
                window.open(info.url, '_blank');
            } else {
                alert('Could not generate export file.');
            }
        })
        .withFailureHandler(err => alert('Export failed: ' + err.message))
        .adminExportPaidCsv(ID_TOKEN);
}


/******** RENDERING (mostly unchanged) ********/
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
    btn.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr');
      const id = tr.dataset.id;
      const isPaid = tr.querySelector('.status .paid') != null;
      togglePaid(id, !isPaid);
    });
  });
  box.querySelectorAll('button[data-expand]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr');
      const id = tr.dataset.id;
      const last = tr.dataset.last;
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('detail-row')) { next.remove(); return; }
      getOrder(id, last, tr);
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
  row.querySelector('[data-print]').addEventListener('click', () => printPackSlip(o));
  return row;
}

function printPackSlip(o){ /* This function is fine, no changes needed */ }

/******** BOOT ********/
document.addEventListener('DOMContentLoaded', () => {
  // Lock/Unlock buttons
  document.getElementById('lockBtn').addEventListener('click', () => setLock(true));
  document.getElementById('unlockBtn').addEventListener('click', () => setLock(false));
  
  // Search
  document.getElementById('searchBtn').addEventListener('click', searchOrders);

  // Totals/Export
  document.getElementById('refreshTotals').addEventListener('click', refreshTotals);
  document.getElementById('exportPaid').addEventListener('click', exportPaidCsv);

  // Render Google button
  renderGsiButton();
});
