// Trusted local script: promote an existing registered user to admin or staff.
// Usage: node scripts/setUserRole.js user@email.com admin
require("dotenv").config();

const { getAuth } = require("firebase-admin/auth");
const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");

const [email, role] = process.argv.slice(2);
const allowedRoles = ["admin", "staff", "customer"];

if (!email || !allowedRoles.includes(role)) {
    console.error("Usage: node scripts/setUserRole.js user@email.com admin|staff|customer");
    process.exit(1);
}

async function setUserRole() {
    const user = await getAuth().getUserByEmail(email.trim().toLowerCase());
    const profileRef = db.collection("users").doc(user.uid);
    const profile = await profileRef.get();
    if (!profile.exists) throw new Error("The Firebase user has no Firestore profile.");

    await profileRef.update({ role, updatedAt: FieldValue.serverTimestamp() });
    await getAuth().setCustomUserClaims(user.uid, { role });
    console.log(`${email} is now a ${role}. They must log in again to receive a refreshed token.`);
}

setUserRole().catch((error) => {
    console.error("Could not change role:", error.message);
    process.exit(1);
});
