// Proofs stay in a private backend directory. They are never served as public static files.
const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const db = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { normalizeImage } = require('../utils/images');
const router = express.Router();
const directory = path.resolve(process.env.PROOF_UPLOAD_DIR || path.join(__dirname, '../private-uploads'));
router.use(authenticate);

router.post('/orders/:orderId/proof', rateLimit({ limit: 20, windowMs: 60000 }), express.raw({ type: ['image/png', 'image/jpeg'], limit: '3mb' }), async (req, res) => {
    const bytes = req.body;
    const png = Buffer.isBuffer(bytes) && bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 10000 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 10000 && bytes.subarray(-8).equals(Buffer.from([73,69,78,68,174,66,96,130]));
    const jpeg = Buffer.isBuffer(bytes) && bytes.length >= 100 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
    if (!png && !jpeg) return res.status(400).json({ success: false, message: 'Choose a PNG or JPEG image up to 3 MB.' });
    let normalized;
    try { normalized = await normalizeImage(bytes); }
    catch { return res.status(400).json({ success: false, message: 'The image is damaged or exceeds 16 megapixels. Choose another PNG or JPEG.' }); }
    const filename = randomUUID() + '.jpg';
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, filename), normalized, { flag: 'wx' });
    try {
        const previousFile = await db.runTransaction(async transaction => {
            const orderRef = db.collection('orders').doc(req.params.orderId);
            const order = await transaction.get(orderRef);
            if (!order.exists) throw new Error('NOT_FOUND');
            if (order.data().userId !== req.user.uid) throw new Error('FORBIDDEN');
            if (order.data().orderStatus !== 'pending_payment') throw new Error('CLOSED');
            const payment = await transaction.get(db.collection('payments').doc(req.params.orderId));
            if (!payment.exists || payment.data().method !== 'bank_transfer' || !['pending', 'rejected'].includes(payment.data().status)) throw new Error('CLOSED');
            transaction.update(db.collection('payments').doc(req.params.orderId), {
                proofFile: filename, proofType: 'image/jpeg', proofUrl: null,
                method: 'bank_transfer', status: 'submitted', updatedAt: FieldValue.serverTimestamp()
            });
            transaction.update(orderRef, { paymentStatus: 'submitted', updatedAt: FieldValue.serverTimestamp() });
            return payment.data().proofFile;
        });
        if (previousFile && /^[a-f0-9-]+\.(png|jpg)$/.test(previousFile)) await fs.unlink(path.join(directory, previousFile)).catch(() => {});
    } catch (error) {
        await fs.unlink(path.join(directory, filename));
        const errors = { NOT_FOUND: [404, 'Order not found.'], FORBIDDEN: [403, 'This is not your order.'], CLOSED: [400, 'This order cannot accept payment proof.'] };
        if (!errors[error.message]) throw error;
        const [status, message] = errors[error.message];
        return res.status(status).json({ success: false, message });
    }
    res.json({ success: true, message: 'Payment proof submitted for review.' });
});

router.get('/:paymentId/proof', async (req, res) => {
    const snapshot = await db.collection('payments').doc(req.params.paymentId).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: 'Payment not found.' });
    const payment = snapshot.data();
    if (payment.userId !== req.user.uid && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'You cannot view this proof.' });
    if (!payment.proofFile || path.basename(payment.proofFile) !== payment.proofFile) return res.status(404).json({ success: false, message: 'No uploaded proof exists.' });
    res.set({ 'Content-Type': payment.proofType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.sendFile(path.join(directory, payment.proofFile));
});
module.exports = router;
