import { apiRequest, saveToken, clearToken } from './api.js';
import { auth, authReady } from './firebase.js';
import { isGmailAddress } from './email.js';
import { signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

function firebaseLoginErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-not-found': 'No Firebase Authentication account was found for this email.',
    'auth/wrong-password': 'The password does not match this Firebase Authentication account.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your internet connection and try again.'
  };

  return messages[error.code] || 'Unable to sign in. Please try again.';
}

function showLoginModal({ type, message, actionLabel, onAction }) {
  const existingModal = document.getElementById('loginFeedbackModal');
  if (existingModal) existingModal.remove();

  const isSuccess = type === 'success';
  const modal = document.createElement('div');
  modal.id = 'loginFeedbackModal';
  modal.className = `login-feedback-modal ${isSuccess ? 'is-success' : 'is-error'}`;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'loginFeedbackTitle');
  modal.setAttribute('aria-describedby', 'loginFeedbackMessage');
  modal.innerHTML = `
    <div class="login-feedback-card" tabindex="-1">
      <div class="login-feedback-icon" aria-hidden="true">${isSuccess ? '&#10003;' : '&#10005;'}</div>
      <h2 id="loginFeedbackTitle">${isSuccess ? 'Login Successful!' : 'Login Failed'}</h2>
      <p id="loginFeedbackMessage"></p>
      <button type="button" class="login-feedback-action">${actionLabel}</button>
    </div>
  `;

  modal.querySelector('#loginFeedbackMessage').textContent = message;
  document.body.appendChild(modal);
  const actionButton = modal.querySelector('.login-feedback-action');
  const card = modal.querySelector('.login-feedback-card');
  const closeModal = () => modal.remove();

  actionButton.addEventListener('click', () => {
    closeModal();
    onAction();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal && !isSuccess) closeModal();
  });
  card.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorElement = document.getElementById('loginError');

  if (!form || !errorElement) return;
  document.getElementById('resetPassword').addEventListener('click', async event => {
    const email = document.getElementById('email').value.trim().toLowerCase();
    if (!isGmailAddress(email)) { errorElement.textContent = 'Enter your @gmail.com address above first.'; return; }
    const button = event.currentTarget; button.disabled = true;
    try {
      await authReady;
      await sendPasswordResetEmail(auth, email);
      errorElement.textContent = 'If this address has an account, a password reset email has been requested. Check your Gmail inbox and spam folder.';
    } catch (error) {
      errorElement.textContent = error.code === 'auth/user-not-found'
        ? 'If this address has an account, a password reset email has been requested. Check your Gmail inbox and spam folder.'
        : firebaseLoginErrorMessage(error);
    } finally { button.disabled = false; }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorElement.textContent = '';

    console.log('LOGIN SUBMITTED');

    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const submitButton = form.querySelector('button[type="submit"]');



    if (!isGmailAddress(email) || !password) {
      errorElement.textContent = 'Enter your @gmail.com address and password.';
      return;
    }

    if (submitButton) submitButton.disabled = true;

    try {
      await authReady;
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) {
        await signOut(auth);
        errorElement.textContent = 'Verify your Gmail address before signing in. Check your inbox or use Resend verification email below.';
        return;
      }
      saveToken(await credential.user.getIdToken(true));
      // The backend verifies the token and supplies the trusted role and profile.
      const result = await apiRequest('/auth/me');

      const profile = result.user;
      const role = String(profile.role || '').trim().toLowerCase() || 'customer';
      const name = profile.name || email;

      console.log('Role detected:', role);

      localStorage.setItem('IOTEL_CURRENT_USER', JSON.stringify({
        id: profile.uid,
        fullName: name,
        email: profile.email,
        mobileNumber: profile.mobileNumber || '',
        role
      }));
      localStorage.setItem('IOTEL_USER_NAME', name);
      localStorage.setItem('IOTEL_USER_ROLE', role);

      const destination = role === 'admin'
        ? '/admin/dashboard.html'
        : role === 'staff' ? '/staff/dashboard.html' : '/catalog.html';
      console.log('Redirect destination:', destination);
      showLoginModal({
        type: 'success',
        message: 'Welcome back to IOTEL.',
        actionLabel: 'Continue',
        onAction: () => { location.href = destination; }
      });
    } catch (error) {
      console.error('Backend login failed:', error);
      errorElement.textContent = '';
      await clearToken().catch(() => {});
      const userMessage = error.code?.startsWith('auth/') ? firebaseLoginErrorMessage(error) : error.message;

      showLoginModal({
        type: 'error',
        message: userMessage,
        actionLabel: 'Retry',
        onAction: () => { if (submitButton) submitButton.disabled = false; }
      });
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // Explicit resend avoids sending an email on every failed login attempt.
  document.getElementById('resendVerification').addEventListener('click', async (event) => {
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    if (!isGmailAddress(email) || !password) {
      errorElement.textContent = 'Enter your @gmail.com address and password above, then resend.';
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await authReady;
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      if (user.emailVerified) {
        errorElement.textContent = 'Your email is already verified. You can sign in.';
      } else {
        await sendEmailVerification(user);
        errorElement.textContent = 'Verification email sent. Check your Gmail inbox and spam folder, then sign in after opening the link.';
      }
    } catch (error) {
      errorElement.textContent = firebaseLoginErrorMessage(error);
    } finally {
      await signOut(auth).catch(() => {});
      button.disabled = false;
    }
  });
});
