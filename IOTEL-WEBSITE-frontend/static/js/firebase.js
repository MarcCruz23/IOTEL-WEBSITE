import './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { initializeAuth, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const firebaseConfig = window.IOTEL_FIREBASE_CONFIG || {};
const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

if (!requiredConfigKeys.every((key) => Boolean(firebaseConfig[key]))) {
  throw new Error('Firebase is not configured. Check firebase-config.js.');
}

const firebaseApp = initializeApp(firebaseConfig);

// Select persistence during initialization so page navigation restores the same session.
export const auth = initializeAuth(firebaseApp, { persistence: browserSessionPersistence });
export const authReady = auth.authStateReady();
export const db = getFirestore(firebaseApp);
