const BASE = 'https://script.google.com/macros/s/AKfycbyUVS_fgzCDUfGMFnXTA8do80dK2OtDZwrhgKYNPidyxpGQtfWaPzZhGsBP4P-k2Ua5Ww/exec';

const ENDPOINT_ITEMS = `${BASE}?path=items`;
const ENDPOINT_SUBMIT = `${BASE}?path=submit`;
const ENDPOINT_LOOKUP = `${BASE}?path=lookup`;

let PROCESSED_ITEMS = [];

async function fetchItems() {
  try {
    const res = await fetch(ENDPOINT_ITEMS);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const rawItems = await res.json();
    PROCESSED_ITEMS = rawItems;
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
  
  const itemSel = node.querySelector('.itemSelect');
  const sizeSel = node.querySelector('.sizeSelect');
  const qtyInput = node.querySelector('.qtyInput');
  const nameWrap = node.querySelector('.nameWrap');
  const unitPrice = node.querySelector('.unitPrice');
  const lineTotal = node.querySelector('.lineTotal');
  const removeBtn = node.querySelector('.removeBtn');
  const itemPreview = node.querySelector('.item-preview');

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
  const subtotalEl = document.getElementById('subtotal');
  const grandTotalEl = document.getElementById('grandTotal');
  if (subtotalEl) subtotalEl.textContent = currency(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = currency(subtotal);
}

async function submitOrder() {
  const submitBtn = document.getElementById('submitBtn');
  const submitMsg = document.getElementById('submitMsg');
  const linesDiv = document.getElementById('lines');
  submitBtn.disabled = true;
  submitMsg.textContent = 'Submitting...';

  try {
    const payload = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
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
        qty: parseInt(line.querySelector('.qtyInput').value || '1'),
        customName: (addNameCb && addNameCb.checked && nameInput) ? nameInput.value.trim() : '',
        lineTotal: parseFloat(line.querySelector('.lineTotal').value.replace(/[^0-9.-]+/g, "")),
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
    
    if(linesDiv) {
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
  if (!id || !ln) {
    resultEl.textContent = 'Please enter an Order ID and Last Name.';
    return;
  }
  resultEl.textContent = 'Searching...';
  try {
    const res = await fetch(`${ENDPOINT_LOOKUP}&orderId=${encodeURIComponent(id)}&last=${encodeURIComponent(ln)}`);
    if (!res.ok) throw new Error('Order not found.');
    const data = await res.json();
    resultEl.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  } catch (e) {
    resultEl.textContent = `Error: ${e.message}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchItems();
  const linesDiv = document.getElementById('lines');
  const addLineBtn = document.getElementById('addLine');
  const submitBtn = document.getElementById('submitBtn');
  const lookupBtn = document.getElementById('lookupBtn');

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
});