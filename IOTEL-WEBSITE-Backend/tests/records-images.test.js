const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sharp = require('sharp');
const { normalizeImage } = require('../utils/images');
function records(db, errors) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/records.js'), 'utf8'), {
        module, console: { error: (...args) => errors.push(args) }, require(name) {
            if (name === '../config/firebase') return db;
            if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 'now' } };
            return require(name);
        }
    });
    return module.exports;
}
test('supplementary database failure is logged without rejecting the saved business action', async () => {
    const errors = [];
    const api = records({ collection: () => ({ add: async () => { throw Object.assign(new Error('offline'), { code: 14 }); } }) }, errors);
    assert.equal(await api.createNotification({ userId: 'one', title: 'Saved', message: 'Saved', type: 'test' }), false);
    assert.equal(await api.createActivity({ actorId: 'one', action: 'saved', entityType: 'order', entityId: 'id' }), false);
    assert.equal(errors.length, 2);
});
test('concurrent notification retry creates once and does not reset read status', async () => {
    const stored = new Map(), errors = [];
    const api = records({ collection: name => ({ doc: id => ({ create: async value => {
        const key = name + id;
        if (stored.has(key)) throw { code: 6 };
        stored.set(key, value);
    } }) }) }, errors);
    const input = { userId: 'one', title: 'Saved', message: 'Saved', type: 'order_created', eventKey: 'order-created:one' };
    await Promise.all([api.createNotification(input), api.createNotification(input)]);
    assert.equal(stored.size, 1);
    const record = [...stored.values()][0]; record.isRead = true;
    await api.createNotification(input); assert.equal(record.isRead, true); assert.equal(errors.length, 0);
});
test('image decoder rejects damaged files and re-encodes valid photos without extra payload', async () => {
    const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
    const output = await normalizeImage(Buffer.concat([image, Buffer.from('<script>bad</script>')]), { avatar: true });
    assert.equal((await sharp(output).metadata()).format, 'jpeg');
    assert.equal(output.includes(Buffer.from('<script>')), false);
    await assert.rejects(normalizeImage(image.subarray(0, 25)));
    await assert.rejects(normalizeImage(Buffer.from('<svg></svg>')));
});

test('approved payment still returns success when notification/activity storage is unavailable', async () => {
    const data = {
        'payments/order': { orderId: 'order', userId: 'customer', status: 'submitted' },
        'orders/order': { userId: 'customer', orderStatus: 'pending_payment', stockReserved: true, items: [] }
    };
    const ref = key => ({ key, id: key.split('/')[1] });
    const db = {
        collection: name => ({ doc: id => ref(name + '/' + id), add: async () => { throw { code: 14 }; } }),
        runTransaction: async callback => callback({
            get: async reference => ({ exists: !!data[reference.key], data: () => data[reference.key] }),
            update: (reference, value) => { data[reference.key] = { ...data[reference.key], ...value }; },
            set: (reference, value) => { data[reference.key] = value; }
        })
    };
    const errors = [], module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/paymentController.js'), 'utf8'), {
        module, console, require: name => {
            if (name === '../config/firebase') return db;
            if (name === '../utils/records') return records(db, errors);
            if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 'now' } };
            throw new Error(name);
        }
    });
    const res = { code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await module.exports.reviewPayment({ params: { paymentId: 'order' }, body: { status: 'approved' }, user: { uid: 'admin' } }, res);
    assert.equal(data['payments/order'].status, 'approved'); assert.equal(res.code, 200); assert.equal(res.body.success, true);
    assert.equal(errors.length, 2);
});

test('cart and checkout preserve HTTPS images and reject active URL schemes', () => {
    for (const name of ['cart', 'checkout']) {
        const source = fs.readFileSync(path.join(__dirname, '../../IOTEL-WEBSITE-frontend/static/js/' + name + '.js'), 'utf8');
        const functionSource = source.split('\n').find(line => line.includes('function norm(u)'));
        const norm = vm.runInNewContext('(' + functionSource.trim() + ')');
        assert.equal(norm('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
        assert.equal(norm('public/images/photo.jpg'), '/public/images/photo.jpg');
        for (const value of ['javascript:alert(1)', 'data:text/html,bad', '//example.com/file', null]) assert.equal(norm(value), '/public/images/placeholder.png');
    }
});
