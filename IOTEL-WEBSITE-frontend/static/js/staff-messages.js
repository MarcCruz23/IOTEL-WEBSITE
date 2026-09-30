// Keep this page's existing markup and use the shared authenticated messaging client.
document.addEventListener('DOMContentLoaded', async () => {
  try { const { startMessages } = await import('./message-client.js'); await startMessages(); }
  catch (error) { window.IOTEL_UI.toast(error.message, 'error'); }
});
