const BASE = 'https://script.google.com/macros/s/AKfycbypV4iW-fXvhuH4p73fu6CqXY-1SQ64BLqD3Ln5WI6L_zgAlSQiVK8rEuTs7YQ2IHa_9Q/exec';

const ENDPOINT_ITEMS  = `${BASE}?path=items`;
const ENDPOINT_SUBMIT = `${BASE}?path=submit`;
const ENDPOINT_LOOKUP = `${BASE}?path=lookup`;

let PROCESSED_ITEMS = [];

async function fetchItems() {
  try {
    const res = await fetch(ENDPOINT_ITEMS);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const rawItems = await res.json();
    PROCESSED_ITEMS = rawItems;
    console.log('Finished fetching items. Data is ready.');
  } catch (e) {
    console.error("fetchItems error", e);
    alert("Could not load items from server.");
  }
}

function currency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function makeLine() {
  const tmpl = document.getElementById('lineTemplate');
  if (!tmpl) return document.createElement('div');
  const node = tmpl.content.firstElementChild.cloneNode(true);
  
  const itemSel    = node.querySelector('.itemSelect');
  const sizeSel    = node.querySelector('.sizeSelect');
  const qtyInput   = node.querySelector('.qtyInput');
  const nameWrap   = node.querySelector('.nameWrap');
  const unitPrice  = node.querySelector('.unitPrice');
  const lineTotal  = node.querySelector('.lineTotal');
  const removeBtn  = node.querySelector('.removeBtn');
  const itemPreview= node.querySelector('.item-preview');

  let addNameCb, nameInput;
  if (nameWrap) {
    addNameCb = nameWrap.querySelector('.addNameCb');
    nameInput = nameWrap.querySelector('.nameInput');
  }

  if (!itemSel) return node;

  itemSel.innerHTML = '<option value="">Select item…</option>' + PROCESSED_ITEMS.map((it, i) =>
    `<option value="${i}">${it.name}</option>`
  ).join('');

  const recompute = () => {
    const itemIdx = itemSel.value;
    if (itemIdx === '' || !sizeSel || sizeSel.value === '') {
      if (unitPrice) unitPrice.value = '';
      if (lineTotal) lineTotal.value = '';
      recomputeTotals();
      return;
    }
    const item = PROCESSED_ITEMS[itemIdx];
    const sizeOpt = sizeSel.options[sizeSel.selectedIndex];
    const qty = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
    let basePrice = parseFloat(sizeOpt.dataset.price || '0');
    let finalPrice = basePrice;
    if (item.allowsName && addNameCb && addNameCb.checked) {
      finalPrice += item.namePrice || 0;
    }
    if (unitPrice) unitPrice.value = currency(finalPrice);
    if (lineTotal) lineTotal.value = currency(finalPrice * qty);
    recomputeTotals();
  };

  itemSel.addEventListener('change', () => {
    const itemIdx = itemSel.value;
    if (sizeSel) sizeSel.innerHTML = '<option value="">Select size…</option>';
    if (nameInput) nameInput.style.display = 'none';
    if (addNameCb) addNameCb.checked = false;
    if (itemPreview) itemPreview.innerHTML = '';
    if (itemIdx === '') {
      if (nameWrap) nameWrap.style.display = 'none';
      recompute();
      return;
    }
    const item = PROCESSED_ITEMS[itemIdx];

    if (nameWrap) nameWrap.style.display = item.allowsName ? 'flex' : 'none';

    if (item.imageUrl && itemPreview) {
      itemPreview.innerHTML = `<a href="${item.imageUrl}" target="_blank" rel="noopener noreferrer">View Item Details</a>`;
    }

    if (sizeSel) {
      item.sizes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.size;
        opt.textContent = s.size;
        opt.dataset.price = s.price;
        sizeSel.appendChild(opt);
      });
    }
    recompute();
  });

  if (addNameCb) {
    addNameCb.addEventListener('change', () => {
      if (nameInput) nameInput.style.display = addNameCb.checked ? 'block' : 'none';
      recompute();
    });
  }
  if (sizeSel) sizeSel.addEventListener('change', recompute);
  if (qtyInput) qtyInput.addEventListener('input', recompute);
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      node.remove();
      recomputeTotals();
    });
  }
  return node;
}

function recomputeTotals() {
  let subtotal = 0;
  document.querySelectorAll('.line').forEach(line => {
    const lineTotalInput = line.querySelector('.lineTotal');
    if (lineTotalInput) {
      const totalVal = parseFloat(lineTotalInput.value.replace(/[^0-9.-]+/g, ""));
      if (!isNaN(totalVal)) subtotal += totalVal;
    }
  });
  const subtotalEl   = document.getElementById('subtotal');
  const grandTotalEl = document.getElementById('grandTotal');
  if (subtotalEl)   subtotalEl.textContent   = currency(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = currency(subtotal);
}

/* ---------- Pretty lookup rendering ---------- */
function renderLookupResult(data) {
  const printUrl = `${BASE}?path=print_order&id=${encodeURIComponent(data.orderId)}`;
  const lines = Array.isArray(data.lines) ? data.lines : [];

  const rows = lines.map(l => {
    const lt = typeof l.lineTotal === 'number'
      ? l.lineTotal
      : parseFloat((l.lineTotal || '0').toString().replace(/[^0-9.-]+/g, '')) || 0;
    return `
      <tr>
        <td>${l.sku || ''}</td>
        <td>${l.item || ''}</td>
        <td>${l.size || ''}</td>
        <td style="text-align:right">${l.qty || 0}</td>
        <td>${l.customName || ''}</td>
        <td style="text-align:right">${currency(lt)}</td>
      </tr>
    `;
  }).join('');

  let createdStr = '';
  if (data.created) {
    try { createdStr = new Date(data.created).toLocaleDateString(); } catch(_) {}
  }

  return `
    <div class="card">
      <div class="row between">
        <div>
          <div><strong>Order #:</strong> ${data.orderId}</div>
          <div><strong>Name:</strong> ${data.first || ''} ${data.last || ''}</div>
          ${createdStr ? `<div><strong>Date:</strong> ${createdStr}</div>` : ''}
          <div><strong>Status:</strong> ${data.status || '—'}</div>
          <div><strong>Total:</strong> ${currency(Number(data.total || 0))}</div>
        </div>
        <div class="row end" style="gap:.5rem;">
          <a class="btn primary" href="${printUrl}" target="_blank" rel="noopener">Print Order</a>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item</th>
            <th>Size</th>
            <th style="text-align:right">Qty</th>
            <th>Custom Name</th>
            <th style="text-align:right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" class="muted">No lines.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function submitOrder() {
  const submitBtn = document.getElementById('submitBtn');
  const submitMsg = document.getElementById('submitMsg');
  const linesDiv  = document.getElementById('lines');
  submitBtn.disabled = true;
  submitMsg.textContent = 'Submitting...';

  try {
    const payload = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName:  document.getElementById('lastName').value.trim(),
      email:     document.getElementById('email').value.trim(),
      phone:     document.getElementById('phone').value.trim(),
      lines: [],
    };
    document.querySelectorAll('.line').forEach(line => {
      const itemIdx = line.querySelector('.itemSelect').value;
      if (itemIdx === '') return;
      const item = PROCESSED_ITEMS[itemIdx];
      const nameInput = line.querySelector('.nameInput');
      const addNameCb = line.querySelector('.addNameCb');
      payload.lines.push({
        sku: item.sku,
        item: item.name,
        size: line.querySelector('.sizeSelect').value,
        qty:  parseInt(line.querySelector('.qtyInput').value || '1'),
        customName: (addNameCb && addNameCb.checked && nameInput) ? nameInput.value.trim() : '',
        lineTotal:  parseFloat(line.querySelector('.lineTotal').value.replace(/[^0-9.-]+/g, "")),
      });
    });
    if (!payload.firstName || !payload.lastName || !payload.email) {
      throw new Error('Please fill out all contact fields.');
    }
    if (payload.lines.length === 0) {
      throw new Error('Please add at least one item to your order.');
    }
    const res = await fetch(ENDPOINT_SUBMIT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Submission failed.');
    }
    const data = await res.json();
    submitMsg.textContent = `Success! Your Order ID is ${data.orderId}.`;
    
    if (linesDiv) {
      linesDiv.innerHTML = '';
      linesDiv.appendChild(makeLine());
    }

  } catch (e) {
    submitMsg.textContent = `Error: ${e.message}`;
  } finally {
    submitBtn.disabled = false;
  }
}

async function lookupOrder() {
  const id = document.getElementById('lookupId').value.trim();
  const ln = document.getElementById('lookupLast').value.trim();
  const resultEl = document.getElementById('lookupResult');
  const btn = document.getElementById('lookupBtn');

  if (!id || !ln) {
    resultEl.textContent = 'Please enter an Order ID and Last Name.';
    return;
  }
  if (btn) btn.disabled = true;
  resultEl.textContent = 'Searching...';

  try {
    const res = await fetch(`${ENDPOINT_LOOKUP}&orderId=${encodeURIComponent(id)}&last=${encodeURIComponent(ln)}`);
    if (!res.ok) throw new Error('Order not found.');
    const data = await res.json();
    resultEl.innerHTML = renderLookupResult(data);
  } catch (e) {
    resultEl.textContent = `Error: ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchItems();
  const linesDiv   = document.getElementById('lines');
  const addLineBtn = document.getElementById('addLine');
  const submitBtn  = document.getElementById('submitBtn');
  const lookupBtn  = document.getElementById('lookupBtn');

  if (linesDiv) {
    linesDiv.appendChild(makeLine());
  }
  if (addLineBtn && linesDiv) {
    addLineBtn.addEventListener('click', () => {
      linesDiv.appendChild(makeLine());
    });
  }
  if (submitBtn) {
    submitBtn.addEventListener('click', submitOrder);
  }
  if (lookupBtn) {
    lookupBtn.addEventListener('click', lookupOrder);
  }

  // Enter-to-submit for lookup (no HTML changes needed)
  ['lookupId', 'lookupLast'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          lookupOrder();
        }
      });
    }
  });
});
