// Connect booking management and notifications using the existing dashboard card styles.
export async function loadOperations() {
  const { apiRequest } = await import('./api.js');
  const admin = location.pathname.includes('/admin/');
  const host = document.querySelector('.admin-content') || document.querySelector('main');
  if (!host) return;
  const section = document.createElement('section'); section.className = admin ? 'admin-card admin-panel' : 'section-card';
  const heading = document.createElement('h2'); heading.textContent = 'Service Bookings'; section.append(heading); host.append(section);
  async function renderBookings() {
    section.replaceChildren(heading);
    const [{ bookings }, { services }] = await Promise.all([apiRequest('/bookings'), apiRequest('/services')]);
    if (!bookings.length) section.append(document.createTextNode('No bookings yet.'));
    for (const booking of bookings) {
      const row = document.createElement('p'); row.textContent = `${booking.customerName || 'Customer'} — ${services.find(service => service.id === booking.serviceId)?.name || booking.serviceId} — ${booking.date} ${booking.time} — ${booking.status} `;
      const statuses = booking.status === 'pending' ? ['confirmed', 'rejected', 'cancelled'] : booking.status === 'confirmed' ? ['completed', 'cancelled'] : [];
      for (const status of statuses) {
        const button = document.createElement('button'); button.className = admin ? 'admin-primary' : 'book-btn'; button.textContent = status;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await apiRequest(`/bookings/${booking.id}`, { method: 'PUT', body: JSON.stringify({ status }) }); await renderBookings(); }
          catch (error) { window.IOTEL_UI.toast(error.message, 'error'); button.disabled = false; }
        }); row.append(button);
      }
      section.append(row);
    }
  }
  try { await renderBookings(); } catch (error) { section.append(document.createTextNode(error.message)); }
  const notifications = document.createElement('section'); notifications.className = section.className;
  const title = document.createElement('h2'); title.textContent = 'Notifications'; notifications.append(title); host.append(notifications);
  try {
    const result = await apiRequest('/notifications');
    if (!result.notifications.length) notifications.append(document.createTextNode('No notifications yet.'));
    for (const item of result.notifications) {
      const row = document.createElement('p'); row.textContent = `${item.title}: ${item.message}`; notifications.append(row);
    }
  } catch (error) { notifications.append(document.createTextNode(error.message)); }
}
