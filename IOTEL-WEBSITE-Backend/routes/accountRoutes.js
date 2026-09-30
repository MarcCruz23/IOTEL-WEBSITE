const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const db = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { parseShippingAddress } = require('../controllers/orderController');
const router = express.Router();
router.use(authenticate);

router.get('/profile', async (req, res) => {
    const snapshot = await db.collection('users').doc(req.user.uid).get();
    const profile = snapshot.data();
    res.json({ success: true, profile: { name: profile.name, email: req.user.email, mobileNumber: profile.mobileNumber || '', bio: profile.bio || '' } });
});

router.put('/profile', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const mobileNumber = typeof req.body?.mobileNumber === 'string' ? req.body.mobileNumber.trim() : '';
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 1000) : '';
    if (name.length < 2 || name.length > 100 || (mobileNumber && !/^\d{7,20}$/.test(mobileNumber))) {
        return res.status(400).json({ success: false, message: 'Enter a name of 2–100 characters and a phone number of 7–20 digits.' });
    }
    // Email, role and verification state cannot be changed through profile input.
    await db.collection('users').doc(req.user.uid).update({ name, mobileNumber, bio, updatedAt: FieldValue.serverTimestamp() });
    res.json({ success: true, profile: { name, mobileNumber, bio, email: req.user.email } });
});

const addressesRef = req => db.collection('users').doc(req.user.uid).collection('addresses');
router.get('/addresses', async (req, res) => {
    const snapshot = await addressesRef(req).get();
    res.json({ success: true, addresses: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
});

async function saveAddress(req, res) {
    const { shippingAddress, error } = parseShippingAddress(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const collection = addressesRef(req);
    const ref = req.params.id ? collection.doc(req.params.id) : collection.doc();
    try {
        const address = await db.runTransaction(async transaction => {
            const existing = await transaction.get(collection);
            const current = existing.docs.find(doc => doc.id === ref.id);
            if (req.params.id && !current) throw new Error('NOT_FOUND');
            if (!current && existing.size >= 20) throw new Error('LIMIT');
            const isDefault = existing.empty || req.body.isDefault === true || current?.data().isDefault === true;
            if (isDefault) {
                for (const doc of existing.docs) {
                    if (doc.id !== ref.id && doc.data().isDefault) transaction.update(doc.ref, { isDefault: false });
                }
            }
            const record = { ...shippingAddress, isDefault, updatedAt: FieldValue.serverTimestamp() };
            transaction.set(ref, record);
            return { ...record, id: ref.id };
        });
        res.json({ success: true, address });
    } catch (error) {
        if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Address not found.' });
        if (error.message === 'LIMIT') return res.status(400).json({ success: false, message: 'You can save up to 20 addresses.' });
        throw error;
    }
}
router.post('/addresses', saveAddress);
router.put('/addresses/:id', saveAddress);
router.delete('/addresses/:id', async (req, res) => {
    const ref = addressesRef(req).doc(req.params.id);
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(addressesRef(req));
        const current = snapshot.docs.find(doc => doc.id === ref.id);
        if (!current) return;
        const replacement = snapshot.docs.find(doc => doc.id !== ref.id);
        transaction.delete(ref);
        if (current.data().isDefault && replacement) transaction.update(replacement.ref, { isDefault: true });
    });
    res.json({ success: true });
});
module.exports = router;
