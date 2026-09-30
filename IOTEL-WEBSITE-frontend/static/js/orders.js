import { apiRequest } from './api.js';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;
const text = (value) => String(value || 'pending').replaceAll('_', ' ');

async function submitProof(order) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg';
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { window.IOTEL_UI.toast('Choose an image up to 3 MB.', 'error'); return; }
    try {
      await apiRequest(`/payments/orders/${order.id}/proof`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      await renderOrders(); window.IOTEL_UI.toast('Proof uploaded for admin review.', 'success');
    } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
  });
  input.click();
}

async function renderOrders() {
  const list = document.getElementById('ordersList'); const empty = document.getElementById('noOrders');
  list.textContent = 'Loading your orders...';
  try {
    const { orders } = await apiRequest('/orders');
    list.innerHTML = '';
    if (!orders.length) { list.style.display = 'none'; empty.style.display = 'block'; return; }
    empty.style.display = 'none'; list.style.display = 'block';
    for (const order of orders) {
      const card = document.createElement('article'); card.className = 'order-card';
      const title = document.createElement('h3'); title.textContent = `Order ${order.id}`;
      const status = document.createElement('p'); status.textContent = `Order: ${text(order.orderStatus)} | Payment: ${text(order.paymentStatus)}`;
      const amount = document.createElement('strong'); amount.textContent = money(order.total);
      card.append(title, status, amount);
      if (order.orderStatus === 'pending_payment' && ['pending', 'rejected'].includes(order.paymentStatus)) {
        const proof = document.createElement('button'); proof.className = 'track-btn'; proof.textContent = 'Submit bank-transfer proof'; proof.addEventListener('click', () => submitProof(order)); card.append(proof);
      }
      const details = document.createElement('a'); details.className = 'track-btn'; details.textContent = 'Order details'; details.href = `order-confirmation.html?orderId=${encodeURIComponent(order.id)}`; card.append(details);
      if (order.orderStatus === 'pending_payment' || (order.paymentMethod === 'cod' && order.orderStatus === 'processing')) {
        const cancel = document.createElement('button'); cancel.className = 'track-btn'; cancel.textContent = 'Cancel order';
        cancel.addEventListener('click', async () => {
          if (!await window.IOTEL_UI.confirm('Cancel this order and release its reserved stock?', { title: 'Cancel order' })) return;
          try { await apiRequest(`/orders/${order.id}/cancel`, { method: 'PUT' }); await renderOrders(); }
          catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
        }); card.append(cancel);
      }
      if (order.trackingId) {
        const tracking = document.createElement('p'); tracking.textContent = `Tracking ID: ${order.trackingId}`;
        const trackButton = document.createElement('a'); trackButton.className = 'track-btn'; trackButton.textContent = 'Track delivery';
        trackButton.href = `order-tracking.html?orderId=${encodeURIComponent(order.id)}`;
        card.append(tracking, trackButton);
      }
      list.appendChild(card);
    }
  } catch (error) { list.textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', renderOrders);
