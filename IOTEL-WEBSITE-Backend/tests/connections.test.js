// Offline regression tests: no real accounts, orders, payments, or emails are created.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isGmailAddress } = require('../utils/email');

function load(relative, dependencies) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
    vm.runInNewContext(source, {
        module, exports: module.exports, console, URL, process,
        require(name) {
            if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
            return dependencies[name];
        }
    });
    return module.exports;
}
function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
const FieldValue = { serverTimestamp: () => 'timestamp', delete: () => null };
const records = { createActivity: async () => {}, createNotification: async () => {}, createTrackingId: () => 'tracking-test' };
function database(initial) {
    const data = structuredClone(initial);
    let sequence = 0;
    const ref = key => ({ key, id: key.split('/')[1], get: async () => snapshot(key) });
    const snapshot = key => ({ exists: key in data, id: key.split('/')[1], data: () => data[key], ref: ref(key) });
    return {
        data,
        collection: name => ({ doc: id => ref(`${name}/${id || `new-${++sequence}`}`) }),
        async runTransaction(callback) {
            const writes = [];
            const result = await callback({
                async get(reference) {
                    assert.equal(writes.length, 0, 'Firestore prohibits reads after transaction writes');
                    return snapshot(reference.key);
                },
                update(reference, value) { writes.push([reference.key, value]); },
                set(reference, value) { writes.push([reference.key, value]); }
            });
            for (const [key, value] of writes) data[key] = { ...data[key], ...value };
            return result;
        }
    };
}
function controller(name, db) {
    return load(`controllers/${name}.js`, {
        '../config/firebase': db, 'firebase-admin/firestore': { FieldValue }, '../utils/records': records,
        'node:crypto': require('node:crypto'), '../utils/schedule': require('../utils/schedule')
    });
}

test('Gmail policy rejects other domains, misspellings, malformed addresses and suffix attacks', () => {
    for (const email of ['alice@gmail.com', ' Alice.Smith+shop@GMAIL.COM ']) assert.equal(isGmailAddress(email), true);
    for (const email of ['alice@yahoo.com', 'alice@outlook.com', 'alice@ggmail.com', 'alice@gmail.con', 'alice@gmail.com.evil.com', '.alice@gmail.com', 'a..b@gmail.com', 'a b@gmail.com', '@gmail.com', 'a@@gmail.com', null]) {
        assert.equal(isGmailAddress(email), false, String(email));
    }
});

test('registration rejects non-Gmail before creating an account', async () => {
    const auth = load('controllers/authController.js', {
        'firebase-admin/auth': { getAuth: () => { throw new Error('Must not create user'); } },
        'firebase-admin/firestore': { FieldValue }, '../config/firebase': {}, '../utils/email': { isGmailAddress }
    });
    const res = response();
    await auth.register({ body: { name: 'Test User', email: 'test@yahoo.com', password: 'Test123!' } }, res);
    assert.equal(res.statusCode, 400);
});

test('protected APIs reject missing tokens and unverified Firebase identities', async () => {
    const middleware = load('middleware/auth.js', {
        'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'user', email: 'user@gmail.com', email_verified: false }) }) },
        '../config/firebase': {}, '../utils/email': { isGmailAddress }
    });
    const missing = response();
    await middleware.authenticate({ headers: {} }, missing, () => assert.fail('Must reject'));
    assert.equal(missing.statusCode, 401);
    const unverified = response();
    await middleware.authenticate({ headers: { authorization: 'Bearer test-token' } }, unverified, () => assert.fail('Must reject'));
    assert.equal(unverified.statusCode, 403);
    assert.equal(unverified.body.code, 'EMAIL_NOT_VERIFIED');
});

test('verified identity gets its role from backend profile, never the browser', async () => {
    const db = database({ 'users/user': { name: 'User', role: 'customer', status: 'active' } });
    const middleware = load('middleware/auth.js', {
        'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'user', email: 'user@gmail.com', email_verified: true }) }) },
        '../config/firebase': db, '../utils/email': { isGmailAddress }
    });
    const req = { headers: { authorization: 'Bearer test-token' }, body: { role: 'admin' } };
    let continued = false;
    await middleware.authenticate(req, response(), () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.user.role, 'customer');
});

function paymentDatabase(status = 'pending_payment', stock = 5) {
    return database({
        'payments/order': { orderId: 'order', status: 'submitted' },
        'orders/order': { userId: 'customer', orderStatus: status, items: [{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 1 }] },
        'products/a': { name: 'A', stock, status: 'active' },
        'products/b': { name: 'B', stock: 6, status: 'active' }
    });
}
test('multi-product payment approval reads everything before writes and deducts stock once', async () => {
    const db = paymentDatabase();
    const payments = controller('paymentController', db);
    const req = { params: { paymentId: 'order' }, body: { status: 'approved' }, user: { uid: 'admin' } };
    const res = response();
    await payments.reviewPayment(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(db.data['products/a'].stock, 3);
    assert.equal(db.data['products/b'].stock, 5);
    assert.equal(db.data['orders/order'].orderStatus, 'processing');
    const retry = response();
    await payments.reviewPayment(req, retry);
    assert.equal(retry.statusCode, 400);
    assert.equal(db.data['products/a'].stock, 3);
});

test('cancelled orders and insufficient stock cannot be approved', async () => {
    for (const db of [paymentDatabase('cancelled'), paymentDatabase('pending_payment', 1)]) {
        const res = response();
        await controller('paymentController', db).reviewPayment({ params: { paymentId: 'order' }, body: { status: 'approved' }, user: { uid: 'admin' } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(db.data['payments/order'].status, 'submitted');
        assert.equal(db.data['products/b'].stock, 6);
    }
});

test('booking cancellation releases its own schedule with all reads before writes', async () => {
    const db = database({ 'bookings/booking': { userId: 'user', scheduleId: 'slot', status: 'pending' }, 'schedules/slot': { isAvailable: false, bookingId: 'booking' } });
    const res = response();
    await controller('bookingController', db).cancelOwnBooking({ params: { id: 'booking' }, user: { uid: 'user' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(db.data['bookings/booking'].status, 'cancelled');
    assert.equal(db.data['schedules/slot'].isAvailable, true);
});

test('checkout calculates totals from database prices, ignoring browser prices', async () => {
    const db = database({ 'products/a': { name: 'A', price: 125, stock: 4, status: 'active' } });
    const res = response();
    await controller('orderController', db).createOrder({ user: { uid: 'user' }, body: {
        items: [{ productId: 'a', quantity: 2, price: 1 }], total: 2,
        shippingAddress: { fullName: 'Test User', mobile: '09123456789', addressLine: 'Test street', city: 'Test City', province: 'Test Province', zip: '1234' }
    } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.order.subtotal, 250);
    assert.equal(res.body.order.shipping, 250);
    assert.equal(res.body.order.total, 500);
});

test('order retries return the original order and reject changed requests without another stock deduction', async () => {
    const db = database({ 'products/a': { name: 'A', price: 19.99, stock: 4, status: 'active' } });
    const request = { headers: { 'idempotency-key': 'repeat-order-123456' }, user: { uid: 'user' }, body: {
        items: [{ productId: 'a', quantity: 3 }], paymentMethod: 'cod',
        shippingAddress: { fullName: 'Test User', mobile: '09123456789', addressLine: 'Test street', city: 'Test City', province: 'Test Province', zip: '1234' }
    } };
    const api = controller('orderController', db);
    const first = response(); await api.createOrder(request, first);
    assert.equal(first.statusCode, 201); assert.equal(first.body.order.subtotal, 59.97);
    const second = response(); await api.createOrder(request, second);
    assert.equal(second.statusCode, 201); assert.equal(second.body.order.id, first.body.order.id);
    assert.equal(db.data['products/a'].stock, 1);
    request.body.items[0].quantity = 1;
    const changed = response(); await api.createOrder(request, changed);
    assert.equal(changed.statusCode, 409); assert.equal(db.data['products/a'].stock, 1);
});

test('product input rejects null, booleans, unsafe stock and excessive price precision', async () => {
    const api = controller('productController', {});
    for (const input of [{ price: null }, { price: true }, { price: '' }, { price: 0.001 }, { stock: null }, { stock: true }, { stock: 1.2 }, { stock: 1e20 }]) {
        const res = response();
        await api.createProduct({ body: { name: 'Test', price: 25, stock: 5, ...input } }, res);
        assert.equal(res.statusCode, 400, JSON.stringify(input));
    }
});

test('unknown and inactive backend roles cannot access protected APIs', async () => {
    for (const profile of [{ role: 'owner', status: 'active' }, { role: 'admin', status: 'disabled' }]) {
        const middleware = load('middleware/auth.js', {
            'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'user', email: 'user@gmail.com', email_verified: true }) }) },
            '../config/firebase': database({ 'users/user': profile }), '../utils/email': { isGmailAddress }
        });
        const res = response();
        await middleware.authenticate({ headers: { authorization: 'Bearer test' } }, res, () => assert.fail('Must reject'));
        assert.equal(res.statusCode, 403);
    }
});
