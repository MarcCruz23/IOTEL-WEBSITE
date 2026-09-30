import { apiRequest } from './api.js';

let products = [];

function imageUrl(value) {
  if (!value) return '../public/images/placeholder.png';
  return value.startsWith('/') ? `..${value}` : value;
}

function render(filter = '') {
  const query = filter.trim().toLowerCase();
  const visible = products.filter((product) => !query || product.name.toLowerCase().includes(query));
  const container = document.getElementById('staffInventoryList');
  container.innerHTML = '';
  if (!visible.length) {
    container.textContent = 'No inventory items match your search.';
    return;
  }

  visible.forEach((product) => {
    const stock = Number(product.stock || 0);
    const state = stock <= 0 ? ['out', 'Out of stock'] : stock <= 5 ? ['low', 'Low stock'] : ['processing', 'In stock'];
    const row = document.createElement('div');
    row.className = 'staff-inventory-row';
    const productCell = document.createElement('div');
    productCell.className = 'staff-product-cell';
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
    const stockCell = document.createElement('div');
    stockCell.className = 'staff-inventory-stock';
    stockCell.textContent = String(stock);
    const status = document.createElement('div');
    status.className = `staff-inventory-status staff-status ${state[0]}`;
    status.textContent = state[1];
    row.append(productCell, stockCell, status);
    container.appendChild(row);
  });
}

async function loadInventory() {
  const container = document.getElementById('staffInventoryList');
  container.textContent = 'Loading inventory…';
  try {
    const result = await apiRequest('/products');
    products = result.products || [];
    render(document.getElementById('staffSearch').value);
  } catch (error) {
    container.textContent = 'Inventory could not be loaded. Check that the backend is running, then refresh.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('staffSearch');
  search.addEventListener('input', () => render(search.value));
  loadInventory();
});
