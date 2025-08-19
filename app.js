const BASE = 'https://script.google.com/macros/s/AKfycbyUVS_fgzCDUfGMFnXTA8do80dK2OtDZwrhgKYNPidyxpGQtfWaPzZhGsBP4P-k2Ua5Ww/exec';  // EXACTLY ONCE, ends with /exec

const ENDPOINT_SUBMIT = `${BASE}`;
const ENDPOINT_LOOKUP = `${BASE}?path=lookup`;
const ENDPOINT_ITEMS  = `${BASE}?path=items`;


let ITEMS = [];

async function fetchItems() {
  const res = await fetch(ENDPOINT_ITEMS);
  ITEMS = await res.json();
  // After fetching, populate items in all existing lines
  document.querySelectorAll('.itemSelect').forEach(itemSel => {
    populateItems(itemSel);
  });
}

function populateItems(itemSel) {
    itemSel.innerHTML = '<option value="">Select item…</option>' + ITEMS.map((it,i) => (
    `<option value="${i}">${it.name}</option>`
  )).join('');
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
  const addNameCb = node.querySelector('.addNameCb');
  const nameInput = node.querySelector('.nameInput');
  const unitPrice = node.querySelector('.unitPrice');
  const lineTotal = node.querySelector('.lineTotal');

  // Populate items if they are already loaded
  if (ITEMS.length > 0) {
      populateItems(itemSel);
  }

  function recompute() {
    const itemIndex = itemSel.value;
    if (itemIndex === '') {
      sizeSel.innerHTML = '';
      unitPrice.value = '';
      lineTotal.value = '';
      nameWrap.style.display = 'none';
      nameInput.style.display = 'none';
      addNameCb.checked = false;
      updateTotal();
      return;
    }

    const item = ITEMS[itemIndex];
    const qty = parseInt(qtyInput.value) || 0;

    // Populate sizes - Fixed to handle objects
    sizeSel.innerHTML = item.sizes.map(s => `<option>${s.size}</option>`).join('');

    unitPrice.value = currency(item.price);
    lineTotal.value = currency(item.price * qty);

    // Handle custom name visibility
    if (item.allowName === true || item.allowName === 'TRUE') {
      nameWrap.style.display = 'block';
    } else {
      nameWrap.style.display = 'none';
      nameInput.style.display = 'none';
      addNameCb.checked = false;
    }
    updateTotal();
  }
  
  addNameCb.addEventListener('change', () => {
    nameInput.style.display = addNameCb.checked ? 'block' : 'none';
  });

  itemSel.addEventListener('change', recompute);
  qtyInput.addEventListener('input', recompute);
  node.querySelector('.removeLine').addEventListener('click', () => {
    node.remove();
    updateTotal();
  });

  recompute(); // Initial computation
  return node;
}

function updateTotal() {
  let sub = 0;
  document.querySelectorAll('.line').forEach(line => {
    const itemIndex = line.querySelector('.itemSelect').value;
    if (itemIndex === '') return;
    const item = ITEMS[itemIndex];
    const qty = parseInt(line.querySelector('.qtyInput').value) || 0;
    sub += item.price * qty;
  });

  document.getElementById('subtotal').textContent = currency(sub);
  // You can add logic for adjustments if needed
  document.getElementById('total').textContent = currency(sub);
}


async function submitOrder() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try {
    const payload = {
      firstName: document.getElementById('firstName').value,
      lastName: document.getElementById('lastName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      lines: [],
    };

    document.querySelectorAll('.line').forEach(line => {
      const itemIndex = line.querySelector('.itemSelect').value;
      if (itemIndex === '') return;
      const item = ITEMS[itemIndex];
      payload.lines.push({
        itemId: item.id,
        size: line.querySelector('.sizeSelect').value,
        qty: line.querySelector('.qtyInput').value,
        name: line.querySelector('.addNameCb').checked ? line.querySelector('.nameInput').value : undefined,
      });
    });

    if (!payload.firstName || !payload.lastName || !payload.email || payload.lines.length === 0) {
      throw new Error('Missing required fields.');
    }

    const res = await fetch(ENDPOINT_SUBMIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // CORS error without this, see video for why, this is important
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Submit failed.');
    const data = await res.json(); // { orderId, statusUrl }
    document.getElementById('submitMsg').textContent =
      `Order submitted. Save this ID: ${data.orderId}. You can view status at: ${data.statusUrl}`;
    // Optionally redirect: window.location.href = data.statusUrl;
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

document.addEventListener('DOMContentLoaded', () => {
  // Add the first line immediately
  document.getElementById('lines').appendChild(makeLine());

  // Fetch items in the background
  fetchItems();

  document.getElementById('addLine').addEventListener('click', () => {
    document.getElementById('lines').appendChild(makeLine());
  });

  document.getElementById('submitBtn').addEventListener('click', submitOrder);
  document.getElementById('lookupBtn').addEventListener('click', lookupOrder);
});
