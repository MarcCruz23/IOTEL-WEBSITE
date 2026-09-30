const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");

async function getNotifications(req, res) {
    const snapshot = await db.collection("notifications").where("userId", "==", req.user.uid).get();
    const notifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return res.json({ success: true, notifications });
}

async function markRead(req, res) {
    const ref = db.collection("notifications").doc(req.params.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: "Notification not found." });
    if (snapshot.data().userId !== req.user.uid) return res.status(403).json({ success: false, message: "You do not have access to this notification." });
    await ref.update({ isRead: true, readAt: FieldValue.serverTimestamp() });
    return res.json({ success: true, message: "Notification marked as read." });
}

module.exports = { getNotifications, markRead };
