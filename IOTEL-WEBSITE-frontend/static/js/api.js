// Configure a deployed backend with window.IOTEL_API_BASE_URL before loading this module.
const API_BASE_URL = (window.IOTEL_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const TOKEN_KEY = 'IOTEL_AUTH_TOKEN';

export function saveToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  ['IOTEL_CURRENT_USER', 'IOTEL_USER_NAME', 'IOTEL_USER_ROLE'].forEach(key => localStorage.removeItem(key));
  const { auth, authReady } = await import('./firebase.js');
  await authReady;
  await auth.signOut();
}

export async function apiRequest(path, options = {}) {
  const { authenticated = true, responseType = 'json', ...requestOptions } = options;
  const headers = { ...(requestOptions.headers || {}) };
  // Firebase refreshes expired tokens; never keep sending the original login token.
  if (authenticated && sessionStorage.getItem(TOKEN_KEY)) {
    const { auth, authReady } = await import('./firebase.js');
    await authReady;
    await auth.authStateReady();
    if (!auth.currentUser) {
      await clearToken();
      throw new Error('Your session has expired. Please sign in again.');
    }
    const token = await auth.currentUser.getIdToken();
    saveToken(token);
    headers.Authorization = `Bearer ${token}`;
  }
  if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  let data;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...requestOptions, headers, signal: controller.signal });
    data = response.ok && responseType === 'blob' ? await response.blob() : await response.json().catch(() => ({}));
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'The server took too long to respond. Please try again.'
      : 'The server could not be reached. Check that the backend is running.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error(data.message || 'The server could not complete this request.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}
