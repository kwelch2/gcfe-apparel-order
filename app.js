const BASE = 'https://script.google.com/macros/s/AKfycbyUVS_fgzCDUfGMFnXTA8do80dK2OtDZwrhgKYNPidyxpGQtfWaPzZhGsBP4P-k2Ua5Ww/exec';

const ENDPOINT_ITEMS = `${BASE}?path=items`;
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
        imageUrl: item.imageUrl,
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
  if (!tmpl) return document.createElement('div'); // Failsafe
  const node = tmpl.content.firstElementChild.cloneNode(true);

  // --- More robust element selection ---
  const itemSel = node.querySelector('.itemSelect');
  const sizeSel = node.querySelector('.sizeSelect');
  const qtyInput = node.querySelector('.qtyInput');
  const nameWrap = node.querySelector('.nameWrap');
  const unitPrice = node.querySelector('.unitPrice');
  const lineTotal = node.querySelector('.lineTotal');
  const removeBtn = node.querySelector('.removeBtn');
  const itemPreview = node.querySelector('.item-preview');

  // These elements are inside nameWrap, so check if nameWrap exists first
  let addNameCb, nameInput;
  if (nameWrap) {
    addNameCb = nameWrap.querySelector('.addNameCb');
    nameInput = nameWrap.querySelector('.nameInput');
  }

  if (!itemSel) {
    console.error("Could not find '.itemSelect' in the template.");
    return node; // Return the node without listeners to prevent further errors
  }

  itemSel.innerHTML = '<option value="">Select item…</option>' + PROCESSED_ITEMS.map((it, i) =>
    `<option value="${i}">${it.name}</option>`
  ).join('');

  const recompute = () => {
    const itemIdx = itemSel.value;
    if (itemIdx === '' || !sizeSel || sizeSel.value === '') {
      if(unitPrice) unitPrice.value = '';
      if(lineTotal) lineTotal.value = '';
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
      itemPreview.innerHTML = `
        <a href="${item.imageUrl}" target="_blank" rel="noopener noreferrer">
          <img src="${item.imageUrl}" alt="${item.name}" class="item-thumbnail">
        </a>`;
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

document.addEventListener('DOMContentLoaded', async () => {
  await fetchItems();
  const linesDiv = document.getElementById('lines');
  const addLineBtn = document.getElementById('addLine');

  if (linesDiv) {
    linesDiv.appendChild(makeLine());
  }
  if (addLineBtn && linesDiv) {
    addLineBtn.addEventListener('click', () => {
      linesDiv.appendChild(makeLine());
    });
  }
});