const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const db = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { normalizeImage } = require('../utils/images');
const router = express.Router();
router.use(authenticate);
const userRef = req => db.collection('users').doc(req.user.uid);

router.get('/preferences', async (req, res) => {
    const data = (await userRef(req).get()).data();
    res.json({ success: true, preferences: { language: data.preferences?.language === 'fil' ? 'fil' : 'en',
        shareBookingContact: data.preferences?.shareBookingContact !== false }, hasPhoto: !!data.profilePhoto });
});
router.put('/preferences', async (req, res) => {
    const { language, shareBookingContact } = req.body || {};
    if (!['en', 'fil'].includes(language) || typeof shareBookingContact !== 'boolean') return res.status(400).json({ success: false, message: 'Choose English or Filipino and a valid contact-sharing preference.' });
    await userRef(req).update({ preferences: { language, shareBookingContact }, updatedAt: FieldValue.serverTimestamp() });
    res.json({ success: true, preferences: { language, shareBookingContact } });
});

router.get('/photo', async (req, res) => {
    const photo = (await userRef(req).get()).data()?.profilePhoto;
    if (!photo) return res.status(404).json({ success: false, message: 'No profile photo.' });
    res.type('jpeg').send(Buffer.from(photo, 'base64'));
});
router.put('/photo', rateLimit({ limit: 10, windowMs: 60000 }), express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), async (req, res) => {
    let image;
    try { image = await normalizeImage(req.body, { avatar: true }); }
    catch { return res.status(400).json({ success: false, message: 'Choose a valid PNG or JPEG photo up to 2 MB and 16 megapixels.' }); }
    await userRef(req).update({ profilePhoto: image.toString('base64'), updatedAt: FieldValue.serverTimestamp() });
    res.json({ success: true });
});
router.delete('/photo', async (req, res) => {
    await userRef(req).update({ profilePhoto: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    res.json({ success: true });
});

// A saved reference is not a payment credential. Never accept a full account or
// card number, CVV, PIN or online-banking password through this endpoint.
router.get('/bank-accounts', async (req, res) => {
    const docs = await userRef(req).collection('bankAccounts').get();
    res.json({ success: true, accounts: docs.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
});
router.post('/bank-accounts', async (req, res) => {
    const input = req.body || {};
    if (Object.keys(input).some(key => !['bankName', 'accountName', 'lastFour'].includes(key))) return res.status(400).json({ success: false, message: 'Save only the bank, account name and last four digits.' });
    const bankName = typeof input.bankName === 'string' ? input.bankName.trim() : '';
    const accountName = typeof input.accountName === 'string' ? input.accountName.trim() : '';
    const lastFour = typeof input.lastFour === 'string' ? input.lastFour.trim() : '';
    if (bankName.length < 2 || bankName.length > 80 || accountName.length < 2 || accountName.length > 100 || !/^\d{4}$/.test(lastFour)) return res.status(400).json({ success: false, message: 'Enter a bank, account name and exactly four ending digits.' });
    const collection = userRef(req).collection('bankAccounts');
    const ref = collection.doc();
    try {
        await db.runTransaction(async transaction => {
            const existing = await transaction.get(collection);
            if (existing.size >= 5) throw new Error('LIMIT');
            if (existing.docs.some(doc => doc.data().bankName.toLowerCase() === bankName.toLowerCase() && doc.data().lastFour === lastFour)) throw new Error('DUPLICATE');
            transaction.create(ref, { bankName, accountName, lastFour, createdAt: FieldValue.serverTimestamp() });
        });
    } catch (error) {
        if (!['LIMIT', 'DUPLICATE'].includes(error.message)) throw error;
        return res.status(409).json({ success: false, message: error.message === 'LIMIT' ? 'You can save up to five bank references.' : 'This bank reference is already saved.' });
    }
    res.status(201).json({ success: true, account: { id: ref.id, bankName, accountName, lastFour } });
});
router.delete('/bank-accounts/:id', async (req, res) => {
    const ref = userRef(req).collection('bankAccounts').doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ success: false, message: 'Bank reference not found.' });
    await ref.delete();
    res.json({ success: true });
});
router.get('/payment-summary', async (req, res) => {
    const snapshot = await db.collection('orders').where('userId', '==', req.user.uid).get();
    const orders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    const sum = values => Math.round(values.reduce((total, order) => total + Number(order.total || 0), 0) * 100) / 100;
    res.json({ success: true, paid: sum(orders.filter(order => ['approved', 'paid'].includes(order.paymentStatus))),
        awaitingPayment: sum(orders.filter(order => !['cancelled'].includes(order.orderStatus) && ['pending', 'rejected', 'unpaid'].includes(order.paymentStatus))),
        awaitingReview: sum(orders.filter(order => order.paymentStatus === 'submitted')),
        recent: orders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 10)
            .map(order => ({ id: order.id, total: order.total, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus })) });
});
router.post('/sign-out-all', rateLimit({ limit: 5, windowMs: 60000 }), async (req, res) => {
    await getAuth().revokeRefreshTokens(req.user.uid);
    res.json({ success: true, message: 'All sessions have been revoked. Sign in again to continue.' });
});
module.exports = router;
