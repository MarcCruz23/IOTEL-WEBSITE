import { apiRequest } from './api.js';

let products = [];
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;

function openProductForm(product = null) {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  form.reset();
  form.elements.productId.value = product?.id || '';
  form.elements.name.value = product?.name || '';
  form.elements.price.value = product?.price ?? '';
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.category.value = product?.category || 'General';
  document.getElementById('productModalTitle').textContent = product ? 'Edit product' : 'Add product';
  document.getElementById('saveProductBtn').textContent = product ? 'Save changes' : 'Create product';
  modal.style.display = 'grid'; form.elements.name.focus();
}

function closeProductForm() { document.getElementById('productModal').style.display = 'none'; }

function render(filter = '') {
  const list = products.filter((product) => `${product.name} ${product.category || ''}`.toLowerCase().includes(filter.toLowerCase()));
  const container = document.getElementById('productsList'); container.innerHTML = '';
  if (!list.length) { container.textContent = 'No products found.'; return; }
  for (const product of list) {
    const row = document.createElement('div'); row.className = 'admin-product-row';
    const summary = document.createElement('div'); summary.className = 'admin-product-cell'; summary.textContent = `${product.name} (${product.category || 'Uncategorized'})`;
    const price = document.createElement('span'); price.textContent = money(product.price);
    const stock = document.createElement('span'); stock.textContent = String(product.stock);
    const state = document.createElement('span'); state.className = `admin-status ${product.stock > 0 ? 'processing' : 'cancelled'}`; state.textContent = product.stock > 0 ? 'Active' : 'Out of stock';
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'admin-edit'; edit.textContent = 'Edit'; edit.addEventListener('click', () => openProductForm(product));
    const deactivate = document.createElement('button'); deactivate.type = 'button'; deactivate.className = 'admin-delete'; deactivate.textContent = 'Deactivate';
    deactivate.addEventListener('click', async () => {
      if (!await window.IOTEL_UI.confirm(`Deactivate “${product.name}”? It will no longer show in the customer catalog.`, { title:'Deactivate product', confirmLabel:'Deactivate', danger:true })) return;
      try { await apiRequest(`/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' }); await loadProducts(); window.IOTEL_UI.toast('Product deactivated.', 'success'); }
      catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
    });
    actions.append(edit, deactivate); row.append(summary, price, stock, state, actions); container.appendChild(row);
  }
}

async function loadProducts() {
  try { products = (await apiRequest('/products')).products; render(document.getElementById('adminProductSearch').value); }
  catch (error) { document.getElementById('productsList').textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('productForm');
  document.getElementById('adminProductSearch').addEventListener('input', (event) => render(event.target.value));
  document.getElementById('newProductBtn').addEventListener('click', () => openProductForm());
  document.getElementById('cancelProductBtn').addEventListener('click', closeProductForm);
  document.getElementById('productModal').addEventListener('click', (event) => { if (event.target.id === 'productModal') closeProductForm(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const productId = form.elements.productId.value;
    const payload = { name: form.elements.name.value.trim(), price: Number(form.elements.price.value), stock: Number(form.elements.stock.value), category: form.elements.category.value.trim() };
    const save = document.getElementById('saveProductBtn'); save.disabled = true;
    try {
      await apiRequest(productId ? `/products/${encodeURIComponent(productId)}` : '/products', { method: productId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      closeProductForm(); await loadProducts(); window.IOTEL_UI.toast(productId ? 'Product updated.' : 'Product created.', 'success');
    } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
    finally { save.disabled = false; }
  });
  loadProducts();
});
