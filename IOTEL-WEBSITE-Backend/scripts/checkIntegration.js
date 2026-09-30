// Explicit opt-in live check. Uses only newly created review fixtures and removes them afterward.
// Run: node scripts/checkIntegration.js --run-live
if (!process.argv.includes('--run-live')) { console.log('Add --run-live to create disposable Firebase test fixtures.'); process.exit(0); }
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const { getAuth } = require('firebase-admin/auth');
const db = require('../config/firebase');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../IOTEL-WEBSITE-frontend/static/js/firebase-config.js'), 'utf8'), context);
const apiKey = context.window.IOTEL_FIREBASE_CONFIG.apiKey;
const base = process.env.TEST_API_URL || 'http://localhost:5000/api';
const prefix = `review${Date.now()}`;
const users = [], docs = [], proofs = [];
let assertions = 0;
async function request(route, token, method = 'GET', body, expected = 200, image = false, extraHeaders = {}) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(30000), method, headers: { ...extraHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': image ? 'image/png' : 'application/json' } : {}) }, body: body ? (image ? body : JSON.stringify(body)) : undefined });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); assertions++;
    return data;
}
async function user(role, verified = true) {
    const uid = prefix + role + users.length;
    await getAuth().createUser({ uid, email: `${uid}@gmail.com`, emailVerified: verified, displayName: 'Disposable Review User' });
    users.push(uid);
    await db.collection('users').doc(uid).set({ role, status: 'active', name: 'Disposable Review User', email: `${uid}@gmail.com` });
    const customToken = await getAuth().createCustomToken(uid);
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
    const data = await response.json();
    assert.ok(data.idToken, 'Firebase test sign-in failed: ' + (data.error?.message || response.status));
    return { uid, token: data.idToken };
}
async function remember(collection, id) { const ref = db.collection(collection).doc(id); docs.push(ref); return ref; }
async function main() {
    try {
        const customer = await user('customer'), other = await user('customer'), admin = await user('admin'), staff = await user('staff'), unverified = await user('customer', false);
        await request('/auth/me', unverified.token, 'GET', null, 403);
        await request('/admin/dashboard', customer.token, 'GET', null, 403);
        await request('/auth/me', customer.token);
        const validImage = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
        const initialPreferences = await request('/account/preferences', customer.token);
        assert.equal(initialPreferences.preferences.language, 'en');
        await request('/account/preferences', customer.token, 'PUT', { language: 'fil', shareBookingContact: false });
        assert.equal((await request('/account/preferences', customer.token)).preferences.shareBookingContact, false);
        assert.equal((await request('/account/preferences', other.token)).preferences.language, 'en');
        await request('/account/preferences', customer.token, 'PUT', { language: 'invalid', shareBookingContact: false }, 400);
        const bankBody = { bankName: 'Demo Bank', accountName: 'Review User', lastFour: '1234' };
        const bank = await request('/account/bank-accounts', customer.token, 'POST', bankBody, 201);
        docs.push(db.collection('users').doc(customer.uid).collection('bankAccounts').doc(bank.account.id));
        await request('/account/bank-accounts', customer.token, 'POST', bankBody, 409);
        await request('/account/bank-accounts', customer.token, 'POST', { ...bankBody, cardNumber: 'not-accepted' }, 400);
        assert.equal((await request('/account/bank-accounts', other.token)).accounts.length, 0);
        await request(`/account/bank-accounts/${bank.account.id}`, other.token, 'DELETE', null, 404);
        await request(`/account/bank-accounts/${bank.account.id}`, customer.token, 'DELETE');
        await request('/account/photo', customer.token, 'PUT', Buffer.from('invalid'), 400, true);
        await request('/account/photo', customer.token, 'PUT', validImage, 200, true);
        await request('/account/photo', customer.token);
        await request('/account/photo', other.token, 'GET', null, 404);
        await request('/account/photo', customer.token, 'DELETE');
        await request('/account/photo', customer.token, 'GET', null, 404);
        await request('/orders', null, 'GET', null, 401);
        await request('/orders', 'invalid-token', 'GET', null, 401);
        const unknown = await user('unknown');
        await request('/bookings', unknown.token, 'GET', null, 403);
        await request('/products/bad%2Fpath', null, 'GET', null, 400);
        // Check deployed Firestore rules using a real customer token, not Admin credentials.
        const projectId = context.window.IOTEL_FIREBASE_CONFIG.projectId;
        const direct = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${other.uid}`, { headers: { Authorization: `Bearer ${customer.token}` }, signal: AbortSignal.timeout(30000) });
        console.log(`Firestore direct cross-account read: HTTP ${direct.status} (${direct.status === 403 ? 'blocked' : 'REQUIRES REVIEW'}).`);
        assert.equal(direct.status, 403, 'Deployed Firestore rules must deny cross-account reads'); assertions++;
        const directWrite = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${customer.uid}?updateMask.fieldPaths=role`, {
            method: 'PATCH', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }), signal: AbortSignal.timeout(30000)
        });
        assert.equal(directWrite.status, 403, 'Deployed Firestore rules must deny client role escalation'); assertions++;
        await request('/account/profile', customer.token, 'PUT', { name: 'Review Customer', mobileNumber: '09123456789', bio: 'Test profile', role: 'admin' });
        assert.equal((await request('/auth/me', customer.token)).user.role, 'customer');
        const addressBody = { fullName: 'Review Customer', mobile: '09123456789', addressLine: 'Test address', city: 'Test City', province: 'Test Province', zip: '1234' };
        const { address } = await request('/account/addresses', customer.token, 'POST', addressBody);
        const addressRef = db.collection('users').doc(customer.uid).collection('addresses').doc(address.id); docs.push(addressRef);
        assert.equal((await request('/account/addresses', other.token)).addresses.length, 0);
        await request(`/account/addresses/${address.id}`, other.token, 'PUT', addressBody, 404);
        const { conversation } = await request('/messages', customer.token, 'POST', { subject: 'Review test', text: 'Disposable test message' }, 201);
        await remember('conversations', conversation.id);
        assert.equal((await request('/messages', other.token)).conversations.some(item => item.id === conversation.id), false);
        await request(`/messages/${conversation.id}/messages`, other.token, 'POST', { text: 'Unauthorized' }, 403);
        await request(`/messages/${conversation.id}/messages`, staff.token, 'POST', { text: 'Disposable support reply' });
        const productId = prefix + 'product'; const productRef = await remember('products', productId);
        const productBody = { name: 'Disposable CRUD product', price: 10.25, stock: 2 };
        await request('/products', customer.token, 'POST', productBody, 403);
        await request('/products', staff.token, 'POST', productBody, 403);
        const createdProduct = await request('/products', admin.token, 'POST', productBody, 201);
        await remember('products', createdProduct.product.id);
        await request(`/products/${createdProduct.product.id}`, admin.token, 'PUT', { price: 12.5, stock: 3 });
        assert.equal((await request(`/products/${createdProduct.product.id}`, null)).product.price, 12.5);
        await request(`/products/${createdProduct.product.id}`, admin.token, 'DELETE');
        await request(`/products/${createdProduct.product.id}`, null, 'GET', null, 404);
        await productRef.set({ name: 'Disposable review product', price: 125, stock: 10, status: 'active', category: 'Test' });
        const orderBody = { items: [{ productId, quantity: 2, price: 1 }], total: 1, shippingAddress: addressBody, paymentMethod: 'cod' };
        const { order: cancelled } = await request('/orders', customer.token, 'POST', orderBody, 201);
        for (const collection of ['orders', 'payments', 'tracking']) await remember(collection, cancelled.id);
        assert.equal(cancelled.total, 500); assert.equal((await productRef.get()).data().stock, 8);
        await request(`/orders/${cancelled.id}`, other.token, 'GET', null, 403);
        await request(`/orders/${cancelled.id}/cancel`, customer.token, 'PUT');
        assert.equal((await productRef.get()).data().stock, 10);
        const retryHeaders = { 'Idempotency-Key': prefix + '-retry-order' };
        const [retried, parallelRetry] = await Promise.all([
            request('/orders', customer.token, 'POST', orderBody, 201, false, retryHeaders),
            request('/orders', customer.token, 'POST', orderBody, 201, false, retryHeaders)
        ]);
        for (const collection of ['orders', 'payments', 'tracking']) await remember(collection, retried.order.id);
        assert.equal(parallelRetry.order.id, retried.order.id);
        const again = await request('/orders', customer.token, 'POST', orderBody, 201, false, retryHeaders);
        assert.equal(retried.order.id, again.order.id);
        assert.equal((await db.collection('notifications').where('orderId', '==', retried.order.id).get()).size, 1, 'Retries must not duplicate notifications');
        assert.equal((await productRef.get()).data().stock, 8);
        await request('/orders', customer.token, 'POST', { ...orderBody, paymentReference: 'changed' }, 409, false, retryHeaders);
        await request(`/orders/${retried.order.id}/cancel`, customer.token, 'PUT');
        const { order } = await request('/orders', customer.token, 'POST', { ...orderBody, paymentMethod: 'bank_transfer', paymentReference: 'REVIEW-ONLY' }, 201);
        for (const collection of ['orders', 'payments', 'tracking']) await remember(collection, order.id);
        await request(`/payments/orders/${order.id}/proof`, customer.token, 'POST', Buffer.from('not an image'), 400, true);
        const image = validImage;
        await request(`/payments/orders/${order.id}/proof`, customer.token, 'POST', image, 200, true);
        const payment = (await db.collection('payments').doc(order.id).get()).data(); proofs.push(payment.proofFile);
        await request(`/payments/orders/${order.id}/proof`, customer.token, 'POST', image, 400, true);
        await request(`/payments/${order.id}/proof`, other.token, 'GET', null, 403);
        await request(`/payments/${order.id}/proof`, admin.token);
        await request(`/payments/${order.id}/status`, staff.token, 'PUT', { status: 'approved' }, 403);
        await request(`/payments/${order.id}/status`, admin.token, 'PUT', { status: 'rejected', reason: 'Disposable rejection check' });
        assert.equal((await productRef.get()).data().stock, 8, 'Rejection must not change reserved stock');
        await request(`/payments/orders/${order.id}/proof`, customer.token, 'POST', image, 200, true);
        proofs.push((await db.collection('payments').doc(order.id).get()).data().proofFile);
        await request(`/payments/${order.id}/status`, admin.token, 'PUT', { status: 'approved' });
        assert.equal((await productRef.get()).data().stock, 8, 'Approval must not deduct reserved stock twice');
        await request(`/payments/${order.id}/status`, admin.token, 'PUT', { status: 'approved' }, 400);
        await request(`/orders/${order.id}/status`, staff.token, 'PUT', { status: 'delivered' }, 400);
        for (const status of ['ready_to_ship', 'shipped', 'out_for_delivery', 'delivered']) await request(`/orders/${order.id}/status`, staff.token, 'PUT', { status });
        await request('/notifications', customer.token);
        const serviceRef = await remember('services', prefix + 'service'); await serviceRef.set({ name: 'Disposable service', status: 'active' });
        const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        await request(`/services/${serviceRef.id}/schedules`, staff.token, 'POST', { date: '2028-02-30', time: '25:00' }, 400);
        const slot = await request(`/services/${serviceRef.id}/schedules`, staff.token, 'POST', { date: futureDate, time: '10:00' }, 201);
        const scheduleRef = await remember('schedules', slot.schedule.id);
        await request(`/services/${serviceRef.id}/schedules`, staff.token, 'POST', { date: futureDate, time: '10:00' }, 409);
        const { booking } = await request('/bookings', customer.token, 'POST', { scheduleId: scheduleRef.id }, 201); await remember('bookings', booking.id);
        assert.equal(booking.customerEmail, '', 'New booking must respect contact privacy');
        await request('/bookings', other.token, 'POST', { scheduleId: scheduleRef.id }, 400);
        await request(`/bookings/${booking.id}/cancel`, customer.token, 'PUT');
        assert.equal((await scheduleRef.get()).data().isAvailable, true);
        const next = await request('/bookings', customer.token, 'POST', { scheduleId: scheduleRef.id }, 201); await remember('bookings', next.booking.id);
        await request(`/bookings/${next.booking.id}`, staff.token, 'PUT', { status: 'confirmed' });
        await request(`/bookings/${next.booking.id}`, staff.token, 'PUT', { status: 'cancelled' });
        assert.equal((await scheduleRef.get()).data().isAvailable, true);
        const deliveredCod = await request('/orders', customer.token, 'POST', orderBody, 201);
        for (const collection of ['orders', 'payments', 'tracking']) await remember(collection, deliveredCod.order.id);
        for (const status of ['ready_to_ship', 'shipped', 'out_for_delivery', 'delivered']) await request(`/orders/${deliveredCod.order.id}/status`, staff.token, 'PUT', { status });
        assert.equal((await db.collection('orders').doc(deliveredCod.order.id).get()).data().paymentStatus, 'paid');
        await request(`/tracking/${deliveredCod.order.trackingId}`, other.token, 'GET', null, 403);
        await request(`/tracking/orders/${deliveredCod.order.id}`, staff.token, 'PUT', { status: 'processing' }, 400);
        const summary = await request('/account/payment-summary', customer.token);
        assert.equal(summary.paid, order.total + deliveredCod.order.total);
        assert.equal((await request('/account/payment-summary', other.token)).paid, 0);
        await request('/account/sign-out-all', customer.token, 'POST');
        await request('/auth/me', customer.token, 'GET', null, 401);
        console.log(`PASS: ${assertions} live HTTP checks plus database assertions (roles, privacy, profiles, addresses, messages, totals, stock, proofs, delivery, bookings).`);
    } finally {
        for (const ref of docs.reverse()) await ref.delete();
        for (const uid of users) {
            for (const [collection, field] of [['notifications', 'userId'], ['activityLogs', 'actorId']]) {
                const records = await db.collection(collection).where(field, '==', uid).get();
                for (const doc of records.docs) await doc.ref.delete();
            }
            await db.collection('users').doc(uid).delete();
            await getAuth().deleteUser(uid);
        }
        for (const file of proofs) if (file && path.basename(file) === file) await fs.promises.unlink(path.join(__dirname, '../private-uploads', file)).catch(() => {});
        console.log('Removed this run’s disposable fixtures. Existing customer data was not modified.');
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
