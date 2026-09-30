const { FieldValue } = require("firebase-admin/firestore");
const { randomUUID, createHash } = require("crypto");
const db = require("../config/firebase");

// These records follow a committed business action. Their failure must not tell
// the customer that an already-saved order/payment failed. Log for operators.
// An event key makes retries create-once, preserving existing read/review state.
async function writeRecord(collection, record, eventKey) {
    try {
        if (eventKey) {
            const id = createHash('sha256').update(eventKey).digest('hex');
            await db.collection(collection).doc(id).create(record);
        } else await db.collection(collection).add(record);
        return true;
    } catch (error) {
        if (eventKey && (error.code === 6 || error.code === 'already-exists')) return true;
        console.error('Supplementary record could not be saved:', collection, error.code || 'UNKNOWN');
        return false;
    }
}

async function createNotification({ userId, orderId = null, title, message, type, eventKey }) {
    return writeRecord("notifications", {
        userId,
        orderId,
        title,
        message,
        type,
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
    }, eventKey);
}

async function createActivity({ actorId, action, entityType, entityId, details = {}, eventKey }) {
    return writeRecord("activityLogs", {
        actorId,
        action,
        entityType,
        entityId,
        details,
        createdAt: FieldValue.serverTimestamp()
    }, eventKey);
}

function createTrackingId() {
    return `IOTEL-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

module.exports = { createNotification, createActivity, createTrackingId };
