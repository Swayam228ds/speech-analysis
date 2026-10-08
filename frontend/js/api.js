// Backend client. Every request automatically carries `Authorization: Bearer <token>`
// (the fetch equivalent of the Axios interceptor suggested in the guide).
(function () {
  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  const url = (path) => App.config.apiBase + path;

  function authHeaders() {
    const token = App.auth && App.auth.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function unreachable() {
    return new ApiError(0, `Can't reach the server at ${App.config.apiBase}. Check that the backend is running and allows CORS from this page.`);
  }

  // FastAPI errors look like {detail: "msg"} or {detail: [{msg, loc}, ...]}
  async function errorMessage(res) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const detail = body && (body.detail ?? body.message ?? body.error);
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : '';
        return field ? `${field}: ${d.msg}` : d.msg;
      }).join('; ');
    }
    return `Request failed (${res.status} ${res.statusText || ''})`.trim();
  }

  function handleUnauthorized(res) {
    if (res.status === 401 && App.auth && App.auth.token) App.auth.onUnauthorized();
  }

  async function request(method, path, { json, form, signal } = {}) {
    if (App.config.demo) return App.mock.request(method, path, { json, form });

    const headers = { Accept: 'application/json', ...authHeaders() };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }

    let res;
    try {
      res = await fetch(url(path), { method, headers, body, signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw unreachable();
    }
    if (!res.ok) {
      handleUnauthorized(res);
      throw new ApiError(res.status, await errorMessage(res));
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  // multipart upload via XHR so we get upload progress events.
  // Returns { promise, abort }.
  function uploadVideo(file, onProgress) {
    if (App.config.demo) return App.mock.upload(file, onProgress);

    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      xhr.open('POST', url('/videos/upload'));
      const auth = authHeaders();
      if (auth.Authorization) xhr.setRequestHeader('Authorization', auth.Authorization);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = async () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        const fake = new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText });
        handleUnauthorized(fake);
        reject(new ApiError(xhr.status, await errorMessage(fake)));
      };
      xhr.onerror = () => reject(unreachable());
      xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
      const data = new FormData();
      data.append('file', file, file.name);
      xhr.send(data);
    });
    return { promise, abort: () => xhr.abort() };
  }

  // <video> can't send an Authorization header, so download the file with the
  // token and play it from an object URL. Resolves to { url, revoke } or null.
  async function videoSource(id, { signal, onProgress } = {}) {
    if (App.config.demo) return App.mock.videoSource(id);

    let res;
    try {
      res = await fetch(url(`/videos/${encodeURIComponent(id)}/file`), { headers: authHeaders(), signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw unreachable();
    }
    if (!res.ok) {
      handleUnauthorized(res);
      throw new ApiError(res.status, await errorMessage(res));
    }

    const total = Number(res.headers.get('Content-Length')) || 0;
    let blob;
    if (res.body && total && onProgress) {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress(received / total);
      }
      blob = new Blob(chunks, { type: res.headers.get('Content-Type') || 'video/mp4' });
    } else {
      blob = await res.blob();
    }
    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  }

  const enc = encodeURIComponent;

  App.ApiError = ApiError;
  App.api = {
    login: (username, password) => request('POST', '/login', { form: { username, password } }),
    register: (username, email, password) => request('POST', '/register', { json: { username, email, password } }),
    me: (opts) => request('GET', '/me', opts),
    listVideos: (opts) => request('GET', '/videos', opts),
    getVideo: (id, opts) => request('GET', `/videos/${enc(id)}`, opts),
    deleteVideo: (id) => request('DELETE', `/videos/${enc(id)}`),
    getEvents: (id, opts) => request('GET', `/videos/${enc(id)}/events`, opts),
    getAnalysis: (id, opts) => request('GET', `/videos/${enc(id)}/analysis`, opts),
    uploadVideo,
    videoSource,
  };
})();
