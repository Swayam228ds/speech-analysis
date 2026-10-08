// App shell + hash router + boot.
(function () {
  const { h, icon, toast, spinner } = App.util;

  const routes = [
    { re: /^\/login$/, view: 'login', public: true },
    { re: /^\/register$/, view: 'register', public: true },
    { re: /^\/$/, view: 'dashboard' },
    { re: /^\/upload$/, view: 'upload' },
    { re: /^\/videos\/([^/]+)$/, view: 'details', keys: ['id'] },
  ];

  let cleanup = null;

  function shell(path) {
    const user = App.auth.user || {};
    const name = user.username || user.email || 'Account';
    const navLink = (href, label, active) => h('a', { href, class: `nav-link${active ? ' active' : ''}` }, label);
    const main = h('main', { class: 'main' });

    const el = h('div', { class: 'shell' },
      App.config.demo ? h('div', { class: 'demo-banner' },
        h('span', null, h('strong', null, 'Demo mode'), ' — videos and analyses are simulated in your browser.'),
        h('button', { class: 'link-btn', onclick: () => App.auth.logout() }, 'Exit demo')) : null,
      h('header', { class: 'topbar' },
        h('a', { href: '#/', class: 'brand' }, h('span', { class: 'brand-mark' }, icon('mic', 18)), 'Speech Coach'),
        h('nav', { class: 'nav' },
          navLink('#/', 'Dashboard', path === '/' || path.startsWith('/videos')),
          navLink('#/upload', 'Upload', path === '/upload')),
        h('div', { class: 'user' },
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, name.charAt(0).toUpperCase()),
          h('span', { class: 'user-name' }, name),
          h('button', { class: 'icon-btn', title: 'Sign out', 'aria-label': 'Sign out', onclick: () => App.auth.logout() }, icon('logout', 17)))),
      main);
    return { el, main };
  }

  function render() {
    if (cleanup) {
      try { cleanup(); } catch { /* ignore */ }
      cleanup = null;
    }
    const path = location.hash.replace(/^#/, '') || '/';
    let route = null;
    let match = null;
    for (const r of routes) {
      match = path.match(r.re);
      if (match) { route = r; break; }
    }
    if (!route) return location.replace('#/');

    const signedIn = !!App.auth.user;
    if (!route.public && !signedIn) {
      App.auth.redirectAfter = path;
      return location.replace('#/login');
    }
    if (route.public && signedIn) return location.replace('#/');

    const params = {};
    (route.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });

    const app = document.getElementById('app');
    app.replaceChildren();
    let mount = app;
    if (!route.public) {
      const s = shell(path);
      app.append(s.el);
      mount = s.main;
    }
    cleanup = App.views[route.view](mount, params) || null;
    window.scrollTo(0, 0);
  }

  async function boot() {
    const app = document.getElementById('app');
    app.replaceChildren(h('div', { class: 'center-pad boot' }, spinner()));
    if (App.auth.token) {
      try {
        await App.auth.loadMe(); // verify the stored token
      } catch (err) {
        if (err.status === 401 || err.status === 403) App.auth.clear();
        else toast(err.message, 'error', 7000);
      }
    }
    window.addEventListener('hashchange', render);
    render();
  }

  boot();
})();
