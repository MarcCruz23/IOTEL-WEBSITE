import { apiRequest } from './api.js';

const statuses = ['processing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered'];
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;

async function render() {
  const container = document.getElementById('staffOrdersList'); container.textContent = 'Loading orders...';
  try {
    const { orders } = await apiRequest('/orders'); container.innerHTML = '';
    if (!orders.length) { container.textContent = 'No orders assigned yet.'; return; }
    for (const order of orders) {
      const card = document.createElement('article'); card.className = 'staff-card staff-order-card';
      const title = document.createElement('strong'); title.textContent = `Order ${order.id}`;
      const info = document.createElement('p'); info.textContent = `${order.items.length} item(s) · ${money(order.total)} · ${order.orderStatus}`;
      card.append(title, info);
      if ((order.paymentStatus === 'approved' || order.paymentMethod === 'cod') && order.orderStatus !== 'cancelled') {
        const select = document.createElement('select');
        for (const status of statuses) { const option = document.createElement('option'); option.value = status; option.textContent = status.replaceAll('_', ' '); option.selected = status === order.orderStatus; select.appendChild(option); }
        select.addEventListener('change', async () => { try { await apiRequest(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) }); window.IOTEL_UI.toast('Order status updated.', 'success'); await render(); } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); } });
        card.append(select);
      } else { const waiting = document.createElement('small'); waiting.textContent = 'Waiting for approved payment.'; card.append(waiting); }
      container.appendChild(card);
    }
  } catch (error) { container.textContent = error.message; }
}
document.addEventListener('DOMContentLoaded', render);
