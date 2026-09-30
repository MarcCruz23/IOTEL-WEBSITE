// DOM integration tests use simulated API responses. They complement, not replace,
// the live Firebase API tests and browser/email acceptance checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const frontend = path.resolve(__dirname, '../../IOTEL-WEBSITE-frontend');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
async function setup() {
    const dom = new JSDOM(fs.readFileSync(path.join(frontend, 'settings.html'), 'utf8'), { url: 'http://localhost:9010/settings.html', runScripts: 'outside-only' });
    await settle();
    const calls = [], toasts = [];
    const state = { preferences: { language: 'en', shareBookingContact: true }, photo: false, accounts: [] };
    const apiRequest = async (route, options = {}) => {
        calls.push({ route, ...options });
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        if (route === '/account/preferences') {
            if (options.method === 'PUT') state.preferences = body;
            return { preferences: { ...state.preferences }, hasPhoto: state.photo };
        }
        if (route === '/account/profile') return { profile: { name: 'UI Test', mobileNumber: '', bio: '' } };
        if (route === '/auth/me') return { user: { email: 'uitest@gmail.com', emailVerified: true } };
        if (route === '/notifications') return { notifications: [] };
        if (route === '/account/payment-summary') return { paid: 500, awaitingPayment: 250, awaitingReview: 125, recent: [] };
        if (route === '/account/bank-accounts') {
            if (options.method === 'POST') state.accounts.push({ id: 'test', ...body });
            return { accounts: state.accounts };
        }
        if (route === '/account/bank-accounts/test' && options.method === 'DELETE') { state.accounts = []; return {}; }
        if (route === '/account/photo') { state.photo = options.method !== 'DELETE'; return new dom.window.Blob(['jpeg']); }
        if (route === '/account/sign-out-all') return {};
        throw new Error('Unexpected request ' + route);
    };
    Object.assign(dom.window, { apiRequest, auth: { currentUser: { email: 'uitest@gmail.com' } }, authReady: Promise.resolve(),
        sendPasswordResetEmail: async (_auth, email) => calls.push({ route: 'reset-email', email }), clearToken: async () => {},
        IOTEL_UI: { toast: (...args) => toasts.push(args), confirm: async () => true } });
    dom.window.URL.createObjectURL = () => 'blob:test'; dom.window.URL.revokeObjectURL = () => {};
    for (const file of ['settings.js', 'settings-extra.js']) {
        let source = fs.readFileSync(path.join(frontend, 'static/js', file), 'utf8');
        source = source.replace(/^import .*;\r?\n/gm, '').replace("const { apiRequest } = await import('./api.js');", 'const { apiRequest } = window;');
        vm.runInContext(source, dom.getInternalVMContext());
    }
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await settle();
    return { dom, calls, state, toasts, $: id => dom.window.document.getElementById(id) };
}
test('settings navigation, payment summary and saved language/privacy preferences work together', async () => {
    const { dom, $, state } = await setup();
    try {
        assert.match($('walletPaid').textContent, /500/);
        dom.window.document.querySelector('[data-section="language"]').click();
        assert.equal($('languageSection').style.display, 'block'); assert.equal($('profileSection').style.display, 'none');
        $('languageSelect').value = 'fil'; $('shareBookingContact').checked = false; $('saveLanguage').click(); await settle();
        assert.equal(state.preferences.language, 'fil'); assert.equal(state.preferences.shareBookingContact, false);
        assert.equal(dom.window.document.documentElement.lang, 'fil'); assert.equal($('savePrivacy').textContent, 'I-save ang mga kagustuhan');
        $('editProfileLink').click(); assert.equal($('profileSection').style.display, 'block');
    } finally { dom.window.close(); }
});
test('bank references render text safely and can be removed', async () => {
    const { dom, $, state } = await setup();
    try {
        $('bankName').value = '<img src=x>'; $('accountName').value = 'Test'; $('lastFour').value = '1234';
        $('bankReferenceForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await settle();
        assert.equal(state.accounts.length, 1); assert.equal($('bankReferences').querySelectorAll('img').length, 0);
        assert.match($('bankReferences').textContent, /<img src=x>/);
        $('bankReferences').querySelector('button').click(); await settle(); assert.equal(state.accounts.length, 0);
    } finally { dom.window.close(); }
});
test('photo controls upload/remove and password reset uses the signed-in address', async () => {
    const { dom, $, calls } = await setup();
    try {
        Object.defineProperty($('photoInput'), 'files', { value: [new dom.window.File(['png'], 'photo.png', { type: 'image/png' })] });
        $('photoInput').dispatchEvent(new dom.window.Event('change')); await settle();
        assert.equal($('profilePhotoPreview').hidden, false);
        $('removePhotoBtn').click(); await settle(); assert.equal($('profilePhotoPreview').hidden, true);
        $('settingsResetPassword').click(); await settle();
        assert.equal(calls.find(call => call.route === 'reset-email').email, 'uitest@gmail.com');
    } finally { dom.window.close(); }
});
