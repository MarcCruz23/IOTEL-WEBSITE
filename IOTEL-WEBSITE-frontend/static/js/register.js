import {
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth, authReady } from './firebase.js';
import { apiRequest } from './api.js';
import { isGmailAddress } from './email.js';


function firebaseErrorMessage(error) {

  const messages = {
    'auth/email-already-in-use':
      'That email address is already registered.',

    'auth/invalid-email':
      'Enter a valid email address.',

    'auth/password-does-not-meet-requirements':
      'Password must meet the Firebase password requirements.',

    'auth/weak-password':
      'Password must be at least 6 characters.',

    'auth/operation-not-allowed':
      'Email and password registration is not enabled in Firebase.',

    'permission-denied':
      'Registration succeeded, but the user profile could not be saved in Firestore.'
  };

  return messages[error.code]
    || 'We could not create your account. Please try again.';
}

function showInvalidMobileModal(mobileInput) {
  const existingModal = document.getElementById('invalidMobileModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'invalidMobileModal';
  modal.className = 'login-feedback-modal is-error';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'invalidMobileTitle');
  modal.setAttribute('aria-describedby', 'invalidMobileMessage');
  modal.innerHTML = `
    <div class="login-feedback-card" tabindex="-1">
      <div class="login-feedback-icon" aria-hidden="true">&#10005;</div>
      <h2 id="invalidMobileTitle">Invalid Mobile Number</h2>
      <p id="invalidMobileMessage">Your mobile number is invalid. Please enter 7 to 20 digits (0-9) and try again.</p>
      <button type="button" class="login-feedback-action">Try Again</button>
    </div>
  `;

  document.body.appendChild(modal);
  const actionButton = modal.querySelector('.login-feedback-action');
  const card = modal.querySelector('.login-feedback-card');
  const closeModal = () => {
    modal.remove();
    mobileInput.focus();
  };

  actionButton.addEventListener('click', closeModal);
  card.focus();
}

function showRegistrationValidationModal({ title, message, buttonLabel, target }) {
  const existingModal = document.getElementById('registrationValidationModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'registrationValidationModal';
  modal.className = 'login-feedback-modal is-error';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'registrationValidationTitle');
  modal.setAttribute('aria-describedby', 'registrationValidationMessage');
  modal.innerHTML = `
    <div class="login-feedback-card" tabindex="-1">
      <div class="login-feedback-icon" aria-hidden="true">&#10005;</div>
      <h2 id="registrationValidationTitle">${title}</h2>
      <p id="registrationValidationMessage">${message}</p>
      <button type="button" class="login-feedback-action">${buttonLabel}</button>
    </div>
  `;

  document.body.appendChild(modal);
  const card = modal.querySelector('.login-feedback-card');
  const closeModal = () => {
    modal.remove();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus();
  };

  modal.querySelector('.login-feedback-action').addEventListener('click', closeModal);
  card.focus();
}

function showAccountConfirmationModal(onContinue) {
  const existingModal = document.getElementById('accountConfirmationModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'accountConfirmationModal';
  modal.className = 'login-feedback-modal is-confirmation';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'accountConfirmationTitle');
  modal.setAttribute('aria-describedby', 'accountConfirmationMessage');
  modal.innerHTML = `
    <div class="login-feedback-card account-confirmation-card" tabindex="-1">
      <div class="login-feedback-icon account-confirmation-icon" aria-hidden="true">&#10003;</div>
      <h2 id="accountConfirmationTitle">Confirm Account Creation</h2>
      <div id="accountConfirmationMessage" class="account-confirmation-message">
        <p>Your IOTEL account will be securely created and recorded using Firebase.</p>
        <p>By continuing, you agree to the creation of your IOTEL account and acknowledge that the information you provide will be used to create and maintain your account.</p>
        <p>IOTEL uses Firebase Authentication to securely manage your sign-in credentials and Firebase Firestore to store your IOTEL account profile information.</p>
        <p>Please confirm that you agree to continue with the creation of your IOTEL account.</p>
      </div>
      <div class="account-confirmation-actions">
        <button type="button" class="login-feedback-action account-confirmation-cancel">Cancel</button>
        <button type="button" class="login-feedback-action account-confirmation-continue">Continue</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const card = modal.querySelector('.login-feedback-card');
  const closeModal = () => modal.remove();

  modal.querySelector('.account-confirmation-cancel').addEventListener('click', closeModal);
  modal.querySelector('.account-confirmation-continue').addEventListener('click', () => {
    closeModal();
    onContinue();
  });
  card.focus();
}


document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('registerForm');
  const message = document.getElementById('registerMessage');
  const successModal = document.getElementById('registrationSuccessModal');
  const continueToLogin = document.getElementById('continueToLogin');

  if (!form || !message) {
    console.error('Registration form or message element not found.');
    return;
  }

  const redirectToLogin = () => { location.href = '/login.html'; };

  if (continueToLogin) {
    continueToLogin.addEventListener('click', redirectToLogin);
  }

  console.log('register.js loaded successfully');


  form.addEventListener('submit', async (event) => {

    event.preventDefault();

    const fullName =
      document.getElementById('regName').value.trim();

    const email =
      document.getElementById('regEmail').value.trim().toLowerCase();

    const username =
      document.getElementById('regUsername').value.trim();

    const password =
      document.getElementById('regPassword').value;

    const confirmPassword =
      document.getElementById('regConfirmPassword').value;

    const privacyAgreement =
      document.getElementById('privacyAgreement').checked;

    const termsAgreement =
      document.getElementById('termsAgreement').checked;

    const mobileInput = document.getElementById('regMobile');
    const mobileNumber = mobileInput.value.trim();
    const mobileIsValid = /^[0-9]{7,20}$/.test(mobileNumber);

    console.log('REGISTER FORM SUBMITTED');

    message.textContent = '';
    message.className = 'register-message';

    let error = '';


    if (fullName.length < 2 || fullName.length > 100) {
      showRegistrationValidationModal({
        title: 'Full Name Required',
        message: 'Please enter your full name using 2 to 100 characters.',
        buttonLabel: 'Try Again',
        target: document.getElementById('regName')
      });
      return;
    }

    else if (
      !isGmailAddress(email)
    ) {
      showRegistrationValidationModal({
        title: 'Invalid Email Address',
        message: 'Use your @gmail.com address. Other email providers and misspelled domains are not accepted.',
        buttonLabel: 'Try Again',
        target: document.getElementById('regEmail')
      });
      return;
    }

    else if (!mobileIsValid) {
      showInvalidMobileModal(mobileInput);
      return;
    }

    else if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      error = 'Username must be 3 to 32 letters, numbers, or underscores.';
    }

    else if (!password) {
      error = 'Password is required.';
    }

    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])\S{8,12}$/.test(password)) {
      showRegistrationValidationModal({
        title: 'Password Requirements',
        message: 'Use 8 to 12 characters with an uppercase letter, lowercase letter, number, and special character.',
        buttonLabel: 'Try Again',
        target: document.getElementById('regPassword')
      });
      return;
    }

    else if (password !== confirmPassword) {
      error = 'Passwords do not match.';
    }

    else if (!privacyAgreement && !termsAgreement) {
      showRegistrationValidationModal({
        title: 'Agreements Required',
        message: 'Please agree to the Privacy & Security Agreement and Terms & Conditions before creating your IOTEL account.',
        buttonLabel: 'Review Agreements',
        target: document.getElementById('privacyAgreement')
      });
      return;
    }

    else if (!privacyAgreement) {
      showRegistrationValidationModal({
        title: 'Privacy & Security Agreement Required',
        message: 'Please review and agree to the IOTEL Privacy & Security Agreement before creating your account.',
        buttonLabel: 'Review Agreement',
        target: document.getElementById('privacyAgreement')
      });
      return;
    }

    else if (!termsAgreement) {
      showRegistrationValidationModal({
        title: 'Terms & Conditions Required',
        message: 'Please review and agree to the IOTEL Terms & Conditions before creating your account.',
        buttonLabel: 'Review Terms',
        target: document.getElementById('termsAgreement')
      });
      return;
    }

    if (error) {

      message.textContent = error;
      message.classList.add('is-error');

      console.error('Registration validation error:', error);

      return;
    }


    const createAccount = async () => {
      const submitButton = form.querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
      }

      let accountCreated = false;
      try {
        // The backend creates both Firebase Authentication and Firestore records.
        await apiRequest('/auth/register', {
          method: 'POST',
          authenticated: false,
          body: JSON.stringify({ name: fullName, email, password, mobileNumber, username })
        });

        accountCreated = true;

        // Firebase client SDK sends its standard verification email; passwords are still stored only by Firebase Authentication.
        await authReady;
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user);
        await signOut(auth);

        if (successModal) {
          successModal.hidden = false;
          requestAnimationFrame(() => successModal.classList.add('is-visible'));
          document.getElementById('registrationSuccessDescription').textContent = `A verification email was sent to ${email}. Open the link in your inbox or spam folder before signing in.`;
          continueToLogin?.focus();
        }
      } catch (error) {
        console.error('Registration error:', error);
        message.textContent = accountCreated
          ? 'Your account was created, but the verification email could not be sent. Go to Sign In and use Resend verification email. Do not register again.'
          : (error.code ? firebaseErrorMessage(error) : error.message);
        message.classList.add('is-error');

        if (submitButton) {
          submitButton.disabled = accountCreated;
        }
      } finally {
        await signOut(auth).catch(() => {});
      }
    };

    showAccountConfirmationModal(createAccount);

  });

});
