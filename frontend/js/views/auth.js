// Sign in / create account.
(function () {
  const { h, icon, toast, spinner } = App.util;

  function field(label, attrs) {
    const id = `f-${attrs.name}`;
    return h('div', { class: 'field' },
      h('label', { for: id }, label),
      h('input', { id, class: 'input', required: true, ...attrs }));
  }

  function serverSettings() {
    const input = h('input', { class: 'input', type: 'url', value: App.config.apiBase, placeholder: App.config.DEFAULT_API_BASE, 'aria-label': 'Backend URL' });
    const current = h('code', null, App.config.apiBase);
    const save = () => {
      App.config.apiBase = input.value || null;
      current.textContent = App.config.apiBase;
      input.value = App.config.apiBase;
      toast(`Backend set to ${App.config.apiBase}`);
      details.open = false;
    };
    const details = h('details', { class: 'server-settings' },
      h('summary', null, icon('server', 14), 'Backend: ', current),
      h('div', { class: 'server-row' },
        input,
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: save }, 'Save')));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    return details;
  }

  function authView(root, mode) {
    const isLogin = mode === 'login';
    const error = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, isLogin ? 'Sign in' : 'Create account');

    const fields = isLogin
      ? [
        field('Username', { name: 'username', autocomplete: 'username', autofocus: true }),
        field('Password', { name: 'password', type: 'password', autocomplete: 'current-password' }),
      ]
      : [
        field('Username', { name: 'username', autocomplete: 'username', autofocus: true }),
        field('Email', { name: 'email', type: 'email', autocomplete: 'email' }),
        field('Password', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: '6' }),
      ];

    const setBusy = (busy) => {
      submit.disabled = busy;
      submit.replaceChildren(...(busy ? [spinner(true), isLogin ? 'Signing in…' : 'Creating account…'] : [isLogin ? 'Sign in' : 'Create account']));
    };

    const goNext = () => {
      const next = App.auth.redirectAfter || '/';
      App.auth.redirectAfter = null;
      location.hash = `#${next}`;
    };

    const form = h('form', {
      class: 'auth-form',
      novalidate: false,
      onsubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        const data = Object.fromEntries(new FormData(form));
        setBusy(true);
        try {
          if (!isLogin) {
            await App.api.register(data.username.trim(), data.email.trim(), data.password);
            toast('Account created — welcome!');
          }
          await App.auth.login(data.username.trim(), data.password);
          goNext();
        } catch (err) {
          error.textContent = err.status === 401 ? 'Incorrect username or password.' : err.message;
          error.hidden = false;
          setBusy(false);
        }
      },
    }, fields, error, submit);

    const demoBtn = h('button', {
      type: 'button',
      class: 'btn btn-ghost btn-block',
      onclick: async () => {
        App.config.demo = true;
        App.mock.reset();
        try {
          await App.auth.login('demo', 'demo');
          toast('Demo mode: data is simulated in your browser.');
          goNext();
        } catch (err) {
          App.config.demo = false;
          toast(err.message, 'error');
        }
      },
    }, icon('play', 14), 'Explore with demo data');

    root.append(h('div', { class: 'auth-page' },
      h('div', { class: 'auth-card' },
        h('div', { class: 'brand brand-lg' }, h('span', { class: 'brand-mark' }, icon('mic', 22)), 'Speech Coach'),
        h('p', { class: 'auth-tagline' }, 'Upload a practice video and get feedback on pace, pauses, filler words and on-camera presence.'),
        h('div', { class: 'tabs', role: 'tablist' },
          h('a', { href: '#/login', class: `tab${isLogin ? ' active' : ''}`, role: 'tab', 'aria-selected': String(isLogin) }, 'Sign in'),
          h('a', { href: '#/register', class: `tab${!isLogin ? ' active' : ''}`, role: 'tab', 'aria-selected': String(!isLogin) }, 'Create account')),
        form,
        h('div', { class: 'divider' }, h('span', null, 'or')),
        demoBtn,
        serverSettings())));

    const first = form.querySelector('input');
    if (first) first.focus();
  }

  App.views.login = (root) => authView(root, 'login');
  App.views.register = (root) => authView(root, 'register');
})();
