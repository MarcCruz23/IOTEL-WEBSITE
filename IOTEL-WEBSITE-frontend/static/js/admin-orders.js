import { apiRequest } from './api.js';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;
const statusText = (value) => String(value || 'pending').replaceAll('_', ' ');

async function reviewPayment(orderId, status) {
  const reason = status === 'rejected' ? await window.IOTEL_UI.prompt('Explain why this payment is being rejected so the customer can correct it.', { title:'Reject payment', label:'Reason for rejection', confirmLabel:'Reject payment' }) : '';
  if (status === 'rejected' && !reason) return;
  await apiRequest(`/payments/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status, reason }) });
}

async function render() {
  const container = document.getElementById('ordersAdminList'); container.textContent = 'Loading orders...';
  try {
    const [{ orders }, { payments }] = await Promise.all([apiRequest('/orders'), apiRequest('/payments')]); container.innerHTML = '';
    if (!orders.length) { container.textContent = 'No orders yet.'; return; }
    for (const order of orders) {
      const card = document.createElement('article'); card.className = 'admin-card admin-order-card';
      const title = document.createElement('strong'); title.textContent = `Order ${order.id}`;
      const info = document.createElement('p'); info.textContent = `${order.items.length} item(s) · ${money(order.total)} · Order: ${statusText(order.orderStatus)} · Payment: ${statusText(order.paymentStatus)}`;
      card.append(title, info);
      const payment = payments.find(item => item.orderId === order.id);
      if (payment?.proofFile || payment?.proofUrl) {
        const proof = document.createElement('button'); proof.className = 'admin-primary'; proof.textContent = 'View payment proof';
        proof.addEventListener('click', async () => {
          try {
            if (payment.proofFile) {
              const blob = await apiRequest(`/payments/${order.id}/proof`, { responseType: 'blob' });
              const url = URL.createObjectURL(blob);
              const image = document.createElement('img'); image.src = url; image.alt = 'Uploaded payment proof'; image.style.maxWidth = '100%';
              const close = document.createElement('button'); close.textContent = 'Close proof';
              close.addEventListener('click', () => { image.remove(); close.remove(); URL.revokeObjectURL(url); }); card.append(image, close);
            } else {
              const url = new URL(payment.proofUrl);
              if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid proof URL.');
              window.open(url.href, '_blank', 'noopener,noreferrer');
            }
          } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
        }); card.append(proof);
      }
      if ((order.paymentStatus === 'approved' || order.paymentMethod === 'cod') && order.orderStatus !== 'cancelled') {
        const select = document.createElement('select');
        for (const status of ['processing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered']) {
          const option = document.createElement('option'); option.value = status; option.textContent = status.replaceAll('_', ' '); option.selected = status === order.orderStatus; select.append(option);
        }
        select.addEventListener('change', async () => {
          try { await apiRequest(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) }); await render(); }
          catch (error) { window.IOTEL_UI.toast(error.message, 'error'); select.value = order.orderStatus; }
        }); card.append(select);
      }
      if (order.paymentStatus === 'submitted') {
        const approve = document.createElement('button'); approve.className = 'admin-primary'; approve.textContent = 'Approve payment';
        approve.addEventListener('click', async () => { try { await reviewPayment(order.id, 'approved'); window.IOTEL_UI.toast('Payment approved and tracking created.', 'success'); await render(); } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); } });
        const reject = document.createElement('button'); reject.className = 'admin-delete'; reject.textContent = 'Reject payment';
        reject.addEventListener('click', async () => { try { await reviewPayment(order.id, 'rejected'); window.IOTEL_UI.toast('Payment rejected.', 'success'); await render(); } catch (error) { window.IOTEL_UI.toast(error.message, 'error'); } });
        card.append(approve, reject);
      }
      container.appendChild(card);
    }
  } catch (error) { container.textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', render);
