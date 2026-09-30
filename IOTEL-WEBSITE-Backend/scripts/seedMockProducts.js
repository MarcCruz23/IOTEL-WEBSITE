// One-time migration of the temporary frontend catalog into Firestore.
// Run from the backend folder: node scripts/seedMockProducts.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");

const mockDataPath = path.resolve(__dirname, "../../IOTEL-WEBSITE-frontend/static/js/mock-data.js");

async function seedProducts() {
    const source = fs.readFileSync(mockDataPath, "utf8");
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: mockDataPath });
    const products = context.window.MOCK?.products;

    if (!Array.isArray(products) || products.length === 0) {
        throw new Error("No mock products were found.");
    }

    const batch = db.batch();
    for (const product of products) {
        const productRef = db.collection("products").doc(`legacy-${product.id}`);
        batch.set(productRef, {
            name: product.name,
            description: product.description || "",
            price: Number(product.price),
            stock: Number(product.stock),
            category: product.category || "",
            image: product.imageUrl || "",
            images: Array.isArray(product.images) ? product.images : [],
            variations: Array.isArray(product.variations) ? product.variations : [],
            lowStockThreshold: 5,
            status: "active",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }

    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Firestore did not respond within 45 seconds. Check your internet connection and Firebase project access.")), 45000);
    });
    await Promise.race([batch.commit(), timeout]);
    console.log(`Seeded or updated ${products.length} products in Firestore.`);
}

seedProducts()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Product migration failed:", error.message);
        process.exit(1);
    });
