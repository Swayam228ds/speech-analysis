// Dashboard: the user's videos with status, duration and upload date.
(function () {
  const { h, icon, fmtClock, fmtDate, toast, statusChip, spinner } = App.util;

  const TERMINAL = ['completed', 'failed'];

  App.views.dashboard = function (root) {
    let disposed = false;
    let timer = null;
    const ctrl = new AbortController();

    const stats = h('div', { class: 'stat-strip' });
    const grid = h('div', { class: 'video-grid' });
    const body = h('div', null, h('div', { class: 'center-pad' }, spinner()));

    root.append(h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Your videos'),
          h('p', { class: 'muted' }, 'Review past analyses or upload a new practice session.')),
        h('a', { href: '#/upload', class: 'btn btn-primary' }, icon('upload', 16), 'Upload video')),
      body));

    async function remove(video, btn) {
      if (!confirm(`Delete “${video.name}”? This can't be undone.`)) return;
      btn.disabled = true;
      try {
        await App.api.deleteVideo(video.id);
        toast('Video deleted');
        refresh();
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'error');
      }
    }

    function card(v) {
      const del = h('button', {
        class: 'icon-btn danger',
        title: 'Delete video',
        'aria-label': `Delete ${v.name}`,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); remove(v, del); },
      }, icon('trash', 16));

      const inFlight = !TERMINAL.includes(v.status);
      return h('a', { class: 'video-card', href: `#/videos/${encodeURIComponent(v.id)}` },
        h('div', { class: `thumb thumb-${v.status}` },
          h('span', { class: 'thumb-icon' }, icon(v.status === 'failed' ? 'alert' : 'play', 22)),
          v.duration != null ? h('span', { class: 'thumb-duration' }, fmtClock(v.duration)) : null,
          inFlight ? h('div', { class: 'thumb-progress' },
            h('div', { class: 'thumb-progress-bar', style: { width: `${Math.round((v.progress || 0) * 100)}%` } })) : null),
        h('div', { class: 'video-card-body' },
          h('div', { class: 'video-card-title', title: v.name }, v.name),
          h('div', { class: 'video-card-meta' },
            statusChip(v.status),
            inFlight && v.progress != null ? h('span', { class: 'muted small' }, `${Math.round(v.progress * 100)}%`) : null),
          h('div', { class: 'video-card-foot' },
            h('span', { class: 'muted small' }, icon('calendar', 13), fmtDate(v.uploadedAt)),
            del)));
    }

    function render(videos) {
      if (!videos.length) {
        body.replaceChildren(h('div', { class: 'empty' },
          h('div', { class: 'empty-icon' }, icon('video', 28)),
          h('h2', null, 'No videos yet'),
          h('p', { class: 'muted' }, 'Upload a short practice recording to get your first analysis.'),
          h('a', { href: '#/upload', class: 'btn btn-primary' }, icon('upload', 16), 'Upload your first video')));
        return;
      }
      const count = (s) => videos.filter((v) => v.status === s).length;
      const inFlight = videos.filter((v) => !TERMINAL.includes(v.status)).length;
      const totalSecs = videos.reduce((s, v) => s + (v.duration || 0), 0);
      stats.replaceChildren(
        stat('Videos', videos.length),
        stat('Analyzed', count('completed')),
        stat('In progress', inFlight),
        stat('Total footage', fmtClock(totalSecs)));
      grid.replaceChildren(...videos.map(card));
      if (!body.contains(grid)) body.replaceChildren(stats, grid);
    }

    function stat(label, value) {
      return h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label));
    }

    async function refresh() {
      clearTimeout(timer);
      try {
        const videos = App.normalize.videoList(await App.api.listVideos({ signal: ctrl.signal }));
        if (disposed) return;
        videos.sort((a, b) => (Date.parse(b.uploadedAt) || 0) - (Date.parse(a.uploadedAt) || 0) || (b.id > a.id ? 1 : -1));
        render(videos);
        // Keep statuses fresh while anything is still processing.
        if (videos.some((v) => !TERMINAL.includes(v.status))) timer = setTimeout(refresh, App.config.DASHBOARD_REFRESH_MS);
      } catch (err) {
        if (disposed || err.name === 'AbortError') return;
        body.replaceChildren(h('div', { class: 'empty' },
          h('div', { class: 'empty-icon error' }, icon('alert', 28)),
          h('h2', null, "Couldn't load your videos"),
          h('p', { class: 'muted' }, err.message),
          h('button', { class: 'btn btn-secondary', onclick: () => { body.replaceChildren(h('div', { class: 'center-pad' }, spinner())); refresh(); } },
            icon('refresh', 16), 'Try again')));
      }
    }

    refresh();
    return () => { disposed = true; clearTimeout(timer); ctrl.abort(); };
  };
})();
