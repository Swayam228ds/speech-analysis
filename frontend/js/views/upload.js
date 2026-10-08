// Upload: drag-and-drop, validation (video only, ≤ 100 MB), progress, redirect.
(function () {
  const { h, icon, fmtBytes, toast } = App.util;

  function validate(file) {
    // The backend checks the MIME type the browser reports, so validate on that.
    const formats = App.config.VIDEO_EXTENSIONS.map((e) => e.toUpperCase()).join(', ');
    if (!App.config.VIDEO_MIME_TYPES.includes(file.type)) {
      return file.type.startsWith('video/')
        ? `“${file.name}” is a video format the server doesn't accept. Please use ${formats}.`
        : `“${file.name}” isn't a supported video file. Please use ${formats}.`;
    }
    if (file.size > App.config.MAX_UPLOAD_BYTES) return `This file is ${fmtBytes(file.size)}. The maximum size is ${fmtBytes(App.config.MAX_UPLOAD_BYTES)}.`;
    if (file.size === 0) return 'This file is empty.';
    return null;
  }

  App.views.upload = function (root) {
    let file = null;
    let job = null;
    let disposed = false;

    const input = h('input', {
      type: 'file',
      accept: [...App.config.VIDEO_MIME_TYPES, ...App.config.VIDEO_EXTENSIONS.map((e) => '.' + e)].join(','),
      class: 'visually-hidden',
      id: 'file-input',
      onchange: () => input.files[0] && select(input.files[0]),
    });

    const error = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const fileRow = h('div', { class: 'file-row', hidden: true });
    const progressWrap = h('div', { class: 'upload-progress', hidden: true });
    const uploadBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: start }, icon('upload', 16), 'Upload & analyze');

    const drop = h('label', { class: 'dropzone', for: 'file-input', tabindex: '0' },
      h('div', { class: 'dropzone-icon' }, icon('upload', 28)),
      h('div', { class: 'dropzone-title' }, 'Drag a video here, or ', h('span', { class: 'link' }, 'browse')),
      h('div', { class: 'muted small' }, `MP4, WEBM or MOV · up to${fmtBytes(App.config.MAX_UPLOAD_BYTES)}`),
      input);

    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault();
      if (!job) drop.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault();
      drop.classList.remove('dragging');
    }));
    drop.addEventListener('drop', (e) => {
      if (job) return;
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) select(f);
    });

    function showError(msg) {
      error.textContent = msg || '';
      error.hidden = !msg;
    }

    function select(f) {
      if (job) return;
      const problem = validate(f);
      showError(problem);
      file = problem ? null : f;
      input.value = '';
      uploadBtn.disabled = !file;
      fileRow.hidden = !file;
      if (file) {
        fileRow.replaceChildren(
          h('span', { class: 'file-icon' }, icon('file', 18)),
          h('div', { class: 'file-info' },
            h('div', { class: 'file-name' }, file.name),
            h('div', { class: 'muted small' }, `${fmtBytes(file.size)} · ${file.type || 'video'}`)),
          h('button', { class: 'icon-btn', title: 'Remove', 'aria-label': 'Remove file', onclick: clear }, icon('x', 16)));
      }
    }

    function clear() {
      file = null;
      fileRow.hidden = true;
      uploadBtn.disabled = true;
      showError(null);
    }

    function setProgress(p) {
      const pct = Math.round(p * 100);
      progressWrap.querySelector('.progress-bar').style.width = `${pct}%`;
      progressWrap.querySelector('.progress-pct').textContent = p >= 1 ? 'Finishing…' : `${pct}%`;
      progressWrap.querySelector('.progress').setAttribute('aria-valuenow', String(pct));
    }

    async function start() {
      if (!file || job) return;
      showError(null);
      uploadBtn.disabled = true;
      drop.classList.add('disabled');
      fileRow.querySelector('.icon-btn').disabled = true;
      progressWrap.hidden = false;
      progressWrap.replaceChildren(
        h('div', { class: 'progress-head' }, h('span', null, 'Uploading…'), h('span', { class: 'progress-pct' }, '0%')),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
          h('div', { class: 'progress-bar' })),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => job && job.abort() }, 'Cancel'));

      job = App.api.uploadVideo(file, setProgress);
      try {
        const res = await job.promise;
        if (disposed) return;
        const id = res && (res.video_id ?? res.id ?? (res.video && res.video.id));
        toast('Upload complete — analysis queued');
        location.hash = id != null ? `#/videos/${encodeURIComponent(id)}` : '#/';
      } catch (err) {
        if (disposed) return;
        job = null;
        progressWrap.hidden = true;
        drop.classList.remove('disabled');
        fileRow.querySelector('.icon-btn').disabled = false;
        uploadBtn.disabled = !file;
        showError(err.name === 'AbortError' ? 'Upload cancelled.' : err.message);
      }
    }

    root.append(h('div', { class: 'page page-narrow' },
      h('a', { href: '#/', class: 'back-link' }, icon('back', 16), 'All videos'),
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Upload a video'),
          h('p', { class: 'muted' }, 'We\'ll transcribe your speech, measure pace and pauses, and check your on-camera presence.'))),
      h('div', { class: 'card upload-card' },
        drop, error, fileRow, progressWrap,
        h('div', { class: 'upload-actions' },
          h('a', { href: '#/', class: 'btn btn-ghost' }, 'Cancel'),
          uploadBtn)),
      h('ul', { class: 'tips' },
        h('li', null, 'Face the camera with your head and shoulders in frame.'),
        h('li', null, 'Record in a quiet room so pauses are detected accurately.'),
        h('li', null, '1–5 minute clips give the most useful feedback.'))));

    return () => {
      disposed = true;
      if (job) job.abort();
    };
  };
})();
