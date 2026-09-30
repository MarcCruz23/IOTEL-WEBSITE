const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");
const { createHash } = require('node:crypto');
const { createActivity, createNotification, createTrackingId } = require("../utils/records");

function parseOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return { error: "Provide 1 to 50 order items." };
    }

    const quantities = new Map();
    for (const item of items) {
        const productId = typeof item?.productId === "string" ? item.productId.trim() : "";
        const quantity = Number(item?.quantity);
        if (!productId || productId.includes("/") || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
            return { error: "Each item needs a valid productId and quantity from 1 to 100." };
        }
        const combinedQuantity = (quantities.get(productId) || 0) + quantity;
        if (combinedQuantity > 100) return { error: "Maximum quantity per product is 100." };
        quantities.set(productId, combinedQuantity);
    }

    return { items: [...quantities].map(([productId, quantity]) => ({ productId, quantity })) };
}

// Keep the delivery address with the order so staff can fulfil it and the
// customer can view it later in order tracking.  We only accept the fields
// used by the checkout form instead of accepting arbitrary client data.
function parseShippingAddress(address) {
    if (!address || typeof address !== "object" || Array.isArray(address)) {
        return { error: "Select a complete delivery address before placing the order." };
    }

    const clean = (value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
    const shippingAddress = {
        fullName: clean(address.fullName, 100),
        mobile: clean(address.mobile, 20),
        addressLine: clean(address.addressLine, 200),
        barangay: clean(address.barangay, 100),
        city: clean(address.city, 100),
        province: clean(address.province, 100),
        zip: clean(address.zip, 12)
    };

    if (shippingAddress.fullName.length < 2 || !/^[0-9+()\-\s]{7,20}$/.test(shippingAddress.mobile)
        || shippingAddress.addressLine.length < 2 || shippingAddress.city.length < 2
        || shippingAddress.province.length < 2 || !/^[A-Za-z0-9\-\s]{3,12}$/.test(shippingAddress.zip)) {
        return { error: "Enter a complete valid delivery address before placing the order." };
    }

    return { shippingAddress };
}

async function createOrder(req, res) {
    const { items, error } = parseOrderItems(req.body?.items);
    if (error) return res.status(400).json({ success: false, message: error });
    const { shippingAddress, error: addressError } = parseShippingAddress(req.body?.shippingAddress);
    if (addressError) return res.status(400).json({ success: false, message: addressError });
    const paymentMethod = req.body?.paymentMethod || 'bank_transfer';
    if (!['bank_transfer', 'cod'].includes(paymentMethod)) return res.status(400).json({ success: false, message: 'Choose bank transfer or cash on delivery.' });
    const paymentReference = typeof req.body?.paymentReference === 'string' ? req.body.paymentReference.trim().slice(0, 120) : '';
    const trackingId = paymentMethod === 'cod' ? createTrackingId() : null;

    const retryKey = req.headers?.['idempotency-key'];
    if (retryKey && !/^[A-Za-z0-9-]{16,100}$/.test(retryKey)) return res.status(400).json({ success: false, message: 'Invalid order retry key.' });
    const fingerprint = createHash('sha256').update(JSON.stringify({ items, shippingAddress, paymentMethod, paymentReference })).digest('hex');
    const orderRef = retryKey
        ? db.collection('orders').doc(createHash('sha256').update(req.user.uid + ':' + retryKey).digest('hex'))
        : db.collection('orders').doc();
    const paymentRef = db.collection("payments").doc(orderRef.id);

    try {
        const order = await db.runTransaction(async (transaction) => {
            if (retryKey) {
                const previous = await transaction.get(orderRef);
                if (previous.exists) {
                    if (previous.data().requestFingerprint !== fingerprint) throw new Error('RETRY_CONFLICT');
                    return previous.data();
                }
            }
            const orderItems = [];
            const stockUpdates = [];
            let subtotal = 0;

            for (const requestedItem of items) {
                const productRef = db.collection("products").doc(requestedItem.productId);
                const productSnapshot = await transaction.get(productRef);
                if (!productSnapshot.exists || productSnapshot.data().status === "inactive") {
                    throw new Error("PRODUCT_NOT_FOUND");
                }

                const product = productSnapshot.data();
                if (product.stock < requestedItem.quantity) {
                    throw new Error("INSUFFICIENT_STOCK");
                }

                const price = Number(product.price);
                if (!Number.isFinite(price) || price < 0 || !Number.isInteger(product.stock)) throw new Error('INVALID_PRODUCT');
                stockUpdates.push({ ref: productRef, stock: product.stock - requestedItem.quantity });
                const lineTotal = Math.round(price * 100) * requestedItem.quantity / 100;
                subtotal = Math.round((subtotal + lineTotal) * 100) / 100;
                orderItems.push({
                    productId: productSnapshot.id,
                    name: product.name,
                    price,
                    quantity: requestedItem.quantity,
                    lineTotal
                });
            }

            const shipping = subtotal >= 5000 ? 0 : 250;
            const orderRecord = {
                userId: req.user.uid,
                requestFingerprint: fingerprint,
                items: orderItems,
                subtotal,
                shipping,
                total: subtotal + shipping,
                paymentMethod,
                paymentReference,
                paymentStatus: paymentMethod === 'cod' ? 'unpaid' : 'pending',
                orderStatus: paymentMethod === 'cod' ? 'processing' : 'pending_payment',
                stockReserved: true,
                trackingId,
                shippingAddress,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };

            for (const update of stockUpdates) transaction.update(update.ref, { stock: update.stock, updatedAt: FieldValue.serverTimestamp() });
            transaction.set(orderRef, orderRecord);
            if (trackingId) transaction.set(db.collection('tracking').doc(orderRef.id), { orderId: orderRef.id, trackingId, status: 'processing', updatedAt: FieldValue.serverTimestamp() });
            transaction.set(paymentRef, {
                orderId: orderRef.id,
                userId: req.user.uid,
                method: paymentMethod,
                reference: paymentReference,
                status: paymentMethod === 'cod' ? 'unpaid' : 'pending',
                proofUrl: null,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            return orderRecord;
        });

        await createNotification({
            userId: req.user.uid,
            orderId: orderRef.id,
            title: "Order created",
            message: paymentMethod === 'cod' ? `Your order ${orderRef.id} is being prepared for cash on delivery.` : `Your order ${orderRef.id} is awaiting payment proof.`,
            type: "order_created", eventKey: `order-created:${orderRef.id}`
        }).catch(error => console.error('Order notification failed:', error.code || 'UNKNOWN'));
        await createActivity({ actorId: req.user.uid, action: "created", entityType: "order", entityId: orderRef.id, eventKey: `order-created:${orderRef.id}` });

        return res.status(201).json({ success: true, message: "Order created.", order: { id: orderRef.id, ...order } });
    } catch (transactionError) {
        if (transactionError.message === 'RETRY_CONFLICT') return res.status(409).json({ success: false, message: 'This retry key belongs to a different order request.' });
        const errors = {
            PRODUCT_NOT_FOUND: "One or more products are no longer available.",
            INSUFFICIENT_STOCK: "One or more products do not have enough stock."
        };
        return res.status(400).json({ success: false, message: errors[transactionError.message] || "Unable to create the order." });
    }
}

function canAccessOrder(order, user) {
    return order.userId === user.uid || user.role === "admin" || user.role === "staff";
}

async function getOrders(req, res) {
    const snapshot = await db.collection("orders").get();
    const orders = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((order) => req.user.role === "admin" || req.user.role === "staff" || order.userId === req.user.uid)
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return res.json({ success: true, orders });
}

async function getOrderById(req, res) {
    const snapshot = await db.collection("orders").doc(req.params.id).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: "Order not found." });
    const order = snapshot.data();
    if (!canAccessOrder(order, req.user)) return res.status(403).json({ success: false, message: "You do not have access to this order." });
    return res.json({ success: true, order: { id: snapshot.id, ...order } });
}

async function cancelOrder(req, res) {
    const orderRef = db.collection("orders").doc(req.params.id);
    try {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(orderRef);
            if (!snapshot.exists) throw new Error("NOT_FOUND");
            const order = snapshot.data();
            if (order.userId !== req.user.uid) throw new Error("FORBIDDEN");
            if (order.orderStatus !== "pending_payment" && !(order.paymentMethod === 'cod' && order.orderStatus === 'processing')) throw new Error("NOT_CANCELLABLE");
            const restore = [];
            if (order.stockReserved) {
                for (const item of order.items) {
                    const ref = db.collection('products').doc(item.productId);
                    const product = await transaction.get(ref);
                    if (product.exists) restore.push({ ref, stock: product.data().stock + item.quantity });
                }
            }
            for (const item of restore) transaction.update(item.ref, { stock: item.stock, updatedAt: FieldValue.serverTimestamp() });
            transaction.update(orderRef, { orderStatus: "cancelled", paymentStatus: 'cancelled', stockReserved: false, updatedAt: FieldValue.serverTimestamp() });
            transaction.update(db.collection("payments").doc(orderRef.id), { status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
            if (order.trackingId) transaction.update(db.collection('tracking').doc(orderRef.id), { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
        });
    } catch (error) {
        const errors = {
            NOT_FOUND: [404, "Order not found."],
            FORBIDDEN: [403, "You can cancel only your own order."],
            NOT_CANCELLABLE: [400, "Only unpaid orders can be cancelled."]
        };
        const [status, message] = errors[error.message] || [500, "Unable to cancel order."];
        return res.status(status).json({ success: false, message });
    }
    await createActivity({ actorId: req.user.uid, action: "cancelled", entityType: "order", entityId: orderRef.id });
    return res.json({ success: true, message: "Order cancelled." });
}

async function updateOrderStatus(req, res) {
    const status = typeof req.body?.status === "string" ? req.body.status.toLowerCase() : "";
    const allowedStatuses = ["processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered"];
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid order status." });
    }

    const orderRef = db.collection("orders").doc(req.params.id);
    let order;
    try {
        order = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(orderRef);
            if (!snapshot.exists) throw new Error('NOT_FOUND');
            const value = snapshot.data();
            if (value.paymentMethod !== 'cod' && value.paymentStatus !== 'approved') throw new Error('UNPAID');
            const current = allowedStatuses.indexOf(value.orderStatus);
            const next = allowedStatuses.indexOf(status);
            if (current < 0 || next < current || next > current + 1) throw new Error('TRANSITION');
            const paid = value.paymentMethod === 'cod' && status === 'delivered';
            transaction.update(orderRef, { orderStatus: status, ...(paid ? { paymentStatus: 'paid' } : {}), updatedAt: FieldValue.serverTimestamp() });
            if (paid) transaction.update(db.collection('payments').doc(orderRef.id), { status: 'paid', collectedBy: req.user.uid, updatedAt: FieldValue.serverTimestamp() });
            if (value.trackingId) transaction.update(db.collection('tracking').doc(orderRef.id), { status, updatedBy: req.user.uid, updatedAt: FieldValue.serverTimestamp() });
            return value;
        });
    } catch (error) {
        const messages = { NOT_FOUND: 'Order not found.', UNPAID: 'Payment must be approved first.', TRANSITION: 'Move the order forward one delivery step at a time.' };
        if (!messages[error.message]) throw error;
        return res.status(error.message === 'NOT_FOUND' ? 404 : 400).json({ success: false, message: messages[error.message] });
    }
    await createNotification({ userId: order.userId, orderId: orderRef.id, title: "Order updated", message: `Your order status is now ${status}.`, type: "order_updated", eventKey: `order-status:${orderRef.id}:${status}` });
    await createActivity({ actorId: req.user.uid, action: "updated", entityType: "order", entityId: orderRef.id, details: { status }, eventKey: `order-status:${orderRef.id}:${status}` });
    return res.json({ success: true, message: "Order status updated." });
}

module.exports = { createOrder, getOrders, getOrderById, cancelOrder, updateOrderStatus, parseShippingAddress };
