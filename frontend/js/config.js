// Global namespace + runtime configuration.
window.App = { views: {} };

(function () {
  // localStorage can throw (private mode, blocked storage) — never let that break the app.
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch { /* ignore */ }
    },
  };
  App.storage = storage;

  App.config = {
    // FastAPI serves this frontend, so the API lives on the same origin.
    // Opened straight from disk, fall back to uvicorn's default address.
    DEFAULT_API_BASE: location.protocol.startsWith('http') ? location.origin : 'http://localhost:8000',
    MAX_UPLOAD_BYTES: 100 * 1024 * 1024,
    POLL_INTERVAL_MS: 2500,
    DASHBOARD_REFRESH_MS: 5000,
    // Must match allowed_types in app/routers/videos.py
    VIDEO_EXTENSIONS: ['mp4', 'webm', 'mov'],
    VIDEO_MIME_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],

    // Backend URL, editable from the sign-in screen.
    get apiBase() {
      return (storage.get('apiBase') || this.DEFAULT_API_BASE).trim().replace(/\/+$/, '');
    },
    set apiBase(value) {
      storage.set('apiBase', value ? value.trim() : null);
    },

    // Demo mode serves simulated data from js/mock.js instead of calling the backend.
    get demo() {
      return storage.get('demoMode') === '1';
    },
    set demo(on) {
      storage.set('demoMode', on ? '1' : null);
    },
  };
})();
