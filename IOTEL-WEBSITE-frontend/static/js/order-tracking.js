import { apiRequest } from './api.js';

const stages = ['Pending', 'Processing', 'Ready to Ship', 'Shipped', 'Out for Delivery', 'Delivered'];
const labels = {
  pending_payment: ['Pending', 'Order placed', 'Your order is awaiting payment verification.'],
  processing: ['Processing', 'Processing', 'Your order is being prepared.'],
  ready_to_ship: ['Ready to Ship', 'Ready to ship', 'Your order is packed and ready for dispatch.'],
  shipped: ['Shipped', 'Shipped', 'Your package has been shipped.'],
  out_for_delivery: ['Out for Delivery', 'Out for delivery', 'Your package is on the way.'],
  delivered: ['Delivered', 'Delivered', 'Your order has been delivered.'],
  cancelled: ['Cancelled', 'Cancelled', 'This order has been cancelled.']
};

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withTime = false) {
  const date = asDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-PH', withTime
    ? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

function money(value) { return `₱${Number(value || 0).toLocaleString('en-PH')}`; }
function statusClass(status) { return `status-${String(status || 'pending').toLowerCase().replaceAll(' ', '-')}`; }

function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function renderProgress(status, createdAt) {
  const current = labels[status]?.[0] || 'Pending';
  const currentIndex = stages.indexOf(current);
  const timeline = document.getElementById('progressTimeline');
  timeline.innerHTML = '';
  const visible = status === 'cancelled' ? ['Pending', 'Cancelled'] : stages;
  visible.forEach((stage, index) => {
    const step = document.createElement('div');
    const complete = status !== 'cancelled' && index < currentIndex;
    step.className = `progress-step${complete ? ' complete' : ''}${stage === current ? ' current' : ''}`;
    addText(step, 'div', complete ? '✓' : stage === current ? '•' : '○', 'progress-dot');
    addText(step, 'span', stage, 'progress-label');
    addText(step, 'span', stage === current ? formatDate(createdAt) : '', 'progress-date');
    timeline.appendChild(step);
  });
}

function renderHistory(status, createdAt, updatedAt) {
  const current = labels[status]?.[0] || 'Pending';
  const currentIndex = stages.indexOf(current);
  const sequence = status === 'cancelled' ? ['Cancelled', 'Pending'] : stages.slice(0, currentIndex + 1).reverse();
  const history = document.getElementById('statusHistory');
  history.innerHTML = '';
  sequence.forEach((stage, index) => {
    const entry = document.createElement('div');
    entry.className = `history-item${index === 0 ? ' current' : ''}`;
    addText(entry, 'div', index === 0 ? '✓' : '•', 'history-icon');
    const details = document.createElement('div');
    const info = Object.values(labels).find((value) => value[0] === stage) || labels.pending_payment;
    addText(details, 'p', info[1], 'history-title');
    addText(details, 'span', formatDate(index === 0 ? updatedAt || createdAt : createdAt, true), 'history-date');
    addText(details, 'p', info[2], 'history-description');
    entry.appendChild(details);
    history.appendChild(entry);
  });
}

function renderItems(order) {
  const items = document.getElementById('trackingItems');
  items.innerHTML = '';
  (order.items || []).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'tracking-item';
    const image = document.createElement('img');
    image.src = item.imageUrl || '/public/images/placeholder.png';
    image.alt = item.name || 'Product';
    const main = document.createElement('div');
    main.className = 'tracking-item-main';
    addText(main, 'p', item.name || 'Product', 'tracking-item-name');
    addText(main, 'p', `Qty: ${item.quantity || 0} × ${money(item.price)}`, 'tracking-item-meta');
    const total = document.createElement('strong');
    total.className = 'tracking-item-total';
    total.textContent = money(item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0));
    row.append(image, main, total);
    items.appendChild(row);
  });
}

function render(order) {
  const status = order.orderStatus || 'pending_payment';
  const label = labels[status] || labels.pending_payment;
  const badgeClass = `tracking-status ${statusClass(label[0])}`;
  document.getElementById('orderIdText').textContent = order.trackingId ? `${order.id} · ${order.trackingId}` : order.id;
  document.getElementById('summaryOrderId').textContent = order.id;
  document.getElementById('orderDate').textContent = formatDate(order.createdAt, true);
  ['statusBadge', 'statusBadgeLarge', 'summaryOrderStatus'].forEach((id) => {
    const badge = document.getElementById(id); badge.textContent = label[0]; badge.className = badgeClass;
  });
  document.getElementById('currentStatus').textContent = label[1];
  document.getElementById('statusDescription').textContent = label[2];
  renderProgress(status, order.createdAt);
  renderHistory(status, order.createdAt, order.updatedAt);

  const address = order.shippingAddress || {};
  const delivery = document.getElementById('deliveryInfo');
  delivery.innerHTML = '';
  const card = document.createElement('div'); card.className = 'delivery-info';
  addText(card, 'p', address.fullName || 'Delivery address unavailable');
  addText(card, 'p', [address.addressLine, address.barangay].filter(Boolean).join(', '));
  addText(card, 'p', [address.city, address.province, address.zip].filter(Boolean).join(', '));
  addText(card, 'p', address.mobile || '');
  delivery.appendChild(card);
  document.getElementById('destinationText').textContent = [address.city, address.province].filter(Boolean).join(', ') || 'Delivery address on file';
  renderItems(order);
  document.getElementById('orderTotal').textContent = money(order.total);
}

document.addEventListener('DOMContentLoaded', async () => {
  const orderId = new URLSearchParams(location.search).get('orderId');
  if (!orderId) {
    document.getElementById('trackingContent').style.display = 'none';
    document.getElementById('trackingError').style.display = 'block';
    return;
  }
  try {
    const result = await apiRequest(`/orders/${encodeURIComponent(orderId)}`);
    render(result.order);
  } catch (error) {
    document.getElementById('trackingContent').style.display = 'none';
    const message = document.querySelector('#trackingError p');
    message.textContent = error.message || 'We could not load this order.';
    document.getElementById('trackingError').style.display = 'block';
  }
});
