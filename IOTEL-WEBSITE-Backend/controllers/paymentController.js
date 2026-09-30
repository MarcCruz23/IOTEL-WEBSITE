const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");
const { createActivity, createNotification, createTrackingId } = require("../utils/records");

// Proofs must use the private authenticated image upload endpoint.
async function submitBankTransfer(req, res) {
    return res.status(410).json({ success: false, message: 'Upload a PNG or JPEG proof from My Orders. External proof URLs are no longer accepted.' });
}

async function reviewPayment(req, res) {
    const decision = typeof req.body?.status === "string" ? req.body.status.toLowerCase() : "";
    const rejectionReason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ success: false, message: "Status must be approved or rejected." });
    }
    if (decision === "rejected" && !rejectionReason) {
        return res.status(400).json({ success: false, message: "Provide a reason when rejecting a payment." });
    }

    const paymentRef = db.collection("payments").doc(req.params.paymentId);
    const trackingId = decision === "approved" ? createTrackingId() : null;
    let result;

    try {
        result = await db.runTransaction(async (transaction) => {
            const paymentSnapshot = await transaction.get(paymentRef);
            if (!paymentSnapshot.exists) throw new Error("PAYMENT_NOT_FOUND");
            const payment = paymentSnapshot.data();
            if (payment.status !== "submitted") throw new Error("PAYMENT_NOT_REVIEWABLE");

            const orderRef = db.collection("orders").doc(payment.orderId);
            const orderSnapshot = await transaction.get(orderRef);
            if (!orderSnapshot.exists) throw new Error("ORDER_NOT_FOUND");
            const order = orderSnapshot.data();
            if (order.orderStatus !== "pending_payment") throw new Error("ORDER_NOT_PAYABLE");

            if (decision === "rejected") {
                transaction.update(paymentRef, { status: "rejected", rejectionReason, reviewedBy: req.user.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
                transaction.update(orderRef, { paymentStatus: "rejected", updatedAt: FieldValue.serverTimestamp() });
                return { order, payment, lowStockProducts: [] };
            }

            const lowStockProducts = [];
            const stockUpdates = [];
            for (const item of order.stockReserved ? [] : order.items) {
                const productRef = db.collection("products").doc(item.productId);
                const productSnapshot = await transaction.get(productRef);
                if (!productSnapshot.exists || productSnapshot.data().status === "inactive") throw new Error("PRODUCT_NOT_FOUND");
                const product = productSnapshot.data();
                if (product.stock < item.quantity) throw new Error("INSUFFICIENT_STOCK");

                const newStock = product.stock - item.quantity;
                stockUpdates.push({ productRef, newStock });
                if (newStock <= (product.lowStockThreshold ?? 5)) lowStockProducts.push({ name: product.name, stock: newStock });
            }

            for (const { productRef, newStock } of stockUpdates) {
                transaction.update(productRef, { stock: newStock, updatedAt: FieldValue.serverTimestamp() });
            }
            transaction.update(paymentRef, { status: "approved", reviewedBy: req.user.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
            transaction.update(orderRef, {
                paymentStatus: "approved",
                orderStatus: "processing",
                stockReserved: true,
                trackingId,
                updatedAt: FieldValue.serverTimestamp()
            });
            transaction.set(db.collection("tracking").doc(orderRef.id), {
                orderId: orderRef.id,
                trackingId,
                status: "processing",
                updatedBy: req.user.uid,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            return { order, payment, lowStockProducts };
        });
    } catch (transactionError) {
        const errors = {
            ORDER_NOT_PAYABLE: "This order has been cancelled or is no longer awaiting payment.",
            PAYMENT_NOT_FOUND: "Payment not found.",
            PAYMENT_NOT_REVIEWABLE: "This payment has already been reviewed or is not submitted.",
            ORDER_NOT_FOUND: "The order for this payment was not found.",
            PRODUCT_NOT_FOUND: "A product in this order is no longer available.",
            INSUFFICIENT_STOCK: "There is no longer enough stock to approve this order."
        };
        return res.status(transactionError.message === "PAYMENT_NOT_FOUND" || transactionError.message === "ORDER_NOT_FOUND" ? 404 : 400).json({ success: false, message: errors[transactionError.message] || "Unable to review payment." });
    }

    await createNotification({
        userId: result.order.userId,
        orderId: result.payment.orderId,
        title: decision === "approved" ? "Payment approved" : "Payment rejected",
        message: decision === "approved" ? `Your payment was approved. Tracking ID: ${trackingId}` : `Your payment was rejected: ${rejectionReason}`,
        type: `payment_${decision}`
    });
    for (const product of result.lowStockProducts) {
        await createNotification({ userId: req.user.uid, title: "Low stock alert", message: `${product.name} has ${product.stock} item(s) remaining.`, type: "low_stock" });
    }
    await createActivity({ actorId: req.user.uid, action: decision, entityType: "payment", entityId: paymentRef.id });

    return res.json({ success: true, message: `Payment ${decision}.`, trackingId: trackingId || undefined });
}

async function getPayments(req, res) {
    const snapshot = await db.collection("payments").get();
    const payments = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return res.json({ success: true, payments });
}

module.exports = { submitBankTransfer, reviewPayment, getPayments };
