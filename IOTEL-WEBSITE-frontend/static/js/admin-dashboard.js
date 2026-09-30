import { apiRequest } from './api.js';
import { loadOperations } from './dashboard-operations.js';
document.addEventListener('DOMContentLoaded', loadOperations);

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;

function set(id, value) { document.getElementById(id).textContent = value; }

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [{ dashboard }, { orders }] = await Promise.all([apiRequest('/admin/dashboard'), apiRequest('/orders')]);
    set('kpiProducts', dashboard.totalProducts); set('kpiOrders', dashboard.totalOrders); set('kpiLowStock', dashboard.lowStockProducts.length);
    set('kpiRevenue', money(orders.filter((order) => order.orderStatus === 'delivered').reduce((total, order) => total + Number(order.total || 0), 0)));
    const recent = document.getElementById('recentOrders'); recent.innerHTML = '';
    for (const order of orders.slice(0, 6)) {
      const row = document.createElement('tr');
      for (const value of [order.id, money(order.total), order.orderStatus]) {
        const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
      }
      recent.appendChild(row);
    }
    if (!orders.length) recent.innerHTML = '<tr><td colspan="4">No orders yet.</td></tr>';
    const alerts = document.getElementById('lowStockAlerts'); alerts.innerHTML = '';
    for (const product of dashboard.lowStockProducts) { const item = document.createElement('p'); item.textContent = `${product.name}: ${product.stock} remaining`; alerts.appendChild(item); }
    if (!dashboard.lowStockProducts.length) alerts.textContent = 'All stock levels are healthy.';
    const statuses = document.getElementById('orderStatusSummary'); statuses.textContent = `Pending payment: ${dashboard.pendingOrders} | Delivered: ${dashboard.completedOrders} | Pending payment reviews: ${dashboard.pendingPayments}`;
  } catch (error) { document.querySelector('.admin-content').prepend(Object.assign(document.createElement('p'), { textContent: error.message })); }
});
