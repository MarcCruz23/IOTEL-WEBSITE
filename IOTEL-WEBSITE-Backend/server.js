require("dotenv").config();

const express = require("express");
const cors = require("cors");

const db = require("./config/firebase");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const { rateLimit, securityHeaders } = require('./middleware/security');
app.disable('x-powered-by');
app.use(securityHeaders);
const PORT = process.env.PORT || 5000;


app.use(cors({
    origin: (process.env.FRONTEND_ORIGIN || "http://localhost:9010,http://127.0.0.1:9010,http://localhost:4200,http://127.0.0.1:4200").split(",").map(origin => origin.trim()),
    methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json({ limit: "1mb" }));
app.use('/api', rateLimit({ limit: 600, windowMs: 60000 }));
app.use('/api/auth/register', rateLimit({ limit: 10, windowMs: 15 * 60000 }));
app.use('/api/auth/login', rateLimit({ limit: 30, windowMs: 15 * 60000 }));
// Reject decoded slashes/control characters before they reach Firestore document paths.
app.use('/api', (req, res, next) => {
    try {
        if (req.path.split('/').some(part => /[\/\\\x00-\x1f]/.test(decodeURIComponent(part)))) {
            return res.status(400).json({ success: false, message: 'Invalid resource identifier.' });
        }
    } catch { return res.status(400).json({ success: false, message: 'Malformed URL.' }); }
    next();
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payments", require("./routes/proofRoutes"));
app.use("/api/tracking", trackingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/account", require("./routes/accountRoutes"));
app.use("/api/account", require("./routes/accountSettingsRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));


app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "IOTEL Backend is running!"
    });
});

// Read-only diagnostics: checking connectivity must not create database records.
app.get("/api/health", (req, res) => res.json({ success: true, service: "iotel-backend" }));
app.get("/test-firebase", async (req, res) => {
    let timer;
    try {
        await Promise.race([
            db.collection("products").limit(1).get(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("CONNECTION_TIMEOUT")), 10000); })
        ]);
        res.json({ success: true, message: "Firebase connection successful." });
    } catch (error) {
        console.error("Firebase connection check failed:", error.code || error.message);
        res.status(503).json({ success: false, message: "Firebase is unavailable. Check server credentials and network access." });
    } finally {
        clearTimeout(timer);
    }
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: "API route not found." });
});

app.use((error, req, res, next) => {
    console.error("Unexpected server error:", error.message);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ success: false, message: status === 413 ? 'The uploaded file is too large (maximum 3 MB).' : status === 400 ? 'Invalid JSON request.' : "An unexpected server error occurred." });
});

app.listen(PORT, (error) => {
    if (error) {
        console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the older backend before starting this one.` : 'Backend could not start: ' + error.message);
        process.exitCode = 1;
        return;
    }
    console.log(`IOTEL Backend running at http://localhost:${PORT}`);
});
