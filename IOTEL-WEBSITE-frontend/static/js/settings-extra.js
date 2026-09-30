import { apiRequest, clearToken } from './api.js';
import { auth, authReady } from './firebase.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const $ = id => document.getElementById(id);
let preferences = { language: 'en', shareBookingContact: true };
let photoUrl;
const translations = {
  'Profile': 'Profile', 'My Addresses': 'Aking mga Address', 'Bank Accounts / Cards': 'Mga Bank Account / Card',
  'My Wallet': 'Aking Wallet', 'Notifications': 'Mga Abiso', 'Privacy Settings': 'Mga Setting ng Privacy',
  'Account Security': 'Seguridad ng Account', 'Language': 'Wika', 'Full Name': 'Buong Pangalan', 'Email': 'Email',
  'Phone': 'Telepono', 'Bio': 'Tungkol sa Iyo', 'Save Changes': 'I-save ang mga Pagbabago', 'Upload Photo': 'Mag-upload ng Larawan',
  'Remove photo': 'Alisin ang larawan', 'Log Out': 'Mag-sign Out', 'Bank': 'Bangko', 'Account name': 'Pangalan ng account',
  'Last four digits': 'Huling apat na digit', 'Save bank reference': 'I-save ang bank reference',
  'Paid / approved': 'Bayad / aprubado', 'Awaiting payment': 'Naghihintay ng bayad', 'Receipt under review': 'Sinusuri ang resibo',
  'Refresh': 'I-refresh', 'Share contact': 'Ibahagi ang aking email at telepono sa staff sa mga bagong booking',
  'Save preferences': 'I-save ang mga kagustuhan', 'Send password reset email': 'Magpadala ng email para i-reset ang password',
  'Sign out all devices': 'Mag-sign out sa lahat ng device', 'Settings language': 'Wika ng mga setting', 'Save language': 'I-save ang wika',
  'Bank note': 'Mag-save ng bank reference gamit lamang ang huling apat na digit. Hindi ito makakasingil sa account mo. Hindi pa available ang pagbabayad gamit ang card.',
  'Wallet note': 'Buod ng bayad sa iyong mga order. Walang nakaimbak na cash balance, top-up o withdrawal.',
  'Privacy note': 'Para ito sa mga susunod na booking. Mananatili ang mga dating rekord. Kailangan pa rin ang delivery address sa mga order. Pribado sa iyong account ang larawan at bank references.',
  'Security note': 'Sa secure na email link ng Firebase ginagawa ang pagbabago ng password. Mawawalan ng bisa ang lahat ng kasalukuyang session kapag nag-sign out sa lahat ng device.',
  'Language note': 'Binabago nito ang interface ng mga setting. Mananatili sa orihinal na wika ang mga produkto at ibang pahina.',
  'Remove': 'Alisin', 'No saved bank references.': 'Walang naka-save na bank reference.', 'No orders yet.': 'Wala pang order.',
  'Saved.': 'Na-save na.', 'Profile photo saved.': 'Na-save ang larawan.', 'Profile photo removed.': 'Naalis ang larawan.'
};
const english = new Map();
function translate() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    if (!english.has(element)) english.set(element, element.textContent);
    element.textContent = preferences.language === 'fil' ? translations[element.dataset.i18n] || english.get(element) : english.get(element);
  });
  document.documentElement.lang = preferences.language;
}
const text = value => preferences.language === 'fil' ? translations[value] || value : value;
function notice(message, type = 'success') { window.IOTEL_UI.toast(text(message), type); }
async function run(button, action) {
  button.disabled = true;
  try { await action(); } catch (error) { notice(error.message, 'error'); }
  finally { button.disabled = false; }
}
async function showPhoto(hasPhoto) {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null; $('profilePhotoPreview').hidden = true; $('removePhotoBtn').hidden = true;
  if (!hasPhoto) return;
  const image = await apiRequest('/account/photo', { responseType: 'blob' });
  photoUrl = URL.createObjectURL(image);
  $('profilePhotoPreview').src = photoUrl; $('profilePhotoPreview').hidden = false; $('removePhotoBtn').hidden = false;
}
async function loadBanks() {
  const { accounts } = await apiRequest('/account/bank-accounts');
  const list = $('bankReferences'); list.replaceChildren();
  if (!accounts.length) list.textContent = text('No saved bank references.');
  for (const account of accounts) {
    const row = document.createElement('p'), label = document.createElement('span'), remove = document.createElement('button');
    label.textContent = `${account.bankName} — ${account.accountName} — •••• ${account.lastFour} `;
    remove.type = 'button'; remove.className = 'book-btn'; remove.textContent = text('Remove');
    remove.addEventListener('click', () => run(remove, async () => {
      if (!await window.IOTEL_UI.confirm('Remove this saved bank reference?')) return;
      await apiRequest(`/account/bank-accounts/${encodeURIComponent(account.id)}`, { method: 'DELETE' }); await loadBanks();
    }));
    row.append(label, remove); list.append(row);
  }
}
async function loadWallet() {
  const value = await apiRequest('/account/payment-summary');
  const money = value => Number(value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
  $('walletPaid').textContent = money(value.paid); $('walletPending').textContent = money(value.awaitingPayment); $('walletReview').textContent = money(value.awaitingReview);
  const list = $('walletHistory'); list.replaceChildren();
  if (!value.recent.length) list.textContent = text('No orders yet.');
  for (const order of value.recent) {
    const row = document.createElement('p'), link = document.createElement('a');
    link.href = `order-confirmation.html?orderId=${encodeURIComponent(order.id)}`;
    link.textContent = `${order.id} — ${money(order.total)} — ${order.paymentStatus}`;
    row.append(link); list.append(row);
  }
}
async function savePreferences() {
  const result = await apiRequest('/account/preferences', { method: 'PUT', body: JSON.stringify({
    language: $('languageSelect').value, shareBookingContact: $('shareBookingContact').checked
  }) });
  preferences = result.preferences; translate(); notice('Saved.');
  await Promise.all([loadBanks(), loadWallet()]);
}

document.addEventListener('DOMContentLoaded', async () => {
  $('uploadPhotoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', () => run($('uploadPhotoBtn'), async () => {
    const file = $('photoInput').files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG or JPEG photo up to 2 MB.');
    try {
      await apiRequest('/account/photo', { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await showPhoto(true); notice('Profile photo saved.');
    } finally { $('photoInput').value = ''; }
  }));
  $('removePhotoBtn').addEventListener('click', () => run($('removePhotoBtn'), async () => {
    if (!await window.IOTEL_UI.confirm('Remove your profile photo?')) return;
    await apiRequest('/account/photo', { method: 'DELETE' }); await showPhoto(false); notice('Profile photo removed.');
  }));
  $('bankReferenceForm').addEventListener('submit', event => {
    event.preventDefault();
    run(event.currentTarget.querySelector('button'), async () => {
      await apiRequest('/account/bank-accounts', { method: 'POST', body: JSON.stringify({ bankName: $('bankName').value,
        accountName: $('accountName').value, lastFour: $('lastFour').value }) });
      $('bankReferenceForm').reset(); await loadBanks(); notice('Saved.');
    });
  });
  $('savePrivacy').addEventListener('click', event => run(event.currentTarget, savePreferences));
  $('saveLanguage').addEventListener('click', event => run(event.currentTarget, savePreferences));
  $('refreshWallet').addEventListener('click', event => run(event.currentTarget, loadWallet));
  $('settingsResetPassword').addEventListener('click', event => run(event.currentTarget, async () => {
    await authReady;
    if (!auth.currentUser) throw new Error('Please sign in again.');
    await sendPasswordResetEmail(auth, auth.currentUser.email);
    notice('Password reset email requested. Check your Gmail inbox and spam folder.');
  }));
  $('signOutAll').addEventListener('click', event => run(event.currentTarget, async () => {
    if (!await window.IOTEL_UI.confirm('Sign out all devices, including this one?')) return;
    await apiRequest('/account/sign-out-all', { method: 'POST' });
    await clearToken(); location.href = '/login.html';
  }));
  $('editProfileLink').addEventListener('click', event => {
    event.preventDefault(); document.querySelector('[data-section="profile"]').click(); $('profileName').focus();
  });
  try {
    const [result, identity] = await Promise.all([apiRequest('/account/preferences'), apiRequest('/auth/me')]);
    preferences = result.preferences;
    $('languageSelect').value = preferences.language; $('shareBookingContact').checked = preferences.shareBookingContact;
    $('securityIdentity').textContent = `${identity.user.email} — ${identity.user.emailVerified ? 'Verified' : 'Not verified'}`;
    translate();
    const results = await Promise.allSettled([showPhoto(result.hasPhoto), loadBanks(), loadWallet()]);
    results.forEach(result => { if (result.status === 'rejected') notice(result.reason.message, 'error'); });
  } catch (error) { notice(error.message, 'error'); }
});
window.addEventListener('pagehide', () => { if (photoUrl) URL.revokeObjectURL(photoUrl); });
