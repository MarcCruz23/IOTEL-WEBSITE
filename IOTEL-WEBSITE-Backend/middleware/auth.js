const { getAuth } = require("firebase-admin/auth");
const { isGmailAddress } = require("../utils/email");
const db = require("../config/firebase");

async function authenticate(req, res, next) {
    const authorizationHeader = req.headers.authorization || "";

    if (!authorizationHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required. Send a Firebase ID token as a Bearer token."
        });
    }

    const idToken = authorizationHeader.slice("Bearer ".length);

    try {
        // Firebase Admin verifies that the token is real, current, and not revoked.
        const decodedToken = await getAuth().verifyIdToken(idToken, true);
        if (!isGmailAddress(decodedToken.email)) {
            return res.status(403).json({ success: false, code: "GMAIL_REQUIRED", message: "Use a @gmail.com account." });
        }
        if (decodedToken.email_verified !== true) {
            return res.status(403).json({ success: false, code: "EMAIL_NOT_VERIFIED", message: "Verify your Gmail address before continuing." });
        }
        const userSnapshot = await db.collection("users").doc(decodedToken.uid).get();

        if (!userSnapshot.exists) {
            return res.status(403).json({
                success: false,
                message: "Your account profile is unavailable."
            });
        }

        const profile = userSnapshot.data();
        if (!['customer', 'staff', 'admin'].includes(profile.role)) {
            return res.status(403).json({ success: false, message: 'Your account role is not authorized.' });
        }
        if (profile.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is not active."
            });
        }

        // Later route handlers use req.user instead of trusting a role from the browser.
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified === true,
            name: profile.name,
            mobileNumber: profile.mobileNumber || "",
            role: profile.role,
            status: profile.status,
            shareBookingContact: profile.preferences?.shareBookingContact !== false
        };

        return next();
    } catch (error) {
        console.error("Authentication failed:", error.code);

        return res.status(401).json({
            success: false,
            message: "Your session is invalid or has expired. Please log in again."
        });
    }
}

module.exports = { authenticate };
