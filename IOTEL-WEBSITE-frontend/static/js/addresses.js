// Saved addresses belong to the authenticated user in Firestore.
(function () {
  let addresses = [];
  let apiRequest;
  const fields = { fullName: 'addrFullName', mobile: 'addrMobile', addressLine: 'addrLine', city: 'addrCity', province: 'addrProvince', zip: 'addrZip' };
  const showError = error => window.IOTEL_UI.toast(error.message, 'error');
  async function load() {
    addresses = (await apiRequest('/account/addresses')).addresses;
    const grid = document.getElementById('addressesGrid');
    grid.textContent = addresses.length ? '' : 'No saved addresses. Add your first address.';
    for (const address of addresses) {
      const card = document.createElement('div'); card.className = 'addr-card' + (address.isDefault ? ' default-card' : '');
      if (address.isDefault) { const tag = document.createElement('div'); tag.className = 'default-tag'; tag.textContent = 'Default'; card.append(tag); }
      for (const [value, className] of [[address.fullName, 'addr-name'], [address.addressLine, 'addr-line'], [`${address.city}, ${address.province} ${address.zip}`, 'addr-line'], [address.mobile, 'addr-line']]) {
        const text = document.createElement('p'); text.className = className; text.textContent = value; card.append(text);
      }
      const actions = document.createElement('div'); actions.className = 'addr-actions';
      function action(label, callback) {
        const button = document.createElement('button'); button.className = 'book-btn'; button.textContent = label;
        button.addEventListener('click', async () => { button.disabled = true; try { await callback(); } catch (error) { showError(error); } finally { button.disabled = false; } });
        actions.append(button);
      }
      action('Edit', () => open(address));
      if (!address.isDefault) action('Set as Default', async () => {
        await apiRequest(`/account/addresses/${address.id}`, { method: 'PUT', body: JSON.stringify({ ...address, isDefault: true }) }); await load();
      });
      action('Delete', async () => {
        if (!await window.IOTEL_UI.confirm('Delete this saved address?', { title: 'Delete address', confirmLabel: 'Delete' })) return;
        await apiRequest(`/account/addresses/${address.id}`, { method: 'DELETE' }); await load();
      });
      card.append(actions); grid.append(card);
    }
  }
  function open(address = {}) {
    document.getElementById('addrModal').style.display = 'flex';
    document.getElementById('addrModalTitle').textContent = address.id ? 'Edit Address' : 'Add Address';
    document.getElementById('addrForm').dataset.editing = address.id || '';
    for (const [key, id] of Object.entries(fields)) document.getElementById(id).value = address[key] || '';
  }
  function close() { document.getElementById('addrModal').style.display = 'none'; }
  document.addEventListener('DOMContentLoaded', async () => {
    ({ apiRequest } = await import('./api.js'));
    document.getElementById('addAddressBtn').addEventListener('click', () => open());
    document.getElementById('cancelAddrBtn').addEventListener('click', close);
    document.getElementById('addrForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, id = form.dataset.editing;
      const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, document.getElementById(field).value.trim()]));
      const button = form.querySelector('[type="submit"]'); if (button) button.disabled = true;
      try {
        await apiRequest(`/account/addresses${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        close(); await load(); window.IOTEL_UI.toast('Address saved.', 'success');
      } catch (error) { showError(error); } finally { if (button) button.disabled = false; }
    });
    try { await load(); } catch (error) { showError(error); }
  });
})();
