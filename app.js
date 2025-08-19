const BASE = 'https://script.google.com/macros/s/AKfycbyUVS_fgzCDUfGMFnXTA8do80dK2OtDZwrhgKYNPidyxpGQtfWaPzZhGsBP4P-k2Ua5Ww/exec';

const ENDPOINT_ITEMS  = `${BASE}?path=items`;
const ENDPOINT_SUBMIT = `${BASE}`;
const ENDPOINT_LOOKUP = `${BASE}?path=lookup`;

let PROCESSED_ITEMS = [];

function processItems(items) {
  const itemsMap = new Map();
  items.forEach(item => {
    if (!itemsMap.has(item.sku)) {
      itemsMap.set(item.sku, {
        sku: item.sku,
        name: item.name,
        allowsName: item.allowsName,
        namePrice: item.namePrice,
        sizes: [],
      });
    }
    itemsMap.get(item.sku).sizes.push({
      size: item.size,
      price: item.price,
    });
  });
  return Array.from(itemsMap.values());
}

async function fetchItems() {
  try {
    const res = await fetch(ENDPOINT_ITEMS);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const rawItems = await res.json();
    PROCESSED_ITEMS = processItems(rawItems);
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
  const node = tmpl.content.firstElementChild.cloneNode(true);
  const [itemSel, sizeSel, qtyInput, nameWrap, unitPrice, lineTotal, removeBtn] = [
    '.itemSelect', '.sizeSelect', '.qtyInput', '.nameWrap', '.unitPrice', '.lineTotal', '.removeBtn'
  ].map(sel => node.querySelector(sel));
  const addNameCb = nameWrap.querySelector('.addNameCb');
  const nameInput = nameWrap.querySelector('.nameInput');
  
  itemSel.innerHTML = '<option value="">Select item…</option>' + PROCESSED_ITEMS.map((it, i) =>
    `<option value="${i}">${it.name}</option>`
  ).join('');

  const recompute = () => {
    const itemIdx = itemSel.value;
    if (itemIdx === '' || sizeSel.value === '') {
      unitPrice.value = '';
      lineTotal.value = '';
      recomputeTotals();
      return;
    }

    const item = PROCESSED_ITEMS[itemIdx];
    const sizeOpt = sizeSel.options[sizeSel.selectedIndex];
    const qty = parseInt(qtyInput.value) || 0;
    
    // --- FIX: Logic for base price and optional name price ---
    let basePrice = parseFloat(sizeOpt.dataset.price || '0');
    let finalPrice = basePrice;

    if (item.allowsName && addNameCb.checked) {
      finalPrice += item.namePrice || 0;
    }

    unitPrice.value = currency(finalPrice);
    lineTotal.value = currency(finalPrice * qty);
    recomputeTotals();
  };

  itemSel.addEventListener('change', () => {
    const itemIdx = itemSel.value;
    sizeSel.innerHTML = '<option value="">Select size…</option>';
    nameInput.style.display = 'none';
    addNameCb.checked = false;

    if (itemIdx === '') {
      nameWrap.style.display = 'none';
      recompute();
      return;
    }
    
    const item = PROCESSED_ITEMS[itemIdx];
    nameWrap.style.display = item.allowsName ? 'flex' : 'none'; // Use flex for better alignment

    item.sizes.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.size;
      opt.textContent = s.size;
      opt.dataset.price = s.price;
      sizeSel.appendChild(opt);
    });
    recompute();
  });

  addNameCb.addEventListener('change', () => {
    nameInput.style.display = addNameCb.checked ? 'block' : 'none';
    recompute();
  });
  
  sizeSel.addEventListener('change', recompute);
  qtyInput.addEventListener('input', recompute);
  removeBtn.addEventListener('click', () => {
    node.remove();
    recomputeTotals();
  });

  return node;
}

function recomputeTotals() {
  let subtotal = 0;
  document.querySelectorAll('.line').forEach(line => {
    const totalVal = parseFloat(line.querySelector('.lineTotal').value.replace(/[^0-9.-]+/g, ""));
    if (!isNaN(totalVal)) {
      subtotal += totalVal;
    }
  });
  document.getElementById('subtotal').textContent = currency(subtotal);
  document.getElementById('grandTotal').textContent = currency(subtotal);
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchItems();
  const linesDiv = document.getElementById('lines');
  linesDiv.appendChild(makeLine());
  document.getElementById('addLine').addEventListener('click', () => {
    linesDiv.appendChild(makeLine());
  });
  // Other listeners can be added here
});
