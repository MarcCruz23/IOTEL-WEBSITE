// One-time demo service and schedule setup for the booking flow.
// Run from the backend folder: npm run seed:services
const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");

const services = [
    ["installation", "Installation of Mobile and Fixed Base Radios", "Professional installation support for mobile and fixed base radio systems."],
    ["testing", "Testing & Commissioning", "System checks and commissioning support before service deployment."],
    ["telecommunications", "Telecommunications Solutions", "Communication solutions tailored to operational needs."],
    ["cabling", "Structured Cabling", "Organized cabling services for reliable connectivity."],
    ["cctv", "CCTV Installation", "Installation support for CCTV systems."],
    ["maintenance", "Preventive Maintenance Service (PMS)", "Scheduled inspections and upkeep to maintain system readiness."]
];

function dateKey(date) {
    return date.toISOString().slice(0, 10);
}

async function seedServices() {
    const batch = db.batch();
    const dates = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (dates.length < 5) {
        cursor.setDate(cursor.getDate() + 1);
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) dates.push(dateKey(cursor));
    }

    for (const [id, name, description] of services) {
        const serviceRef = db.collection("services").doc(`demo-${id}`);
        batch.set(serviceRef, { name, description, status: "active", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        for (const date of dates) {
            for (const time of ["09:00", "11:00", "13:00", "15:00"]) {
                const scheduleRef = db.collection("schedules").doc(`demo-${id}-${date}-${time.replace(':', '')}`);
                batch.set(scheduleRef, { serviceId: serviceRef.id, date, time, isAvailable: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            }
        }
    }
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore did not respond within 45 seconds. Check your internet connection and Firebase project access.")), 45000));
    await Promise.race([batch.commit(), timeout]);
    console.log(`Seeded ${services.length} services and ${services.length * dates.length * 4} available schedule slots.`);
}

seedServices()
    .then(() => process.exit(0))
    .catch((error) => { console.error("Service migration failed:", error.message); process.exit(1); });
