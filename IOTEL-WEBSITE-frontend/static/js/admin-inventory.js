import { apiRequest } from './api.js';

let products = [];

function imageUrl(value) {
  if (!value) return '../public/images/placeholder.png';
  return value.startsWith('/') ? `..${value}` : value;
}

function stockState(stock) {
  if (stock <= 0) return ['cancelled', 'Out of stock'];
  if (stock <= 5) return ['pending', 'Low stock'];
  return ['processing', 'In stock'];
}

function render(filter = '') {
  const query = filter.trim().toLowerCase();
  const visible = products.filter((product) => !query
    || product.name.toLowerCase().includes(query)
    || String(product.category || '').toLowerCase().includes(query));
  const container = document.getElementById('inventoryList');
  container.innerHTML = '';

  if (!visible.length) {
    container.innerHTML = '<div class="admin-card admin-empty">No inventory items match your search.</div>';
    return;
  }

  visible.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'admin-inventory-row';
    const productCell = document.createElement('div');
    productCell.className = 'admin-product-cell';
    const image = document.createElement('img');
    image.src = imageUrl(product.imageUrl || product.image);
    image.alt = product.name;
    const labels = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = product.name;
    const category = document.createElement('small');
    category.textContent = product.category || 'Uncategorized';
    labels.append(name, category);
    productCell.append(image, labels);

    const stockCell = document.createElement('span');
    stockCell.className = 'inventory-stock';
    const stock = document.createElement('input');
    stock.className = 'admin-stock';
    stock.type = 'number';
    stock.min = '0';
    stock.step = '1';
    stock.value = Number(product.stock || 0);
    const save = document.createElement('button');
    save.className = 'admin-save';
    save.type = 'button';
    save.textContent = 'Save stock';
    save.addEventListener('click', async () => {
      const nextStock = Number(stock.value);
      if (!Number.isInteger(nextStock) || nextStock < 0) {
        window.IOTEL_UI.toast('Stock must be a whole number of zero or more.', 'error');
        return;
      }
      save.disabled = true;
      try {
        await apiRequest(`/products/${encodeURIComponent(product.id)}`, {
          method: 'PUT', body: JSON.stringify({ stock: nextStock })
        });
        product.stock = nextStock;
        render(document.getElementById('adminInventorySearch').value);
        window.IOTEL_UI.toast('Stock updated.', 'success');
      } catch (error) {
        window.IOTEL_UI.toast(error.message || 'Stock could not be saved.', 'error');
      } finally {
        save.disabled = false;
      }
    });
    stockCell.append(stock, save);

    const status = document.createElement('span');
    const [statusClass, statusLabel] = stockState(Number(product.stock || 0));
    status.className = `inventory-status admin-status ${statusClass}`;
    status.textContent = statusLabel;

    const actions = document.createElement('span');
    actions.className = 'admin-actions';
    const deactivate = document.createElement('button');
    deactivate.className = 'admin-delete';
    deactivate.type = 'button';
    deactivate.textContent = 'Deactivate';
    deactivate.addEventListener('click', async () => {
      if (!await window.IOTEL_UI.confirm(`Deactivate “${product.name}”? It will no longer appear in the customer catalog.`, { title:'Deactivate product', confirmLabel:'Deactivate', danger:true })) return;
      deactivate.disabled = true;
      try {
        await apiRequest(`/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
        products = products.filter((item) => item.id !== product.id);
        render(document.getElementById('adminInventorySearch').value);
        window.IOTEL_UI.toast('Product deactivated.', 'success');
      } catch (error) {
        window.IOTEL_UI.toast(error.message || 'Product could not be deactivated.', 'error');
      } finally {
        deactivate.disabled = false;
      }
    });
    actions.appendChild(deactivate);
    row.append(productCell, stockCell, status, actions);
    container.appendChild(row);
  });
}

async function loadInventory() {
  const container = document.getElementById('inventoryList');
  container.innerHTML = '<div class="admin-card admin-empty">Loading inventory…</div>';
  try {
    const result = await apiRequest('/products');
    products = result.products || [];
    render(document.getElementById('adminInventorySearch').value);
  } catch (error) {
    container.innerHTML = '<div class="admin-card admin-empty">Inventory could not be loaded. Check that the backend is running, then refresh.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('adminInventorySearch');
  search.addEventListener('input', () => render(search.value));
  document.getElementById('syncFromMock').addEventListener('click', loadInventory);
  loadInventory();
});
