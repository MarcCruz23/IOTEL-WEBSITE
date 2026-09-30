const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");
const { createActivity, createNotification } = require("../utils/records");

function parseProductInput(body, isUpdate = false) {
    const product = {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

    if (!isUpdate || has("name")) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name.length < 2 || name.length > 120) return { error: "Product name must be 2 to 120 characters." };
        product.name = name;
    }

    if (!isUpdate || has("price")) {
        const price = Number(body.price);
        if (!['number', 'string'].includes(typeof body.price) || String(body.price).trim() === '' || !Number.isFinite(price) || price < 0 || price > 1000000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.0001) return { error: "Price must be a valid non-negative amount with at most two decimal places." };
        product.price = price;
    }

    if (!isUpdate || has("stock")) {
        const stock = Number(body.stock);
        if (!['number', 'string'].includes(typeof body.stock) || String(body.stock).trim() === '' || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) return { error: "Stock must be a whole number from zero to 1,000,000." };
        product.stock = stock;
    }

    if (has("description")) product.description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
    if (has("category")) product.category = typeof body.category === "string" ? body.category.trim().slice(0, 80) : "";
    if (has("image")) product.image = typeof body.image === "string" ? body.image.trim().slice(0, 2000) : "";
    if (has("lowStockThreshold")) {
        const threshold = Number(body.lowStockThreshold);
        if (!Number.isInteger(threshold) || threshold < 0) return { error: "Low-stock threshold must be a whole number of zero or more." };
        product.lowStockThreshold = threshold;
    }

    return { product };
}

async function getProducts(req, res) {
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
    const snapshot = await db.collection("products").get();

    const products = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((product) => product.status !== "inactive")
        .filter((product) => !category || String(product.category || "").toLowerCase() === category)
        .filter((product) => !search || `${product.name || ""} ${product.description || ""}`.toLowerCase().includes(search));

    return res.json({ success: true, products });
}

async function getProductById(req, res) {
    const snapshot = await db.collection("products").doc(req.params.id).get();
    if (!snapshot.exists || snapshot.data().status === "inactive") {
        return res.status(404).json({ success: false, message: "Product not found." });
    }
    return res.json({ success: true, product: { id: snapshot.id, ...snapshot.data() } });
}

async function createProduct(req, res) {
    const { product, error } = parseProductInput(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });

    const productRef = db.collection("products").doc();
    const record = {
        ...product,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };
    await productRef.set(record);
    await createActivity({ actorId: req.user.uid, action: "created", entityType: "product", entityId: productRef.id, details: { name: product.name } });

    return res.status(201).json({ success: true, message: "Product created.", product: { id: productRef.id, ...record } });
}

async function updateProduct(req, res) {
    const productRef = db.collection("products").doc(req.params.id);
    const existing = await productRef.get();
    if (!existing.exists || existing.data().status === "inactive") {
        return res.status(404).json({ success: false, message: "Product not found." });
    }

    const { product, error } = parseProductInput(req.body || {}, true);
    if (error) return res.status(400).json({ success: false, message: error });
    if (Object.keys(product).length === 0) return res.status(400).json({ success: false, message: "Provide at least one product field to update." });

    const updated = { ...product, updatedAt: FieldValue.serverTimestamp() };
    await productRef.update(updated);
    const merged = { ...existing.data(), ...product };

    if (merged.stock <= (merged.lowStockThreshold ?? 5)) {
        await createNotification({
            userId: req.user.uid,
            title: "Low stock alert",
            message: `${merged.name} has ${merged.stock} item(s) remaining.`,
            type: "low_stock"
        });
    }

    await createActivity({ actorId: req.user.uid, action: "updated", entityType: "product", entityId: productRef.id, details: { fields: Object.keys(product) } });
    return res.json({ success: true, message: "Product updated.", product: { id: productRef.id, ...merged } });
}

async function deactivateProduct(req, res) {
    const productRef = db.collection("products").doc(req.params.id);
    const snapshot = await productRef.get();
    if (!snapshot.exists || snapshot.data().status === "inactive") {
        return res.status(404).json({ success: false, message: "Product not found." });
    }

    await productRef.update({ status: "inactive", updatedAt: FieldValue.serverTimestamp() });
    await createActivity({ actorId: req.user.uid, action: "deactivated", entityType: "product", entityId: productRef.id });
    return res.json({ success: true, message: "Product deactivated." });
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, deactivateProduct };
