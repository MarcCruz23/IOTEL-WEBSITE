import { apiRequest } from './api.js';
const money = value => '₱' + Number(value || 0).toLocaleString('en-PH');
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const id = new URLSearchParams(location.search).get('orderId');
    if (!id) throw new Error('Order ID is missing.');
    const { order } = await apiRequest(`/orders/${encodeURIComponent(id)}`);
    document.getElementById('orderNumber').textContent = '#' + order.id;
    document.getElementById('confirmMessage').textContent = 'Order status: ' + order.orderStatus.replaceAll('_', ' ');
    const items = document.getElementById('confirmOrderItems'); items.replaceChildren();
    for (const item of order.items) {
      const row = document.createElement('p'); row.textContent = `${item.name} × ${item.quantity}: ${money(item.lineTotal)}`; items.append(row);
    }
    document.getElementById('confirmSubtotal').textContent = money(order.subtotal);
    document.getElementById('confirmShipping').textContent = order.shipping ? money(order.shipping) : 'FREE';
    document.getElementById('confirmTotal').textContent = money(order.total);
    const address = order.shippingAddress || {};
    const target = document.getElementById('confirmAddress'); target.replaceChildren();
    for (const value of [address.fullName, address.addressLine, [address.barangay, address.city, address.province, address.zip].filter(Boolean).join(', '), address.mobile]) {
      const p = document.createElement('p'); p.textContent = value || ''; target.append(p);
    }
    document.getElementById('confirmPayment').textContent = `${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Bank Transfer'} — ${order.paymentStatus.replaceAll('_', ' ')}${order.paymentReference ? ' — Reference: ' + order.paymentReference : ''}`;
  } catch (error) { document.getElementById('confirmMessage').textContent = error.message; }
});
