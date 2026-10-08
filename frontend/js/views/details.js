// Video details: processing state (polling), player, unified event timeline,
// metrics, and a transcript that highlights words as the video plays.
(function () {
  const { h, icon, isNum, fmtClock, fmtSeconds, fmtDate, fmtNumber, toast, statusChip, spinner } = App.util;

  const EVENT_TYPES = {
    PAUSE: { label: 'Pause', color: 'var(--ev-pause)' },
    FILLER: { label: 'Filler word', color: 'var(--ev-filler)' },
    LOOKING_AWAY: { label: 'Looking away', color: 'var(--ev-away)' },
    HAND_MOVEMENT: { label: 'Hand movement', color: 'var(--ev-hand)' },
    FACE_NOT_DETECTED: { label: 'Face not visible', color: 'var(--ev-noface)' },
  };
  const TYPE_ORDER = Object.keys(EVENT_TYPES);

  function typeInfo(type) {
    if (EVENT_TYPES[type]) return EVENT_TYPES[type];
    const label = type.toLowerCase().replace(/_/g, ' ');
    return { label: label.charAt(0).toUpperCase() + label.slice(1), color: 'var(--ev-other)' };
  }

  App.views.details = function (root, { id }) {
    let disposed = false;
    let pollTimer = null;
    let rafId = 0;
    let source = null; // { url, revoke }
    const ctrl = new AbortController();

    const header = h('div', { class: 'details-head' });
    const body = h('div', { class: 'details-body' }, h('div', { class: 'center-pad' }, spinner()));
    root.append(h('div', { class: 'page page-wide' },
      h('a', { href: '#/', class: 'back-link' }, icon('back', 16), 'All videos'),
      header, body));

    // ---------- header ----------
    function renderHeader(v) {
      const del = h('button', { class: 'btn btn-danger-ghost', onclick: () => remove(v, del) }, icon('trash', 16), 'Delete');
      header.replaceChildren(
        h('div', { class: 'details-title' },
          h('h1', { title: v.name }, v.name),
          h('div', { class: 'meta-row' },
            statusChip(v.status),
            v.duration != null ? h('span', { class: 'meta' }, icon('clock', 14), fmtClock(v.duration)) : null,
            v.uploadedAt ? h('span', { class: 'meta' }, icon('calendar', 14), fmtDate(v.uploadedAt)) : null)),
        del);
    }

    async function remove(v, btn) {
      if (!confirm(`Delete “${v.name}”? This can't be undone.`)) return;
      btn.disabled = true;
      try {
        await App.api.deleteVideo(v.id);
        toast('Video deleted');
        location.hash = '#/';
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'error');
      }
    }

    // ---------- polling ----------
    let processingEls = null;
    let lastStatus = null;

    async function poll(first) {
      try {
        const raw = await App.api.getVideo(id, { signal: ctrl.signal });
        if (disposed) return;
        const v = App.normalize.video(raw);
        if (v.status !== lastStatus) renderHeader(v);
        lastStatus = v.status;
        if (v.status === 'completed') return loadResults(v, raw);
        if (v.status === 'failed') return renderFailed(v);
        renderProcessing(v);
        pollTimer = setTimeout(poll, App.config.POLL_INTERVAL_MS);
      } catch (err) {
        if (disposed || err.name === 'AbortError') return;
        if (first || err.status === 404) return renderError(err);
        // Transient error while polling: back off and keep trying.
        pollTimer = setTimeout(poll, App.config.POLL_INTERVAL_MS * 2);
      }
    }

    function renderProcessing(v) {
      if (!processingEls) {
        processingEls = {
          title: h('h2'),
          stage: h('p', { class: 'muted' }),
          bar: h('div', { class: 'progress-bar' }),
          pct: h('span', { class: 'progress-pct' }),
          progress: null,
        };
        processingEls.progress = h('div', { class: 'progress progress-lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, processingEls.bar);
        body.replaceChildren(h('div', { class: 'card processing-card' },
          h('div', { class: 'pulse' }, icon('mic', 26)),
          processingEls.title,
          processingEls.stage,
          h('div', { class: 'processing-progress' },
            processingEls.progress,
            processingEls.pct),
          h('ol', { class: 'pipeline' },
            h('li', null, h('strong', null, 'Speech'), ' — transcript, pace, pauses and filler words'),
            h('li', null, h('strong', null, 'Visual'), ' — face visibility, eye contact and movement')),
          h('p', { class: 'muted small' }, 'This page updates automatically. You can leave and come back later.')));
      }
      const e = processingEls;
      const queued = v.status === 'queued';
      e.title.textContent = queued ? 'Waiting in the queue…' : 'Analyzing your video…';
      e.stage.textContent = v.stage || (queued ? 'Your video will start processing shortly.' : 'Running speech and visual analysis.');
      e.progress.classList.toggle('indeterminate', v.progress == null || (queued && !v.progress));
      const pct = Math.round((v.progress || 0) * 100);
      e.bar.style.width = `${pct}%`;
      e.pct.textContent = v.progress == null ? '' : `${pct}%`;
      e.progress.setAttribute('aria-valuenow', String(pct));
    }

    function renderFailed(v) {
      body.replaceChildren(h('div', { class: 'card empty' },
        h('div', { class: 'empty-icon error' }, icon('alert', 28)),
        h('h2', null, 'Analysis failed'),
        h('p', { class: 'muted' }, v.error || 'Something went wrong while processing this video.'),
        h('a', { href: '#/upload', class: 'btn btn-primary' }, icon('upload', 16), 'Upload again')));
    }

    function renderError(err) {
      header.replaceChildren();
      body.replaceChildren(h('div', { class: 'card empty' },
        h('div', { class: 'empty-icon error' }, icon('alert', 28)),
        h('h2', null, err.status === 404 ? 'Video not found' : "Couldn't load this video"),
        h('p', { class: 'muted' }, err.message),
        h('a', { href: '#/', class: 'btn btn-secondary' }, 'Back to dashboard')));
    }

    // ---------- results ----------
    async function loadResults(v, raw) {
      // The unified /analysis endpoint carries visual metrics + all events;
      // /events adds filler words. Either may be missing on older backends.
      const [analysis, events] = await Promise.allSettled([
        App.api.getAnalysis(id, { signal: ctrl.signal }),
        App.api.getEvents(id, { signal: ctrl.signal }),
      ]);
      if (disposed) return;
      const model = App.normalize.analysis(
        raw,
        analysis.status === 'fulfilled' ? analysis.value : null,
        events.status === 'fulfilled' ? events.value : null);
      renderResults(v, model);
    }

    function renderResults(v, m) {
      const player = buildPlayer(v, m);
      const eventsPanel = buildEventsPanel(m, player);
      const transcript = buildTranscript(m, player);
      player.onTick((t) => { eventsPanel.sync(t); transcript.sync(t); });

      body.replaceChildren(
        h('div', { class: 'results-grid' },
          h('div', { class: 'card player-card' }, player.el),
          eventsPanel.el),
        buildMetrics(m),
        transcript.el);
      player.sync();
    }

    // ---------- player + timeline ----------
    function buildPlayer(v, m) {
      const video = h('video', { controls: true, playsinline: true, preload: 'metadata' });
      const overlay = h('div', { class: 'player-overlay' }, spinner(), h('span', { class: 'overlay-text' }, 'Loading video…'));
      const stage = h('div', { class: 'player-stage' }, video, overlay);

      let hasVideo = false;
      let virtualTime = 0; // used when the file can't be played (keeps timeline/transcript interactive)
      const listeners = [];

      const duration = () => v.duration || m.duration || (hasVideo && isNum(video.duration) ? video.duration : 0) || m.maxTime || 1;
      const now = () => (hasVideo ? video.currentTime : virtualTime);

      // Lanes: one row per event type present.
      const types = [...new Set(m.events.map((e) => e.type))]
        .sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
      const bars = [];
      const playhead = h('div', { class: 'playhead' });
      const hover = h('div', { class: 'timeline-hover', hidden: true });
      const tracks = h('div', { class: 'timeline-tracks' });

      for (const type of types) {
        const info = typeInfo(type);
        const track = h('div', { class: 'track' });
        for (const e of m.events.filter((x) => x.type === type)) {
          const bar = h('button', {
            class: 'ev-bar',
            style: { background: info.color },
            title: `${info.label}${e.label ? ` “${e.label}”` : ''} · ${fmtClock(e.start, true)}–${fmtClock(e.end, true)}`,
            'aria-label': `${info.label} at ${fmtClock(e.start)}`,
            onclick: (ev) => { ev.stopPropagation(); seek(e.start, true); },
          });
          bars.push({ el: bar, e });
          track.append(bar);
        }
        tracks.append(h('div', { class: 'lane' },
          h('div', { class: 'lane-label', title: info.label }, h('span', { class: 'dot', style: { background: info.color } }), h('span', { class: 'lane-label-text' }, info.label)),
          track));
      }

      const ruler = h('div', { class: 'ruler' });
      const area = h('div', { class: 'timeline-area' }, playhead, hover);
      const timeline = h('div', { class: 'timeline' },
        h('div', { class: 'timeline-head' },
          h('span', { class: 'timeline-title' }, 'Timeline'),
          h('span', { class: 'timecode' })),
        tracks,
        h('div', { class: 'lane lane-ruler' }, h('div', { class: 'lane-label' }), ruler));
      if (!types.length) tracks.append(h('p', { class: 'muted small' }, 'No events were detected in this video.'));
      const timecode = timeline.querySelector('.timecode');

      // Playhead/hover overlay spans every track column.
      tracks.prepend(area);

      function layout() {
        const D = duration();
        for (const { el, e } of bars) {
          el.style.left = `${(e.start / D) * 100}%`;
          el.style.width = `max(3px, ${((e.end - e.start) / D) * 100}%)`;
        }
        const maxTicks = Math.max(2, Math.min(8, Math.floor((ruler.clientWidth || 600) / 56)));
        const step = [5, 10, 15, 30, 60, 120, 300, 600].find((s) => D / s <= maxTicks) || 900;
        ruler.replaceChildren();
        for (let t = 0; t <= D + 0.001; t += step) {
          ruler.append(h('span', { class: 'tick', style: { left: `${(t / D) * 100}%` } }, fmtClock(t)));
        }
      }

      function timeFromEvent(ev) {
        const rect = area.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        return frac * duration();
      }
      tracks.addEventListener('click', (ev) => { if (ev.target.closest('.lane-label')) return; seek(timeFromEvent(ev)); });
      tracks.addEventListener('mousemove', (ev) => {
        const rect = area.getBoundingClientRect();
        if (ev.clientX < rect.left) { hover.hidden = true; return; }
        const t = timeFromEvent(ev);
        hover.hidden = false;
        hover.style.left = `${(t / duration()) * 100}%`;
        hover.dataset.time = fmtClock(t);
      });
      tracks.addEventListener('mouseleave', () => { hover.hidden = true; });

      function seek(t, play) {
        const target = Math.max(0, Math.min(t, duration()));
        if (hasVideo) {
          video.currentTime = target;
          if (play) video.play().catch(() => {});
        } else {
          virtualTime = target;
        }
        sync();
      }

      function sync() {
        const t = now();
        const D = duration();
        playhead.style.left = `${Math.min(100, (t / D) * 100)}%`;
        timecode.textContent = `${fmtClock(t)} / ${fmtClock(D)}`;
        for (const b of bars) b.el.classList.toggle('active', t >= b.e.start && t <= b.e.end + 0.05);
        listeners.forEach((fn) => fn(t));
      }

      function loop() {
        sync();
        rafId = requestAnimationFrame(loop);
      }
      video.addEventListener('play', () => { cancelAnimationFrame(rafId); loop(); });
      video.addEventListener('pause', () => { cancelAnimationFrame(rafId); sync(); });
      video.addEventListener('ended', () => { cancelAnimationFrame(rafId); sync(); });
      video.addEventListener('seeked', sync);
      video.addEventListener('loadedmetadata', () => { layout(); sync(); });
      video.addEventListener('error', () => {
        if (!hasVideo) return;
        virtualTime = video.currentTime || 0;
        hasVideo = false;
        stage.append(overlay);
        showUnavailable("This video can't be played in your browser (unsupported format or codec).");
      });

      function showUnavailable(message) {
        stage.classList.add('no-video');
        video.remove();
        overlay.replaceChildren(icon('video', 28),
          h('span', { class: 'overlay-text' }, message),
          h('span', { class: 'overlay-sub' }, 'You can still click the timeline, events and transcript to explore.'));
      }

      App.api.videoSource(id, {
        signal: ctrl.signal,
        onProgress: (p) => { overlay.querySelector('.overlay-text').textContent = `Loading video… ${Math.round(p * 100)}%`; },
      }).then((src) => {
        if (disposed) { if (src) src.revoke(); return; }
        if (!src) return showUnavailable(App.config.demo
          ? 'Sample videos have no file in demo mode — upload your own clip to play it here.'
          : 'Video file unavailable.');
        source = src;
        hasVideo = true;
        video.src = src.url;
        overlay.remove();
      }).catch((err) => {
        if (disposed || err.name === 'AbortError') return;
        showUnavailable(`Couldn't load the video: ${err.message}`);
      });

      layout();
      // Re-space the ruler ticks when the timeline width changes.
      if (window.ResizeObserver) {
        let lastWidth = 0;
        const ro = new ResizeObserver(() => {
          if (disposed) return ro.disconnect();
          if (Math.abs(ruler.clientWidth - lastWidth) < 20) return;
          lastWidth = ruler.clientWidth;
          layout();
        });
        ro.observe(ruler);
      }
      return {
        el: h('div', null, stage, timeline),
        seek,
        sync,
        onTick: (fn) => listeners.push(fn),
      };
    }

    // ---------- events sidebar ----------
    function buildEventsPanel(m, player) {
      let filter = 'ALL';
      const list = h('ul', { class: 'event-list' });
      const chips = h('div', { class: 'filter-chips' });
      const rows = m.events.map((e) => {
        const info = typeInfo(e.type);
        const el = h('li', null, h('button', { class: 'event-row', onclick: () => player.seek(e.start, true) },
          h('span', { class: 'event-swatch', style: { background: info.color } }),
          h('span', { class: 'event-main' },
            h('span', { class: 'event-type' }, info.label, e.label ? h('span', { class: 'event-word' }, ` “${e.label}”`) : null),
            h('span', { class: 'event-time' }, `${fmtClock(e.start, true)} – ${fmtClock(e.end, true)}`)),
          h('span', { class: 'event-dur' }, fmtSeconds(e.end - e.start))));
        return { el, e };
      });

      const types = [...new Set(m.events.map((e) => e.type))]
        .sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));

      function renderChips() {
        const chip = (key, label, count, color) => h('button', {
          class: `filter-chip${filter === key ? ' active' : ''}`,
          'aria-pressed': String(filter === key),
          onclick: () => { filter = key; renderChips(); renderList(); },
        }, color ? h('span', { class: 'dot', style: { background: color } }) : null, label, h('span', { class: 'count' }, count));
        chips.replaceChildren(
          chip('ALL', 'All', m.events.length),
          ...types.map((t) => chip(t, typeInfo(t).label, m.events.filter((e) => e.type === t).length, typeInfo(t).color)));
      }

      function renderList() {
        const visible = rows.filter((r) => filter === 'ALL' || r.e.type === filter);
        list.replaceChildren(...visible.map((r) => r.el));
        if (!visible.length) list.append(h('li', { class: 'muted small pad' }, 'No events detected.'));
      }

      renderChips();
      renderList();

      return {
        el: h('div', { class: 'card events-card' },
          h('div', { class: 'card-head' }, h('h2', null, 'Events'), h('span', { class: 'muted small' }, 'Click to jump')),
          chips, list),
        sync(t) {
          for (const r of rows) r.el.classList.toggle('active', t >= r.e.start && t <= r.e.end + 0.05);
        },
      };
    }

    // ---------- metrics ----------
    function tile(label, value, unit, hint, tone) {
      return h('div', { class: `metric${tone ? ` tone-${tone}` : ''}` },
        h('div', { class: 'metric-label' }, label),
        h('div', { class: 'metric-value' }, value, unit && value !== '—' ? h('span', { class: 'metric-unit' }, unit) : null),
        hint ? h('div', { class: 'metric-hint' }, hint) : null);
    }

    function meter(label, value, description) {
      const pct = isNum(value) ? Math.round(value * 100) : null;
      return h('div', { class: 'meter' },
        h('div', { class: 'meter-head' }, h('span', null, label), h('strong', null, pct == null ? '—' : `${pct}%`)),
        h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: { width: `${pct || 0}%` } })),
        h('div', { class: 'metric-hint' }, description));
    }

    function buildMetrics(m) {
      const x = m.metrics;
      let paceHint = 'Typical conversational pace is 120–160 wpm';
      let paceTone = null;
      if (isNum(x.speakingRate)) {
        if (x.speakingRate > 170) { paceHint = 'A bit fast — try slowing down'; paceTone = 'warn'; }
        else if (x.speakingRate < 110) { paceHint = 'On the slow side — try picking up the pace'; paceTone = 'warn'; }
        else { paceHint = 'Comfortable, easy-to-follow pace'; paceTone = 'good'; }
      }

      const sections = [
        h('section', { class: 'metric-section' },
          h('h2', null, 'Speech'),
          h('div', { class: 'metric-grid' },
            tile('Speaking rate', fmtNumber(x.speakingRate), 'wpm', paceHint, paceTone),
            tile('Speech time', isNum(x.speechPercentage) ? fmtNumber(x.speechPercentage, 0) : '—', '%', 'Share of the video spent speaking'),
            tile('Words spoken', fmtNumber(x.wordCount)),
            tile('Filler words', fmtNumber(x.fillerCount), null,
              isNum(x.fillerPerMinute) && x.fillerCount > 0 ? `${fmtNumber(x.fillerPerMinute, 1)} per minute of speech` : 'um, uh, like, basically, actually',
              isNum(x.fillerCount) && x.fillerCount === 0 ? 'good' : null))),
        h('section', { class: 'metric-section' },
          h('h2', null, 'Pauses & silence'),
          h('div', { class: 'metric-grid' },
            tile('Total silence', fmtSeconds(x.totalSilence)),
            tile('Longest pause', fmtSeconds(x.longestPause), null, isNum(x.longestPause) && x.longestPause > 3 ? 'Long pauses can lose your audience' : null, isNum(x.longestPause) && x.longestPause > 3 ? 'warn' : null),
            tile('Average pause', fmtSeconds(x.averagePause)),
            tile('Pauses', fmtNumber(x.pauseCount)))),
      ];

      const v = m.visual;
      if (Object.values(v).some(isNum)) {
        sections.push(h('section', { class: 'metric-section' },
          h('h2', null, 'On camera'),
          h('div', { class: 'meter-grid card' },
            meter('Face visible', v.faceVisibility, 'Time your face was in frame'),
            meter('Facing the camera', v.cameraFacing, 'Approximate eye contact with your audience'),
            meter('Body movement', v.bodyMovement, 'Some movement looks natural; constant motion distracts'),
            meter('Hand activity', v.handActivity, 'Gestures help emphasise key points'))));
      }
      return h('div', { class: 'metrics' }, sections);
    }

    // ---------- transcript ----------
    function buildTranscript(m, player) {
      const scroller = h('div', { class: 'transcript-body' });
      const follow = h('input', { type: 'checkbox', checked: true });
      const el = h('div', { class: 'card transcript-card' },
        h('div', { class: 'card-head' },
          h('h2', null, 'Transcript'),
          m.words.length ? h('label', { class: 'toggle small' }, follow, 'Follow along') : null),
        scroller);

      if (!m.words.length) {
        scroller.append(m.transcript
          ? h('p', null, m.transcript)
          : h('p', { class: 'muted' }, 'No transcript available for this video.'));
        return { el, sync() {} };
      }

      const fillers = m.events.filter((e) => e.type === 'FILLER');
      const pauses = m.events.filter((e) => e.type === 'PAUSE');
      let pi = 0;
      const spans = m.words.map((w) => {
        // Insert pause markers before the first word that follows each pause.
        while (pi < pauses.length && pauses[pi].start <= w.start) {
          const p = pauses[pi++];
          scroller.append(h('button', { class: 'pause-pill', title: `Pause at ${fmtClock(p.start, true)}`, onclick: () => player.seek(p.start, true) },
            `⏸ ${fmtSeconds(p.end - p.start)}`), ' ');
        }
        const isFiller = fillers.some((f) => w.start < f.end && w.end > f.start);
        const span = h('span', { class: `word${isFiller ? ' filler' : ''}`, onclick: () => player.seek(w.start, true) }, w.word);
        scroller.append(span, ' ');
        return span;
      });
      scroller.append(h('p', { class: 'muted small legend-note' },
        h('span', { class: 'word filler' }, 'filler'), ' words are underlined · click any word to jump there'));

      let current = -1;
      function indexAt(t) {
        let lo = 0;
        let hi = m.words.length - 1;
        let ans = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (m.words[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return ans >= 0 && t <= m.words[ans].end + 0.25 ? ans : -1;
      }

      return {
        el,
        sync(t) {
          const i = indexAt(t);
          if (i === current) return;
          if (current >= 0) spans[current].classList.remove('current');
          current = i;
          if (i < 0) return;
          const span = spans[i];
          span.classList.add('current');
          if (follow.checked) {
            const top = span.offsetTop; // scroller is position: relative, so this is relative to it
            if (top < scroller.scrollTop || top > scroller.scrollTop + scroller.clientHeight - 40) {
              scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3), behavior: 'smooth' });
            }
          }
        },
      };
    }

    poll(true);

    return () => {
      disposed = true;
      clearTimeout(pollTimer);
      cancelAnimationFrame(rafId);
      ctrl.abort();
      if (source) source.revoke();
    };
  };
})();
