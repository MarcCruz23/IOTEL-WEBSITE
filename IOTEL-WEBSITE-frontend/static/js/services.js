import { apiRequest } from './api.js';

let services = [];
let schedules = [];

function currentUser() {
  try { return JSON.parse(localStorage.getItem('IOTEL_CURRENT_USER') || '{}'); } catch { return {}; }
}

function formatStatus(status) { return String(status || 'pending').replaceAll('_', ' '); }

function renderServices() {
  const grid = document.getElementById('servicesGrid');
  const select = document.getElementById('serviceSelect');
  grid.innerHTML = '';
  select.innerHTML = '';
  if (!services.length) {
    grid.textContent = 'No services are available yet. Ask an administrator to add services and schedules.';
    return;
  }

  services.forEach((service) => {
    const card = document.createElement('div'); card.className = 'svc-card';
    const icon = document.createElement('div'); icon.className = 'svc-icon'; icon.textContent = '🔧';
    const title = document.createElement('h3'); title.className = 'svc-title'; title.textContent = service.name;
    const description = document.createElement('p'); description.className = 'svc-desc'; description.textContent = service.description || 'Service details will be confirmed by our team.';
    const footer = document.createElement('div'); footer.className = 'svc-footer';
    const note = document.createElement('div'); note.className = 'svc-price'; note.textContent = 'Schedule a consultation';
    const book = document.createElement('button'); book.type = 'button'; book.className = 'book-btn'; book.textContent = 'Book Now';
    book.addEventListener('click', () => openBooking(service.id));
    footer.append(note, book); card.append(icon, title, description, footer); grid.appendChild(card);
    const option = document.createElement('option'); option.value = service.id; option.textContent = service.name; select.appendChild(option);
  });
}

function renderTimeChoices() {
  const dateInput = document.getElementById('preferredDate');
  const timeSelect = document.getElementById('preferredTime');
  const dates = [...new Set(schedules.map((schedule) => schedule.date))].sort();
  if (!dates.includes(dateInput.value)) dateInput.value = dates[0] || '';
  timeSelect.innerHTML = '';
  schedules.filter((schedule) => schedule.date === dateInput.value).sort((a, b) => a.time.localeCompare(b.time)).forEach((schedule) => {
    const option = document.createElement('option'); option.value = schedule.id; option.textContent = schedule.time; timeSelect.appendChild(option);
  });
  timeSelect.disabled = !timeSelect.options.length;
  document.querySelector('#bookingForm button[type="submit"]').disabled = !timeSelect.options.length;
}

async function loadSchedules() {
  const serviceId = document.getElementById('serviceSelect').value;
  const timeSelect = document.getElementById('preferredTime');
  timeSelect.innerHTML = '<option>Loading available times…</option>';
  try {
    const result = await apiRequest(`/services/schedules?serviceId=${encodeURIComponent(serviceId)}`);
    schedules = result.schedules || [];
    const dates = [...new Set(schedules.map((schedule) => schedule.date))].sort();
    const dateInput = document.getElementById('preferredDate');
    dateInput.min = dates[0] || '';
    dateInput.max = dates.at(-1) || '';
    renderTimeChoices();
    if (!schedules.length) window.IOTEL_UI.toast('There are no available time slots for this service yet.', 'info');
  } catch (error) {
    schedules = []; timeSelect.innerHTML = ''; timeSelect.disabled = true;
    window.IOTEL_UI.toast(error.message || 'Available schedules could not be loaded.', 'error');
  }
}

async function renderBookings() {
  const list = document.getElementById('bookingsList');
  const empty = document.getElementById('noBookings');
  list.textContent = 'Loading your bookings…';
  try {
    const result = await apiRequest('/bookings');
    const bookings = result.bookings || [];
    list.innerHTML = '';
    if (!bookings.length) { list.style.display = 'none'; empty.style.display = 'block'; return; }
    empty.style.display = 'none'; list.style.display = 'block';
    bookings.forEach((booking) => {
      const service = services.find((item) => item.id === booking.serviceId);
      const card = document.createElement('div'); card.className = 'booking-card';
      const header = document.createElement('div'); header.className = 'booking-header';
      const details = document.createElement('div');
      const title = document.createElement('h3'); title.className = 'booking-title'; title.textContent = service?.name || 'Service booking';
      const date = document.createElement('p'); date.className = 'booking-date'; date.textContent = `${booking.date} at ${booking.time}`;
      details.append(title, date);
      const actions = document.createElement('div'); actions.className = 'booking-right';
      const status = document.createElement('div'); status.className = `order-status status-${booking.status}`; status.textContent = formatStatus(booking.status);
      actions.appendChild(status);
      if (booking.status === 'pending') {
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
        cancel.style.background = 'transparent'; cancel.style.border = '1px solid #ffd6d6'; cancel.style.color = '#ff4d4f';
        cancel.addEventListener('click', async () => {
          if (!await window.IOTEL_UI.confirm('Cancel this booking and release its time slot?', { title:'Cancel booking', confirmLabel:'Cancel booking', danger:true })) return;
          try { await apiRequest(`/bookings/${encodeURIComponent(booking.id)}/cancel`, { method: 'PUT' }); await renderBookings(); window.IOTEL_UI.toast('Booking cancelled.', 'success'); }
          catch (error) { window.IOTEL_UI.toast(error.message || 'Booking could not be cancelled.', 'error'); }
        });
        actions.appendChild(cancel);
      }
      header.append(details, actions); card.appendChild(header); list.appendChild(card);
    });
  } catch (error) {
    list.textContent = error.message || 'Bookings could not be loaded.';
  }
}

async function openBooking(serviceId) {
  if (!sessionStorage.getItem('IOTEL_AUTH_TOKEN')) { location.href = 'login.html'; return; }
  document.getElementById('bookingModal').style.display = 'flex';
  document.getElementById('serviceSelect').value = serviceId || services[0]?.id || '';
  const user = currentUser();
  const name = document.getElementById('customerName'); const email = document.getElementById('customerEmail'); const mobile = document.getElementById('customerMobile');
  name.value = user.fullName || ''; email.value = user.email || ''; mobile.value = user.mobileNumber || 'Not provided';
  [name, email, mobile].forEach((input) => { input.readOnly = true; input.required = false; });
  await loadSchedules();
}

function closeBooking() { document.getElementById('bookingModal').style.display = 'none'; }

async function submitBooking(event) {
  event.preventDefault();
  const scheduleId = document.getElementById('preferredTime').value;
  if (!scheduleId) { window.IOTEL_UI.toast('Choose an available service date and time.', 'error'); return; }
  const submit = document.querySelector('#bookingForm button[type="submit"]'); submit.disabled = true;
  try {
    await apiRequest('/bookings', { method: 'POST', body: JSON.stringify({ scheduleId }) });
    closeBooking(); await renderBookings(); document.querySelector('[data-tab="bookings"]').click();
    window.IOTEL_UI.toast('Booking submitted successfully.', 'success');
  } catch (error) {
    window.IOTEL_UI.toast(error.message || 'Booking could not be created.', 'error');
    await loadSchedules();
  } finally { submit.disabled = false; }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await apiRequest('/services'); services = result.services || []; renderServices();
  } catch (error) { document.getElementById('servicesGrid').textContent = 'Services could not be loaded. Check that the backend is running.'; }
  renderBookings();
  document.querySelectorAll('.tab-btn').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((item) => item.classList.remove('active')); button.classList.add('active');
    const bookingTab = button.dataset.tab === 'bookings'; document.getElementById('tab-available').style.display = bookingTab ? 'none' : 'block'; document.getElementById('tab-bookings').style.display = bookingTab ? 'block' : 'none';
    if (bookingTab) renderBookings();
  }));
  document.getElementById('bookServiceBtn')?.addEventListener('click', () => openBooking());
  document.getElementById('cancelBookingBtn')?.addEventListener('click', closeBooking);
  document.getElementById('bookingForm')?.addEventListener('submit', submitBooking);
  document.getElementById('serviceSelect')?.addEventListener('change', loadSchedules);
  document.getElementById('preferredDate')?.addEventListener('change', renderTimeChoices);
});
