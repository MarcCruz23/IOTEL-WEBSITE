const { getAuth } = require("firebase-admin/auth");
const { FieldValue } = require("firebase-admin/firestore");
const db = require("../config/firebase");

const { isGmailAddress: isValidEmail } = require("../utils/email");

function isStrongPassword(password) {
    // 8-12 characters, with lowercase, uppercase, number, and special character.
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])\S{8,12}$/.test(password);
}

function getRegistrationError(error) {
    switch (error.code) {
        case "auth/email-already-exists":
            return { status: 409, message: "An account with this email already exists." };
        case "auth/invalid-email":
            return { status: 400, message: "Use a valid @gmail.com address. Other email providers are not supported." };
        case "auth/invalid-password":
            return { status: 400, message: "Please provide a stronger password." };
        default:
            return { status: 500, message: "Unable to create the account right now." };
    }
}

function getLoginError(errorCode) {
    switch (errorCode) {
        case "EMAIL_NOT_FOUND":
        case "INVALID_PASSWORD":
        case "INVALID_LOGIN_CREDENTIALS":
            return { status: 401, message: "Invalid email or password." };
        case "USER_DISABLED":
            return { status: 403, message: "This account has been disabled." };
        case "TOO_MANY_ATTEMPTS_TRY_LATER":
            return { status: 429, message: "Too many login attempts. Please try again later." };
        default:
            return { status: 500, message: "Unable to log in right now." };
    }
}

async function register(req, res) {
    const { name, email, password, mobileNumber, username } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanMobileNumber = typeof mobileNumber === "string" ? mobileNumber.trim() : "";
    const cleanUsername = typeof username === "string" ? username.trim() : "";

    if (cleanName.length < 2 || cleanName.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Name must be between 2 and 100 characters."
        });
    }

    if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({
            success: false,
            message: "Use a valid @gmail.com address. Other email providers are not supported."
        });
    }

    if (cleanMobileNumber && !/^\d{7,20}$/.test(cleanMobileNumber)) {
        return res.status(400).json({
            success: false,
            message: "Mobile number must contain 7 to 20 digits."
        });
    }

    if (cleanUsername && !/^[a-zA-Z0-9_]{3,32}$/.test(cleanUsername)) {
        return res.status(400).json({
            success: false,
            message: "Username must be 3 to 32 letters, numbers, or underscores."
        });
    }

    if (typeof password !== "string" || !isStrongPassword(password)) {
        return res.status(400).json({
            success: false,
            message: "Password must be 8 to 12 characters and include an uppercase letter, lowercase letter, number, and special character."
        });
    }

    let createdUser;

    try {
        // Firebase Authentication securely stores the password. Firestore never receives it.
        createdUser = await getAuth().createUser({
            displayName: cleanName,
            email: cleanEmail,
            password,
            emailVerified: false
        });

        await db.collection("users").doc(createdUser.uid).set({
            uid: createdUser.uid,
            name: cleanName,
            email: cleanEmail,
            mobileNumber: cleanMobileNumber || null,
            username: cleanUsername || null,
            role: "customer",
            status: "active",
            emailVerified: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            user: {
                uid: createdUser.uid,
                name: cleanName,
                email: cleanEmail,
                role: "customer",
                emailVerified: false
            }
        });
    } catch (error) {
        // If Firestore fails after Authentication succeeds, remove the partial account.
        if (createdUser) {
            try {
                await getAuth().deleteUser(createdUser.uid);
            } catch (cleanupError) {
                console.error("Could not clean up incomplete user registration:", cleanupError.code);
            }
        }

        const registrationError = getRegistrationError(error);
        console.error("Registration failed:", error.code);

        return res.status(registrationError.status).json({
            success: false,
            message: registrationError.message
        });
    }
}

async function login(req, res) {
    const { email, password } = req.body || {};
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!isValidEmail(cleanEmail) || typeof password !== "string" || password.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Please provide your email address and password."
        });
    }

    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
        console.error("Login configuration error: FIREBASE_WEB_API_KEY is missing.");
        return res.status(500).json({
            success: false,
            message: "Login is not configured yet. Please contact the administrator."
        });
    }

    try {
        // Firebase Authentication checks the password. The backend never reads it from Firestore.
        const firebaseResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                signal: AbortSignal.timeout(15000),
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: cleanEmail,
                    password,
                    returnSecureToken: true
                })
            }
        );

        const firebaseData = await firebaseResponse.json();
        if (!firebaseResponse.ok) {
            const loginError = getLoginError(firebaseData.error?.message);
            return res.status(loginError.status).json({
                success: false,
                message: loginError.message
            });
        }

        const userSnapshot = await db.collection("users").doc(firebaseData.localId).get();
        if (!userSnapshot.exists) {
            return res.status(403).json({
                success: false,
                message: "Your account profile is unavailable."
            });
        }

        const profile = userSnapshot.data();
        if (profile.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is not active."
            });
        }

        const authUser = await getAuth().getUser(firebaseData.localId);
        const emailVerified = authUser.emailVerified === true;

        if (!emailVerified) {
            return res.status(403).json({ success: false, code: "EMAIL_NOT_VERIFIED",
                message: "Verify your Gmail address before signing in. You can resend the email from the login page." });
        }

        // Keep the Firestore profile in sync after the user verifies their email.
        if (profile.emailVerified !== emailVerified) {
            await userSnapshot.ref.update({
                emailVerified,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        return res.json({
            success: true,
            message: "Login successful.",
            token: firebaseData.idToken,
            expiresIn: Number(firebaseData.expiresIn),
            user: {
                uid: firebaseData.localId,
                name: profile.name,
                email: profile.email,
                role: profile.role,
                emailVerified
            }
        });
    } catch (error) {
        console.error("Login failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to log in right now."
        });
    }
}

function getCurrentUser(req, res) {
    return res.json({
        success: true,
        user: req.user
    });
}

module.exports = { register, login, getCurrentUser };
