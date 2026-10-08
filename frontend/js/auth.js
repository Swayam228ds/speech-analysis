// Session state: JWT in localStorage + the current user from GET /me.
(function () {
  const TOKEN_KEY = 'accessToken';

  App.auth = {
    user: null,
    redirectAfter: null,

    get token() {
      return App.storage.get(TOKEN_KEY);
    },

    async login(username, password) {
      const res = await App.api.login(username, password);
      const token = res && (res.access_token || res.token);
      if (!token) throw new Error('The server did not return an access token.');
      App.storage.set(TOKEN_KEY, token);
      await this.loadMe();
      return this.user;
    },

    async loadMe() {
      this.user = await App.api.me();
      return this.user;
    },

    clear() {
      App.storage.set(TOKEN_KEY, null);
      this.user = null;
    },

    logout() {
      this.clear();
      if (App.config.demo) {
        App.config.demo = false;
        App.mock.reset();
      }
      location.hash = '#/login';
    },

    // Called by the API client on any 401 while signed in.
    onUnauthorized() {
      if (!this.user && !this.token) return;
      this.clear();
      App.util.toast('Your session has expired. Please sign in again.', 'error');
      const path = location.hash.slice(1);
      if (path && path !== '/login') this.redirectAfter = path;
      location.hash = '#/login';
    },
  };
})();
