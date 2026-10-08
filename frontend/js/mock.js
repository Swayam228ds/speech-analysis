// Demo mode: an in-browser stand-in for the FastAPI backend, returning
// responses shaped like the ones described in the frontend guide.
(function () {
  const SAMPLE = `Good morning everyone and thank you for joining today. I want to walk you through
    the results from the last quarter and share what we learned along the way. Our team set three
    goals at the start of the year. First we wanted to make onboarding faster for new customers.
    Second we planned to reduce the number of support tickets. And third we hoped to grow usage in
    the education market. Let me start with onboarding. We redesigned the setup flow and cut the
    average time from twenty minutes to under eight. That change alone lifted activation by almost
    a fifth. Support tickets also dropped once we added clearer guides inside the product. Education
    is where we still have work to do and I will share our plan for the next quarter shortly.
    Before that I would love to hear your questions about what we have covered so far.`
    .split(/\s+/).filter(Boolean);
  const FILLERS = ['um', 'uh', 'like', 'basically', 'actually']; // same list as whisper_service.py

  const files = new Map(); // id -> File uploaded during this session (playable)
  const cache = new Map(); // id -> generated analysis

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const r2 = (n) => Math.round(n * 100) / 100;

  // Deterministic PRNG so a given video always gets the same analysis.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seed() {
    const now = Date.now();
    return {
      nextId: 4,
      videos: [
        { id: 1, filename: 'Quarterly update rehearsal.mp4', duration: 94.5, created_at: new Date(now - 864e5 * 2).toISOString(), started: now - 864e5 * 2, processing_ms: 30000 },
        { id: 2, filename: 'Conference talk – take 2.mov', duration: 212.0, created_at: new Date(now - 60000).toISOString(), started: now, processing_ms: 40000 },
        { id: 3, filename: 'Interview practice.webm', duration: 61.2, created_at: new Date(now - 864e5 * 5).toISOString(), started: now - 864e5 * 5, processing_ms: 20000, fail: 'Audio track could not be decoded.' },
      ],
    };
  }

  function load() {
    try { return JSON.parse(sessionStorage.getItem('demoState')); } catch { return null; }
  }
  let state = load() || seed();
  function save() {
    try { sessionStorage.setItem('demoState', JSON.stringify(state)); } catch { /* ignore */ }
  }
  save();

  // Mirrors the stages/progress values worker.py writes to processing_jobs.
  function jobState(v) {
    const elapsed = Date.now() - v.started;
    if (elapsed < 1500) return { status: 'queued', progress: 0, stage: 'uploaded' };
    if (elapsed < v.processing_ms) {
      const p = (elapsed - 1500) / (v.processing_ms - 1500);
      return p < 0.85
        ? { status: 'processing', progress: 10, stage: 'analyzing_audio_video' }
        : { status: 'processing', progress: 90, stage: 'saving_results' };
    }
    return v.fail ? { status: 'failed', progress: 10, stage: 'error' } : { status: 'completed', progress: 100, stage: 'completed' };
  }

  function generate(v) {
    if (cache.has(v.id)) return cache.get(v.id);
    const rnd = rng(v.id * 9973 + Math.round(v.duration * 10));
    const D = v.duration;
    const words = [];
    const pauses = [];
    const fillers = [];
    let t = 0.6;
    let i = 0;
    let sinceBreak = 0;
    while (t < D - 0.8) {
      if (sinceBreak > 6 && rnd() < 0.09) {
        const len = 0.7 + rnd() * 2.1;
        pauses.push({ start: r2(t), end: r2(t + len), duration: r2(len) });
        t += len;
        sinceBreak = 0;
        continue;
      }
      const isFiller = rnd() < 0.045;
      const w = isFiller ? FILLERS[Math.floor(rnd() * FILLERS.length)] : SAMPLE[i++ % SAMPLE.length];
      const dur = 0.15 + rnd() * 0.2 + w.length * 0.012;
      const wd = { word: w, start: r2(t), end: r2(t + dur) };
      words.push(wd);
      if (isFiller) fillers.push({ word: w, start: wd.start, end: wd.end });
      t += dur + 0.04 + rnd() * 0.07;
      sinceBreak++;
    }

    const intervals = (type, every, minLen, maxLen) => {
      const out = [];
      let x = 2 + rnd() * every;
      while (x < D - 2) {
        const len = minLen + rnd() * (maxLen - minLen);
        out.push({ type, start: r2(x), end: r2(Math.min(D, x + len)) });
        x += len + every * (0.5 + rnd());
      }
      return out;
    };
    const lookingAway = intervals('LOOKING_AWAY', 16, 1, 3.5);
    const hands = intervals('HAND_MOVEMENT', 11, 1.5, 4);
    const noFace = intervals('FACE_NOT_DETECTED', 40, 0.8, 2);
    const total = (list) => list.reduce((s, e) => s + (e.end - e.start), 0);

    const leading = words.length ? words[0].start : D;
    const trailing = words.length ? Math.max(0, D - words[words.length - 1].end) : 0;
    const pauseTotal = total(pauses);
    const totalSilence = pauseTotal + leading + trailing;
    const speechDuration = Math.max(0, D - totalSilence);

    // Same keys as app/processing/pipeline.py → analyses table
    const speech = {
      transcript: words.map((w) => w.word).join(' '),
      word_count: words.length,
      words_per_minute: r2(speechDuration ? words.length / (speechDuration / 60) : 0),
      filler_word_count: fillers.length,
      pause_count: pauses.length,
      average_pause_duration: r2(pauses.length ? pauseTotal / pauses.length : 0),
      speech_duration: r2(speechDuration),
      total_silence_duration: r2(totalSilence),
      longest_pause: r2(pauses.reduce((m, p) => Math.max(m, p.duration), 0)),
      speaking_time_percentage: r2((speechDuration / D) * 100),
      filler_frequency: r2(speechDuration ? fillers.length / (speechDuration / 60) : 0),
    };
    const videoMetrics = {
      face_visibility_ratio: r2(1 - total(noFace) / D),
      camera_facing_ratio: r2(1 - total(lookingAway) / D),
      head_movement_count: 0,
      body_movement_ratio: r2(0.1 + rnd() * 0.25),
      hand_activity_ratio: r2(total(hands) / D),
      posture_change_count: Math.floor(rnd() * 6),
    };
    const visualEvents = [...lookingAway, ...hands, ...noFace];
    const result = { words, pauses, fillers, visualEvents, speech, videoMetrics };
    cache.set(v.id, result);
    return result;
  }

  // Same shape as GET /videos/{id} in app/routers/videos.py
  function detail(v) {
    const job = jobState(v);
    const done = job.status === 'completed';
    const out = {
      video_id: v.id,
      filename: v.filename,
      video_url: `/videos/${v.id}/file`,
      duration_seconds: done ? v.duration : null, // the worker only fills this in when it finishes
      processing_status: job.status,
      uploaded_at: v.created_at,
      job_info: { status: job.status, stage: job.stage, progress: job.progress, error_message: job.status === 'failed' ? v.fail : null },
    };
    if (done) {
      const g = generate(v);
      out.analysis = { ...g.speech, word_timestamps: g.words };
    }
    return out;
  }

  function notFound() {
    return new App.ApiError(404, 'Video not found');
  }

  function find(id) {
    const v = state.videos.find((x) => String(x.id) === String(id));
    if (!v) throw notFound();
    return v;
  }

  async function request(method, path, { json, form } = {}) {
    await wait(200 + Math.random() * 200);
    let m;
    if (method === 'POST' && path === '/login') {
      if (!form || !form.username || !form.password) throw new App.ApiError(422, 'Username and password are required');
      sessionStorage.setItem('demoUser', form.username);
      return { access_token: 'demo-token', token_type: 'bearer' };
    }
    if (method === 'POST' && path === '/register') {
      return { id: 1, username: json.username, email: json.email };
    }
    if (method === 'GET' && path === '/me') {
      const username = sessionStorage.getItem('demoUser') || 'demo';
      return { id: 1, username, email: `${username}@example.com` };
    }
    if (method === 'GET' && path === '/videos') {
      return {
        videos: state.videos.map((v) => {
          const d = detail(v);
          return { video_id: d.video_id, filename: d.filename, duration_seconds: d.duration_seconds, processing_status: d.processing_status, uploaded_at: d.uploaded_at };
        }),
      };
    }
    if ((m = path.match(/^\/videos\/([^/]+)$/))) {
      const v = find(decodeURIComponent(m[1]));
      if (method === 'GET') return detail(v);
      if (method === 'DELETE') {
        state.videos = state.videos.filter((x) => x !== v);
        files.delete(v.id);
        cache.delete(v.id);
        save();
        return null;
      }
    }
    if (method === 'GET' && (m = path.match(/^\/videos\/([^/]+)\/events$/))) {
      const v = find(decodeURIComponent(m[1]));
      if (jobState(v).status !== 'completed') return { pause_events: [], filler_events: [] };
      const g = generate(v);
      return {
        pause_events: g.pauses.map((p) => ({ start_time: p.start, end_time: p.end, duration: p.duration })),
        filler_events: g.fillers.map((f) => ({ filler_word: f.word, start_time: f.start, end_time: f.end })),
      };
    }
    // Same shape as GET /videos/{id}/analysis in app/routers/analysis.py
    if (method === 'GET' && (m = path.match(/^\/videos\/([^/]+)\/analysis$/))) {
      const v = find(decodeURIComponent(m[1]));
      const job = jobState(v);
      const video = { id: v.id, duration: job.status === 'completed' ? v.duration : 0, status: job.status };
      if (job.status !== 'completed') return { video, message: 'Analysis is not completed yet.' };
      const g = generate(v);
      const s = g.speech;
      return {
        video,
        speech: {
          transcript: s.transcript,
          word_count: s.word_count,
          words_per_minute: s.words_per_minute,
          speaking_time_percentage: s.speaking_time_percentage,
          pause_count: s.pause_count,
          average_pause_duration: s.average_pause_duration,
          longest_pause: s.longest_pause,
          filler_word_count: s.filler_word_count,
          filler_frequency: s.filler_frequency,
        },
        video_metrics: g.videoMetrics,
        events: [
          ...g.pauses.map((p) => ({ type: 'PAUSE', start: p.start, end: p.end })),
          ...g.fillers.map((f) => ({ type: 'FILLER_WORD', start: f.start, end: f.end, word: f.word })),
          ...g.visualEvents,
        ].sort((a, b) => a.start - b.start),
      };
    }
    throw new App.ApiError(404, `Demo backend has no route for ${method} ${path}`);
  }

  function readDuration(file) {
    return new Promise((resolve) => {
      const el = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);
      const done = (d) => { URL.revokeObjectURL(objectUrl); resolve(d); };
      const timer = setTimeout(() => done(null), 4000);
      el.preload = 'metadata';
      el.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(el.duration) ? el.duration : null); };
      el.onerror = () => { clearTimeout(timer); done(null); };
      el.src = objectUrl;
    });
  }

  function upload(file, onProgress) {
    let cancelled = false;
    let timer;
    const promise = new Promise((resolve, reject) => {
      let p = 0;
      const tick = async () => {
        if (cancelled) return reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
        p = Math.min(1, p + 0.08 + Math.random() * 0.08);
        onProgress(p);
        if (p < 1) { timer = setTimeout(tick, 120); return; }
        const duration = (await readDuration(file)) || 60;
        const id = state.nextId++;
        state.videos.unshift({
          id, filename: file.name, duration: r2(duration), created_at: new Date().toISOString(),
          started: Date.now(), processing_ms: 9000,
        });
        files.set(id, file);
        save();
        resolve({ message: 'Video uploaded successfully and queued for processing', video_id: id, status: 'queued' });
      };
      timer = setTimeout(tick, 150);
    });
    return { promise, abort: () => { cancelled = true; clearTimeout(timer); } };
  }

  async function videoSource(id) {
    const file = files.get(Number(id));
    if (!file) return null;
    const objectUrl = URL.createObjectURL(file);
    return { url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  }

  function reset() {
    state = seed();
    files.clear();
    cache.clear();
    save();
  }

  App.mock = { request, upload, videoSource, reset };
})();
