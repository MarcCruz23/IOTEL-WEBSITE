import { apiRequest } from './api.js';
import { loadOperations } from './dashboard-operations.js';
document.addEventListener('DOMContentLoaded', loadOperations);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [{ orders }, { products }] = await Promise.all([apiRequest('/orders'), apiRequest('/products')]);
    const pending = orders.filter((order) => order.orderStatus === 'pending_payment');
    const processing = orders.filter((order) => order.orderStatus === 'processing');
    const low = products.filter((product) => Number(product.stock) <= Number(product.lowStockThreshold ?? 5));
    document.getElementById('pendingOrdersStat').textContent = pending.length;
    document.getElementById('processingStat').textContent = processing.length;
    document.getElementById('unreadMessagesStat').textContent = '—';
    document.getElementById('lowStockStat').textContent = low.length;
    document.getElementById('pendingQueue').textContent = pending.length ? pending.map((order) => `${order.id} — ${order.items.length} item(s)`).join(' | ') : 'All orders are up to date.';
    document.getElementById('lowStockAlerts').textContent = low.length ? low.map((product) => `${product.name}: ${product.stock}`).join(' | ') : 'All stock levels are healthy.';
  } catch (error) { document.querySelector('.staff-content').prepend(Object.assign(document.createElement('p'), { textContent: error.message })); }
});
