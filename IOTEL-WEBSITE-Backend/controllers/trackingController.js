const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");
const { createActivity, createNotification } = require("../utils/records");
const allowedStatuses = ["processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled"];

async function getTracking(req, res) {
    const snapshot = await db.collection("tracking").where("trackingId", "==", req.params.trackingId).limit(1).get();
    if (snapshot.empty) return res.status(404).json({ success: false, message: "Tracking ID not found." });
    const tracking = snapshot.docs[0];
    const order = await db.collection('orders').doc(tracking.data().orderId).get();
    if (!order.exists || (req.user.role === 'customer' && order.data().userId !== req.user.uid)) return res.status(403).json({ success: false, message: 'You cannot access this tracking record.' });
    return res.json({ success: true, tracking: { trackingId: tracking.data().trackingId, status: tracking.data().status, updatedAt: tracking.data().updatedAt } });
}

async function updateTracking(req, res) {
    const status = typeof req.body?.status === "string" ? req.body.status.toLowerCase() : "";
    if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, message: "Invalid delivery status." });
    const orderRef = db.collection("orders").doc(req.params.orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists || !orderSnapshot.data().trackingId) return res.status(404).json({ success: false, message: "Tracked order not found." });
    await db.collection("tracking").doc(orderRef.id).update({ status, updatedBy: req.user.uid, updatedAt: FieldValue.serverTimestamp() });
    await orderRef.update({ orderStatus: status, updatedAt: FieldValue.serverTimestamp() });
    await createNotification({ userId: orderSnapshot.data().userId, orderId: orderRef.id, title: "Delivery updated", message: `Your delivery status is now ${status}.`, type: "delivery_updated" });
    await createActivity({ actorId: req.user.uid, action: "updated", entityType: "tracking", entityId: orderRef.id, details: { status } });
    return res.json({ success: true, message: "Delivery status updated." });
}

module.exports = { getTracking, updateTracking };
