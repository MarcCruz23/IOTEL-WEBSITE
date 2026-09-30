const express = require('express');
const db = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);
const staff = user => ['admin', 'staff'].includes(user.role);
const cleanText = value => typeof value === 'string' ? value.trim() : '';

router.get('/', async (req, res) => {
    let query = db.collection('conversations');
    if (!staff(req.user)) query = query.where('userId', '==', req.user.uid);
    const snapshot = await query.get();
    const conversations = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
    res.json({ success: true, conversations });
});

router.post('/', async (req, res) => {
    const subject = cleanText(req.body?.subject);
    const text = cleanText(req.body?.text);
    if (!subject || subject.length > 120 || !text || text.length > 2000) return res.status(400).json({ success: false, message: 'Use a subject up to 120 characters and a message up to 2000 characters.' });
    let userId = req.user.uid;
    let customerName = req.user.name;
    if (staff(req.user)) {
        const email = cleanText(req.body?.customerEmail).toLowerCase();
        const users = await db.collection('users').where('email', '==', email).where('role', '==', 'customer').limit(1).get();
        if (users.empty) return res.status(400).json({ success: false, message: 'Enter the Gmail address of an existing customer.' });
        userId = users.docs[0].id;
        customerName = users.docs[0].data().name;
    }
    const at = new Date().toISOString();
    const record = { userId, customerName, subject, lastMessage: text, lastMessageAt: at,
        messages: [{ from: req.user.role, senderName: req.user.name, text, at }] };
    const ref = await db.collection('conversations').add(record);
    res.status(201).json({ success: true, conversation: { ...record, id: ref.id } });
});

router.post('/:id/messages', async (req, res) => {
    const text = cleanText(req.body?.text);
    if (!text || text.length > 2000) return res.status(400).json({ success: false, message: 'Message must be 1–2000 characters.' });
    const ref = db.collection('conversations').doc(req.params.id);
    try {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) throw new Error('NOT_FOUND');
            const conversation = snapshot.data();
            if (!staff(req.user) && conversation.userId !== req.user.uid) throw new Error('FORBIDDEN');
            const messages = conversation.messages || [];
            if (messages.length >= 200) throw new Error('LIMIT');
            const at = new Date().toISOString();
            transaction.update(ref, { messages: [...messages, { from: req.user.role, senderName: req.user.name, text, at }], lastMessage: text, lastMessageAt: at });
        });
        res.json({ success: true });
    } catch (error) {
        const errors = { NOT_FOUND: [404, 'Conversation not found.'], FORBIDDEN: [403, 'You cannot access this conversation.'], LIMIT: [400, 'This conversation is full. Start a new conversation.'] };
        if (!errors[error.message]) throw error;
        const [status, message] = errors[error.message];
        res.status(status).json({ success: false, message });
    }
});
module.exports = router;
