const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("../iotel-ecommerce-firebase-adminsdk-fbsvc-c3a4a45cc0.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

module.exports = db;