const {setGlobalOptions} = require("firebase-functions");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");

initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

const allowedRoles = new Set(["staff", "admin"]);
const acceptedFields = new Set(["fullName", "email", "role"]);
const emailPattern = /^[a-z0-9]+(?:[a-z0-9.]*[a-z0-9])?(?:\+[a-z0-9._-]+)?@gmail\.com$/;

exports.provisionStaffAdmin = onCall(async (request) => {
	if (!request.auth) {
		throw new HttpsError("unauthenticated", "Authentication is required.");
	}

	const callerProfile = await getFirestore()
			.collection("users")
			.doc(request.auth.uid)
			.get();

 if (!callerProfile.exists || callerProfile.data().role !== "admin" || callerProfile.data().status !== 'active' || request.auth.token.email_verified !== true) {
		throw new HttpsError("permission-denied", "Admin access is required.");
	}

	const data = request.data;
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new HttpsError("invalid-argument", "Provisioning data is required.");
	}

	const inputFields = Object.keys(data);
	if (inputFields.some((field) => !acceptedFields.has(field))) {
		throw new HttpsError("invalid-argument", "Unsupported provisioning field.");
	}

	const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
	const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
 const role = typeof data.role === 'string' ? data.role.toLowerCase() : '';

 if (fullName.length < 2 || fullName.length > 100 || !emailPattern.test(email) || email.includes('..') || !allowedRoles.has(role)) {
		throw new HttpsError("invalid-argument", "Invalid provisioning data.");
	}

	let createdUser;
	try {
		createdUser = await getAuth().createUser({
			email,
			displayName: fullName,
		});
	} catch (error) {
		if (error?.code === "auth/email-already-exists") {
			throw new HttpsError("already-exists", "That email address is already in use.");
		}

		if (error?.code === "auth/invalid-email") {
			throw new HttpsError("invalid-argument", "Invalid email address.");
		}

		throw new HttpsError("internal", "Unable to create the account.");
	}

	try {
		await getFirestore().collection("users").doc(createdUser.uid).create({
			uid: createdUser.uid,
			fullName,
			name: fullName,
			status: 'active',
			email,
			role,
			createdAt: FieldValue.serverTimestamp(),
		});
	} catch (error) {
		try {
			await getAuth().deleteUser(createdUser.uid);
		} catch (rollbackError) {
			console.error("Provisioned user rollback failed.");
		}

		throw new HttpsError("internal", "Unable to create the account profile.");
	}

	return {
		uid: createdUser.uid,
		role,
	};
});
