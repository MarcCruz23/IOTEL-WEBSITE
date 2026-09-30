// Shared client for the existing customer, admin and staff message layouts.
export async function startMessages() {
  const { apiRequest } = await import('./api.js');
  let conversations = [], activeId = null;
  const role = location.pathname.includes('/admin/') ? 'admin' : location.pathname.includes('/staff/') ? 'staff' : 'customer';
  const notify = error => window.IOTEL_UI.toast(error.message, 'error');
  function select(id) {
    activeId = id;
    const conversation = conversations.find(item => item.id === id);
    if (!conversation) return;
    document.getElementById('threadPlaceholder').style.display = 'none';
    document.getElementById('threadView').style.display = 'flex';
    document.getElementById('threadTitle').textContent = conversation.subject;
    document.getElementById('threadCustomer').textContent = conversation.customerName;
    const container = document.getElementById('threadMessages'); container.replaceChildren();
    for (const message of conversation.messages || []) {
      const own = role === 'customer' ? message.from === 'customer' : message.from !== 'customer';
      const row = document.createElement('div'); row.className = 'message-row ' + (message.from === 'customer' ? 'customer' : role === 'admin' ? 'admin' : 'staff');
      const sender = document.createElement('p'); sender.className = 'message-sender'; sender.textContent = message.senderName;
      const bubble = document.createElement('div'); bubble.className = 'msg-bubble ' + (own ? 'msg-sent' : 'msg-recv'); bubble.textContent = message.text;
      const time = document.createElement('p'); time.className = 'message-time'; time.textContent = new Date(message.at).toLocaleString();
      row.append(sender, bubble, time); container.append(row);
    }
    container.scrollTop = container.scrollHeight;
  }
  async function load() {
    conversations = (await apiRequest('/messages')).conversations;
    const container = document.getElementById('conversations'); container.replaceChildren();
    document.getElementById('convsEmpty').style.display = conversations.length ? 'none' : 'block';
    for (const conversation of conversations) {
      const button = document.createElement('button'); button.className = 'conv-item' + (activeId === conversation.id ? ' active' : '');
      for (const [className, value] of [['conv-subject', conversation.subject], ['conv-customer', conversation.customerName], ['conv-last-msg', conversation.lastMessage]]) {
        const text = document.createElement('span'); text.className = className; text.textContent = value; button.append(text);
      }
      button.addEventListener('click', () => select(conversation.id)); container.append(button);
    }
    if (activeId) select(activeId);
  }
  document.getElementById('newConvBtn')?.addEventListener('click', () => { document.getElementById('newConvModal').style.display = 'flex'; });
  document.getElementById('closeNewConv')?.addEventListener('click', () => { document.getElementById('newConvModal').style.display = 'none'; });
  document.getElementById('newConvForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const body = { subject: document.getElementById('convSubject').value.trim(), text: document.getElementById('convMessage').value.trim() };
    if (role !== 'customer') {
      body.customerEmail = await window.IOTEL_UI.prompt('Enter the customer’s Gmail address.', { title: 'Message a customer', label: 'Gmail address' });
      if (!body.customerEmail) return;
    }
    const button = event.currentTarget.querySelector('[type="submit"]'); if (button) button.disabled = true;
    try {
      const { conversation } = await apiRequest('/messages', { method: 'POST', body: JSON.stringify(body) });
      activeId = conversation.id; document.getElementById('newConvModal').style.display = 'none'; document.getElementById('newConvForm').reset(); await load();
    } catch (error) { notify(error); } finally { if (button) button.disabled = false; }
  });
  document.getElementById('msgForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!activeId) return;
    const input = document.getElementById('msgInput'); const text = input.value.trim(); if (!text) return;
    const button = event.currentTarget.querySelector('[type="submit"]'); if (button) button.disabled = true;
    try { await apiRequest(`/messages/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }); input.value = ''; await load(); }
    catch (error) { notify(error); } finally { if (button) button.disabled = false; }
  });
  document.getElementById('backToList')?.addEventListener('click', () => { activeId = null; document.getElementById('threadView').style.display = 'none'; document.getElementById('threadPlaceholder').style.display = 'flex'; });
  try { await load(); } catch (error) { notify(error); }
  let refreshing = false;
  setInterval(async () => {
    if (document.hidden || refreshing) return;
    refreshing = true;
    try { await load(); } catch { /* Sending still reports errors; polling retries. */ }
    finally { refreshing = false; }
  }, 15000);
}
