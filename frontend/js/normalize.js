// Turns backend responses into the shapes the views use.
// The guide only sketches the response schemas, so lookups accept several
// plausible key names and search nested objects (e.g. `analysis`, `summary`).
(function () {
  const { isNum } = App.util;

  function toNum(v) {
    if (isNum(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return null;
  }

  // Breadth-first search for the first key in `names` across nested objects.
  // Arrays are skipped so large lists (word_timestamps) aren't crawled.
  function findKey(sources, names, accept = (v) => v != null) {
    const queue = (Array.isArray(sources) ? sources : [sources])
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({ obj: s, depth: 0 }));
    while (queue.length) {
      const { obj, depth } = queue.shift();
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(obj, name) && accept(obj[name])) return obj[name];
      }
      if (depth >= 4) continue;
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) queue.push({ obj: value, depth: depth + 1 });
      }
    }
    return undefined;
  }

  const findNum = (sources, names) => toNum(findKey(sources, names, (v) => toNum(v) != null));

  function parseMaybeJson(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  function status(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (['completed', 'complete', 'done', 'success', 'succeeded', 'finished'].includes(s)) return 'completed';
    if (['failed', 'failure', 'error', 'errored', 'cancelled', 'canceled'].includes(s)) return 'failed';
    if (['processing', 'running', 'in_progress', 'in-progress', 'started', 'analyzing'].includes(s)) return 'processing';
    if (['queued', 'pending', 'waiting', 'uploaded', 'created'].includes(s)) return 'queued';
    return s ? 'unknown' : 'queued';
  }

  // Accepts 0–1 or 0–100; returns 0–1 or null.
  function progress(raw) {
    const n = toNum(raw);
    if (n == null) return null;
    const p = n > 1 ? n / 100 : n;
    return Math.min(1, Math.max(0, p));
  }

  // processing_jobs.stage values written by the backend/worker
  const STAGE_LABELS = {
    uploaded: 'Waiting for the worker to pick up your video',
    analyzing_audio_video: 'Transcribing speech, detecting pauses and analyzing body language',
    saving_results: 'Saving results',
  };

  function stageLabel(stage) {
    if (!stage || ['completed', 'error'].includes(stage)) return null;
    if (STAGE_LABELS[stage]) return STAGE_LABELS[stage];
    const text = String(stage).replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function video(raw) {
    const v = raw || {};
    const nested = v.video && typeof v.video === 'object' ? v.video : {};
    const job = v.job_info || v.job || {};
    const id = v.id ?? v.video_id ?? nested.id;
    return {
      id,
      name: v.original_filename || v.filename || v.title || v.name || nested.filename || `Video #${id}`,
      duration: toNum(v.duration ?? v.duration_seconds ?? nested.duration),
      uploadedAt: v.created_at || v.uploaded_at || v.upload_date || v.upload_time || nested.created_at || null,
      // The job row is the most up-to-date status when the detail endpoint includes it.
      status: status(job.status ?? v.processing_status ?? v.status ?? nested.status),
      progress: progress(job.progress ?? v.progress),
      stage: stageLabel(job.stage || job.step || job.message || job.current_step),
      error: v.error_message || v.error || job.error || job.error_message || null,
      sizeBytes: toNum(v.file_size ?? v.size),
    };
  }

  function videoList(raw) {
    const list = Array.isArray(raw) ? raw : (raw && (raw.videos || raw.items || raw.results)) || [];
    return list.map(video);
  }

  function event(e, fallbackType) {
    if (!e || typeof e !== 'object') return null;
    const start = toNum(e.start ?? e.start_time ?? e.timestamp ?? e.time ?? e.begin);
    if (start == null) return null;
    let end = toNum(e.end ?? e.end_time ?? e.stop);
    if (end == null) end = start + (toNum(e.duration) ?? 0);
    let type = String(e.type || e.event_type || e.kind || fallbackType || 'EVENT').toUpperCase().replace(/[\s-]+/g, '_');
    if (TYPE_ALIASES[type]) type = TYPE_ALIASES[type];
    const label = e.word || e.filler || e.filler_word || e.text || e.label || null;
    return { type, start, end: Math.max(start, end), label };
  }

  // /analysis calls filler events FILLER_WORD; /events puts them in filler_events.
  const TYPE_ALIASES = { FILLER_WORD: 'FILLER', FILLERS: 'FILLER', PAUSES: 'PAUSE' };

  const ARRAY_TYPE_MAP = {
    pause_events: 'PAUSE',
    pauses: 'PAUSE',
    filler_events: 'FILLER',
    fillers: 'FILLER',
    filler_words: 'FILLER',
    looking_away_events: 'LOOKING_AWAY',
    hand_movement_events: 'HAND_MOVEMENT',
  };

  function events(eventsResp, analysisResp) {
    const out = [];
    const er = parseMaybeJson(eventsResp);
    if (Array.isArray(er)) {
      er.forEach((e) => out.push(event(e)));
    } else if (er && typeof er === 'object') {
      for (const [key, value] of Object.entries(er)) {
        if (!Array.isArray(value)) continue;
        const fallback = ARRAY_TYPE_MAP[key] || key.replace(/_events$/, '').toUpperCase();
        value.forEach((e) => out.push(event(e, fallback)));
      }
    }
    const unified = analysisResp && parseMaybeJson(analysisResp.events);
    if (Array.isArray(unified)) unified.forEach((e) => out.push(event(e)));

    // The two endpoints overlap (pauses appear in both) — dedupe.
    const seen = new Set();
    return out
      .filter(Boolean)
      .filter((e) => {
        const key = `${e.type}|${e.start.toFixed(2)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.start - b.start);
  }

  function words(sources) {
    const raw = parseMaybeJson(findKey(sources, ['word_timestamps', 'words', 'word_level_timestamps'],
      (v) => Array.isArray(v) || typeof v === 'string'));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((w) => ({
        word: String(w.word ?? w.text ?? '').trim(),
        start: toNum(w.start ?? w.start_time),
        end: toNum(w.end ?? w.end_time),
      }))
      .filter((w) => w.word && w.start != null)
      .map((w) => ({ ...w, end: w.end ?? w.start + 0.3 }))
      .sort((a, b) => a.start - b.start);
  }

  function ratio(v) {
    if (v == null) return null;
    return v > 1 ? v / 100 : v;
  }

  // detailResp: GET /videos/{id}; analysisResp: GET /videos/{id}/analysis; eventsResp: GET /videos/{id}/events
  function analysis(detailResp, analysisResp, eventsResp) {
    // GET /videos/{id} → `analysis` has the most complete speech metrics, so search it first.
    const speechSrc = [detailResp && detailResp.analysis, analysisResp && analysisResp.speech, detailResp, analysisResp];
    const visualSrc = [analysisResp && analysisResp.video_metrics, analysisResp, detailResp];

    const wordList = words([detailResp, analysisResp]);
    const evts = events(eventsResp, analysisResp);
    let transcript = findKey(speechSrc, ['transcript', 'transcript_text', 'full_transcript', 'transcription'],
      (v) => typeof v === 'string');
    if (!transcript && wordList.length) transcript = wordList.map((w) => w.word).join(' ');

    const pauses = evts.filter((e) => e.type === 'PAUSE');
    const fillers = evts.filter((e) => e.type === 'FILLER');

    let speechPct = findNum(speechSrc, ['speaking_time_percentage', 'speech_percentage', 'speech_percent', 'speaking_percentage', 'speech_ratio']);
    if (speechPct != null && speechPct <= 1) speechPct *= 100;

    const metrics = {
      speakingRate: findNum(speechSrc, ['speaking_rate', 'speaking_rate_wpm', 'words_per_minute', 'wpm', 'speech_rate']),
      speechPercentage: speechPct,
      wordCount: findNum(speechSrc, ['word_count', 'total_words', 'num_words']) ?? (wordList.length || null),
      speakingTime: findNum(speechSrc, ['speech_duration', 'total_speech_time', 'speech_time']),
      fillerPerMinute: findNum(speechSrc, ['filler_frequency', 'fillers_per_minute']),
      totalSilence: findNum(speechSrc, ['total_silence', 'total_silence_duration', 'silence_duration', 'total_silence_time']),
      longestPause: findNum(speechSrc, ['longest_pause', 'longest_pause_duration', 'max_pause', 'max_pause_duration']),
      averagePause: findNum(speechSrc, ['average_pause', 'average_pause_duration', 'avg_pause', 'avg_pause_duration', 'mean_pause']),
      pauseCount: findNum(speechSrc, ['pause_count', 'num_pauses', 'total_pauses']) ?? (pauses.length || null),
      fillerCount: findNum(speechSrc, ['filler_count', 'filler_word_count', 'total_fillers', 'num_fillers']) ?? (eventsResp ? fillers.length : null),
    };

    const visual = {
      faceVisibility: ratio(findNum(visualSrc, ['face_visibility_ratio', 'face_visibility'])),
      cameraFacing: ratio(findNum(visualSrc, ['camera_facing_ratio', 'camera_facing', 'eye_contact_ratio'])),
      bodyMovement: ratio(findNum(visualSrc, ['body_movement_ratio', 'body_movement'])),
      handActivity: ratio(findNum(visualSrc, ['hand_activity_ratio', 'hand_activity'])),
    };

    const lastWord = wordList.length ? wordList[wordList.length - 1].end : 0;
    const lastEvent = evts.reduce((m, e) => Math.max(m, e.end), 0);

    return {
      transcript: transcript || '',
      words: wordList,
      events: evts,
      metrics,
      visual,
      duration: findNum([analysisResp && analysisResp.video, detailResp], ['duration', 'duration_seconds']),
      maxTime: Math.max(lastWord, lastEvent),
    };
  }

  App.normalize = { video, videoList, analysis, events, status, progress, findKey };
})();
