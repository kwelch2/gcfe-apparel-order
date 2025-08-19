const BASE = 'https://script.google.com/macros/s/AKfycbyUVS_fgzCDUfGMFnXTA8do80dK2OtDZwrhgKYNPidyxpGQtfWaPzZhGsBP4P-k2Ua5Ww/exec';  // EXACTLY ONCE, ends with /exec

const ENDPOINT_SUBMIT = `${BASE}`;
const ENDPOINT_LOOKUP = `${BASE}?path=lookup`;
const ENDPOINT_ITEMS  = `${BASE}?path=items`;


let ITEMS = [];

async function fetchItems() {
  try {
    const res = await fetch(ENDPOINT_ITEMS);
    if (!res.ok) {
      throw new Error(`Failed to fetch items. Status: ${res.status}`);
    }
    ITEMS = await res.json();
    if (!ITEMS || ITEMS.length === 0) {
      console.warn('Warning: No items were loaded from the data source.');
      alert('Warning: Could not load any items from the spreadsheet. Please check the data source.');
    }
  } catch (error) {
    console.error('Error fetching items:', error);
    alert('A critical error occurred while loading items. Please try again later.');
  }
}

function currency(n) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n || 0);
}

function makeLine() {
  const tmpl = document.getElementById('lineTemplate');
  const node = tmpl.content.firstElementChild.cloneNode(true);
  const itemSel = node.querySelector('.itemSelect');
  const sizeSel = node.querySelector('.sizeSelect');
  const qtyInput = node.querySelector('.qtyInput');
  const nameWrap = node.querySelector('.nameWrap');
  const nameInput = node.querySelector('.nameInput');
  const unitPrice = node.querySelector('.unitPrice');
  const lineTotal = node.querySelector('.lineTotal');
  const removeBtn = node.querySelector('.removeBtn');

  // Populate items
  if (itemSel) {
    itemSel.innerHTML = '<option value="">Select item…</option>' + ITEMS.map((it,i) => (
      `<option value="${i}">${it.name}</option>`
    )).join('');
  }

  function recompute() {
    const itemIdx = parseInt(itemSel.value);
    const sizeVal = sizeSel.value;
    const qty = parseInt(qtyInput.value || '0', 10);
    let price = 0;
    if (!isNaN(itemIdx) && ITEMS[itemIdx] && sizeVal) {
      const item = ITEMS[itemIdx];
      price = item.price || 0;
      if (item.allowsName && nameInput && nameInput.value.trim() && item.namePrice) {
        price += item.namePrice;
      }
    }
    if (unitPrice) unitPrice.value = price ? currency(price) : '';
    if (lineTotal) lineTotal.value = price ? currency(price * Math.max(qty, 0)) : '';
    recomputeTotals();
  }

  // --- FIX: Add checks before adding event listeners ---
  if (itemSel) {
    itemSel.addEventListener('change', () => {
      if (sizeSel) sizeSel.innerHTML = '<option value="">Select size…</option>';
      const idx = parseInt(itemSel.value);
      if (!isNaN(idx) && ITEMS[idx]) {
        const item = ITEMS[idx];
        if (nameWrap) nameWrap.classList.toggle('hidden', !item.allowsName);
        if (sizeSel) {
          item.sizes.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.size;
            opt.textContent = s.size;
            sizeSel.appendChild(opt);
          });
        }
      } else {
        if (nameWrap) nameWrap.classList.add('hidden');
      }
      recompute();
    });
  }

  if (sizeSel) sizeSel.addEventListener('change', recompute);
  if (qtyInput) qtyInput.addEventListener('input', recompute);
  if (nameInput) nameInput.addEventListener('input', recompute);
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
    const totalField = line.querySelector('.lineTotal').value;
    const val = parseFloat((totalField || '0').replace(/[^0-9.\-]/g,''));
    subtotal += isNaN(val) ? 0 : val;
  });
  const subtotalEl = document.getElementById('subtotal');
  const grandTotalEl = document.getElementById('grandTotal');
  if (subtotalEl) subtotalEl.textContent = currency(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = currency(subtotal); // Adjust if fees/discounts
}

async function submitOrder() {
  const lines = [];
  document.querySelectorAll('.line').forEach(line => {
    const itemIdx = line.querySelector('.itemSelect').value;
    const sizeVal = line.querySelector('.sizeSelect').value;
    const qty     = parseInt(line.querySelector('.qtyInput').value || '0', 10);
    const unit    = parseFloat((line.querySelector('.unitPrice').value || '0').replace(/[^0-9.\-]/g,''));
    const nameInput = line.querySelector('.nameInput');
    const name    = nameInput ? nameInput.value.trim() : '';
    if (itemIdx !== '' && sizeVal && qty > 0 && unit > 0) {
      const item = ITEMS[parseInt(itemIdx)];
      lines.push({
        sku: item.sku,
        item: item.name,
        size: sizeVal,
        qty,
        allowsName: !!item.allowsName,
        customName: name || '',
        unitPrice: unit,
        lineTotal: +(unit * qty).toFixed(2)
      });
    }
  });
  if (lines.length === 0) {
    alert('Add at least one line with item, size, and qty.');
    return;
  }
  const payload = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName:  document.getElementById('lastName').value.trim(),
    email:     document.getElementById('email').value.trim(),
    phone:     document.getElementById('phone').value.trim(),
    lines
  };
  if (!payload.firstName || !payload.lastName || !payload.email) {
    alert('Contact fields are required.');
    return;
  }
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try {
    const res = await fetch(ENDPOINT_SUBMIT, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // <-- important
  body: JSON.stringify(payload)
});
    if (!res.ok) throw new Error('Submit failed.');
    const data = await res.json(); // { orderId, statusUrl }
    document.getElementById('submitMsg').textContent =
      `Order submitted. Save this ID: ${data.orderId}. You can view status at: ${data.statusUrl}`;
  } catch (e) {
    alert(e.message || 'Network error.');
  } finally {
    btn.disabled = false;
  }
}

async function lookupOrder() {
  const id = document.getElementById('lookupId').value.trim();
  const ln = document.getElementById('lookupLast').value.trim();
  if (!id || !ln) { alert('Enter Order ID and last name.'); return; }
  const res = await fetch(`${ENDPOINT_LOOKUP}?orderId=${encodeURIComponent(id)}&last=${encodeURIComponent(ln)}`);
  if (!res.ok) { alert('Not found'); return; }
  const data = await res.json();
  const box = document.getElementById('lookupResult');
  box.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchItems();
  const addLineBtn = document.getElementById('addLine');
  const linesContainer = document.getElementById('lines');
  
  if (addLineBtn && linesContainer) {
    addLineBtn.addEventListener('click', () => {
      linesContainer.appendChild(makeLine());
    });
    // start with one line
    linesContainer.appendChild(makeLine());
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitOrder);

  const lookupBtn = document.getElementById('lookupBtn');
  if (lookupBtn) lookupBtn.addEventListener('click', lookupOrder);
});
