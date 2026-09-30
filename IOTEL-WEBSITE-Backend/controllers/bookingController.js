const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");
const { createHash } = require('node:crypto');
const { isFutureSlot } = require('../utils/schedule');
const { createActivity, createNotification } = require("../utils/records");

async function getServices(req, res) {
    const snapshot = await db.collection("services").get();
    const services = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((service) => service.status !== "inactive");
    return res.json({ success: true, services });
}

async function createService(req, res) {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 2000) : "";
    if (name.length < 2 || name.length > 120) return res.status(400).json({ success: false, message: "Service name must be 2 to 120 characters." });
    const ref = db.collection("services").doc();
    await ref.set({ name, description, status: "active", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await createActivity({ actorId: req.user.uid, action: "created", entityType: "service", entityId: ref.id });
    return res.status(201).json({ success: true, service: { id: ref.id, name, description, status: "active" } });
}

async function getSchedules(req, res) {
    const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId : "";
    const snapshot = await db.collection("schedules").get();
    const schedules = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((schedule) => schedule.isAvailable !== false && isFutureSlot(schedule.date, schedule.time) && (!serviceId || schedule.serviceId === serviceId));
    return res.json({ success: true, schedules });
}

async function createSchedule(req, res) {
    const { serviceId } = req.params;
    const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
    const time = typeof req.body?.time === "string" ? req.body.time.trim() : "";
    if (!isFutureSlot(date, time)) return res.status(400).json({ success: false, message: "Choose a valid future date (YYYY-MM-DD) and time (HH:MM), Philippine time." });
    const serviceSnapshot = await db.collection("services").doc(serviceId).get();
    if (!serviceSnapshot.exists || serviceSnapshot.data().status === "inactive") return res.status(404).json({ success: false, message: "Service not found." });
    const ref = db.collection('schedules').doc(createHash('sha256').update(JSON.stringify([serviceId, date, time])).digest('hex'));
    try {
        await db.runTransaction(async transaction => {
            const existing = await transaction.get(db.collection('schedules').where('serviceId', '==', serviceId));
            if (existing.docs.some(doc => doc.data().date === date && doc.data().time === time)) throw new Error('DUPLICATE');
            transaction.create(ref, { serviceId, date, time, isAvailable: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        });
    } catch (error) {
        if (error.message !== 'DUPLICATE' && error.code !== 6) throw error;
        return res.status(409).json({ success: false, message: 'This service already has a schedule at that time.' });
    }
    return res.status(201).json({ success: true, schedule: { id: ref.id, serviceId, date, time, isAvailable: true } });
}

async function createBooking(req, res) {
    const scheduleId = typeof req.body?.scheduleId === "string" ? req.body.scheduleId.trim() : "";
    if (!scheduleId || /[/\\]/.test(scheduleId) || scheduleId.length > 1500) return res.status(400).json({ success: false, message: "Provide a valid scheduleId." });
    const bookingRef = db.collection("bookings").doc();
    try {
        const booking = await db.runTransaction(async (transaction) => {
            const scheduleRef = db.collection("schedules").doc(scheduleId);
            const scheduleSnapshot = await transaction.get(scheduleRef);
            if (!scheduleSnapshot.exists || scheduleSnapshot.data().isAvailable === false) throw new Error("SLOT_UNAVAILABLE");
            const schedule = scheduleSnapshot.data();
            if (!isFutureSlot(schedule.date, schedule.time)) throw new Error('SLOT_UNAVAILABLE');
            const serviceSnapshot = await transaction.get(db.collection("services").doc(schedule.serviceId));
            if (!serviceSnapshot.exists || serviceSnapshot.data().status === "inactive") throw new Error("SERVICE_NOT_FOUND");
            const record = {
                userId: req.user.uid,
                customerName: req.user.name || "",
                customerEmail: req.user.shareBookingContact === false ? '' : req.user.email || "",
                customerMobile: req.user.shareBookingContact === false ? '' : req.user.mobileNumber || "",
                serviceId: schedule.serviceId,
                scheduleId,
                date: schedule.date,
                time: schedule.time,
                status: "pending",
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };
            transaction.set(bookingRef, record);
            transaction.update(scheduleRef, { isAvailable: false, bookingId: bookingRef.id, updatedAt: FieldValue.serverTimestamp() });
            return record;
        });
        await createNotification({ userId: req.user.uid, title: "Booking created", message: `Your service booking is scheduled for ${booking.date} at ${booking.time}.`, type: "booking_created" });
        await createActivity({ actorId: req.user.uid, action: "created", entityType: "booking", entityId: bookingRef.id });
        return res.status(201).json({ success: true, message: "Booking created.", booking: { id: bookingRef.id, ...booking } });
    } catch (error) {
        return res.status(error.message === "SERVICE_NOT_FOUND" ? 404 : 400).json({ success: false, message: error.message === "SERVICE_NOT_FOUND" ? "Service not found." : "This schedule is no longer available." });
    }
}

async function getBookings(req, res) {
    const snapshot = await db.collection("bookings").get();
    const bookings = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })).filter((booking) => ['admin', 'staff'].includes(req.user.role) || booking.userId === req.user.uid);
    return res.json({ success: true, bookings });
}

async function updateBooking(req, res) {
    const status = typeof req.body?.status === "string" ? req.body.status.toLowerCase() : "";
    if (!['confirmed', 'completed', 'cancelled', 'rejected'].includes(status)) return res.status(400).json({ success: false, message: "Invalid booking status." });
    const ref = db.collection("bookings").doc(req.params.id);
    let booking;
    try {
        booking = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) throw new Error('NOT_FOUND');
            const value = snapshot.data();
            const transitions = { pending: ['confirmed', 'cancelled', 'rejected'], confirmed: ['completed', 'cancelled'] };
            if (!(transitions[value.status] || []).includes(status)) throw new Error('TRANSITION');
            const scheduleRef = db.collection('schedules').doc(value.scheduleId);
            const schedule = await transaction.get(scheduleRef);
            transaction.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
            if (['cancelled', 'rejected'].includes(status) && schedule.exists && schedule.data().bookingId === ref.id) {
                transaction.update(scheduleRef, { isAvailable: true, bookingId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
            }
            return value;
        });
    } catch (error) {
        if (!['NOT_FOUND', 'TRANSITION'].includes(error.message)) throw error;
        return res.status(error.message === 'NOT_FOUND' ? 404 : 400).json({ success: false, message: error.message === 'NOT_FOUND' ? 'Booking not found.' : 'This booking cannot move to that status.' });
    }
    await createNotification({ userId: booking.userId, title: "Booking updated", message: `Your booking status is now ${status}.`, type: "booking_updated" });
    return res.json({ success: true, message: "Booking updated." });
}

async function cancelOwnBooking(req, res) {
    const bookingRef = db.collection("bookings").doc(req.params.id);
    try {
        await db.runTransaction(async (transaction) => {
            const bookingSnapshot = await transaction.get(bookingRef);
            if (!bookingSnapshot.exists) throw new Error("BOOKING_NOT_FOUND");
            const booking = bookingSnapshot.data();
            if (booking.userId !== req.user.uid) throw new Error("FORBIDDEN");
            if (booking.status !== "pending") throw new Error("NOT_CANCELLABLE");

            const scheduleRef = db.collection("schedules").doc(booking.scheduleId);
            const scheduleSnapshot = await transaction.get(scheduleRef);
            transaction.update(bookingRef, { status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
            if (scheduleSnapshot.exists && scheduleSnapshot.data().bookingId === bookingRef.id) {
                transaction.update(scheduleRef, { isAvailable: true, bookingId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
            }
        });
    } catch (error) {
        const messages = {
            BOOKING_NOT_FOUND: [404, "Booking not found."],
            FORBIDDEN: [403, "You can cancel only your own booking."],
            NOT_CANCELLABLE: [400, "Only pending bookings can be cancelled."]
        };
        const [status, message] = messages[error.message] || [500, "Booking could not be cancelled."];
        return res.status(status).json({ success: false, message });
    }
    await createActivity({ actorId: req.user.uid, action: "cancelled", entityType: "booking", entityId: bookingRef.id });
    return res.json({ success: true, message: "Booking cancelled and its schedule is available again." });
}

module.exports = { getServices, createService, getSchedules, createSchedule, createBooking, getBookings, updateBooking, cancelOwnBooking };
