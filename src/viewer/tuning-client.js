/* Owner-only prompt drafting, and one deliberately-loud exception: the generate button at the bottom of this file posts
   the draft to /tuning/generate, which asks the hosted image model for a board and returns the bytes. Everything else
   here stays in the browser. That call writes no file anywhere, and every failure is reported as a failure - never as a
   placeholder image. */
const form = document.querySelector('#tuning-draft');
if (form) {
  const status = document.querySelector('#draft-status');
  const preview = document.querySelector('#draft-json');
  const livePrompt = document.querySelector('#live-draft-text');
  const draftBadge = document.querySelector('#draft-badge');
  const wordCountPill = document.querySelector('#draft-word-count');
  const deltaPill = document.querySelector('#draft-delta-pill');
  const tempPill = document.querySelector('#draft-temp-pill');
  const tokensPill = document.querySelector('#draft-tokens-pill');
  const seedPill = document.querySelector('#draft-seed-pill');

  const key = `mwg-train:tuning:${form.dataset.briefId}:${form.dataset.framework}`;
  const initial = Object.fromEntries(new FormData(form));
  const values = () => Object.fromEntries(new FormData(form));
  const payload = () => {
    const draft = values();
    return {
      schema_version: 1,
      status: 'local-unapproved-draft',
      brief_id: form.dataset.briefId,
      framework: form.dataset.framework,
      source_prompt: initial.prompt,
      prompt: draft.prompt,
      system_guidance: draft.system_guidance,
      settings: {
        temperature: Number(draft.temperature),
        max_tokens: Number(draft.max_tokens),
        seed: Number(draft.seed),
      },
    };
  };

  const countWords = (text) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  const initialWords = countWords(initial.prompt);

  const setStatus = (message) => { status.textContent = message; };

  const updateLivePreview = () => {
    const current = values();
    if (livePrompt) {
      livePrompt.textContent = current.prompt;
    }
    const currentWords = countWords(current.prompt);
    if (wordCountPill) {
      wordCountPill.textContent = `${currentWords} words · ${current.prompt.length} chars`;
    }
    const isModified = current.prompt !== initial.prompt;
    if (deltaPill) {
      if (!isModified) {
        deltaPill.textContent = 'Identical to authored voice';
      } else {
        const delta = currentWords - initialWords;
        deltaPill.textContent = `${delta >= 0 ? '+' : ''}${delta} words vs authored`;
      }
    }
    if (draftBadge) {
      draftBadge.textContent = isModified ? 'MODIFIED LOCAL DRAFT · UNAPPROVED' : 'LOCAL DRAFT · UNAPPROVED';
    }
    if (tempPill) tempPill.textContent = `Temp: ${current.temperature}`;
    if (tokensPill) tokensPill.textContent = `Max tokens: ${current.max_tokens}`;
    if (seedPill) seedPill.textContent = `Seed: ${current.seed}`;
  };

  const refresh = () => {
    preview.value = JSON.stringify(payload(), null, 2);
    updateLivePreview();
  };

  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      for (const name of Object.keys(initial)) {
        const control = form.elements.namedItem(name);
        if (control && Object.hasOwn(saved, name) && typeof saved[name] === 'string') control.value = saved[name];
      }
      setStatus(saved.source_prompt === initial.prompt
        ? 'Restored a browser-local draft based on this authored prompt.'
        : 'Restored a draft from an earlier or unknown brief revision. Compare the authored prompt before export.');
    }
  } catch {
    setStatus('Browser storage is unavailable; you can still edit and export this draft.');
  }

  refresh();

  form.addEventListener('input', () => {
    refresh();
    try { localStorage.setItem(key, JSON.stringify({ ...values(), source_prompt: initial.prompt })); }
    catch { setStatus('Browser storage is unavailable; export the draft to keep it.'); }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    refresh();
    const blob = new Blob([`${preview.value}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.dataset.briefId}-${form.dataset.framework}-draft.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Downloaded an unapproved draft JSON file. No corpus files were changed.');
  });

  document.querySelector('#copy-draft').addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    refresh();
    try {
      await navigator.clipboard.writeText(preview.value);
      setStatus('Copied the unapproved draft JSON to the clipboard.');
    } catch {
      setStatus('Clipboard access is unavailable. Select and copy the export preview below instead.');
    }
  });

  document.querySelector('#reset-draft').addEventListener('click', () => {
    for (const [name, value] of Object.entries(initial)) form.elements.namedItem(name).value = value;
    try { localStorage.removeItem(key); } catch { /* Still reset the visible draft. */ }
    refresh();
    // Assigning `.value` programmatically fires no `input` event, so without this the stale-board notice below would not
    // run: a board generated from an edited prompt would sit next to the restored authored prompt with nothing saying
    // the two do not belong together. That is the exact confusion the notice exists to prevent.
    form.dispatchEvent(new Event('input', { bubbles: true }));
    setStatus('Restored the authored prompt and default settings locally.');
  });

  /* --- Generate a board from the draft: the only hosted model call in this file ---

     The button posts the live draft, the server asks the image model, and the board comes back as bytes to this
     page. Nothing is stored server-side, so the board lives only in this tab until it is downloaded, and the UI says
     so. A failure replaces the board area with the reason: there is no code path here that shows an image the model
     did not return. */
  const generateButton = document.querySelector('#generate-board');
  if (generateButton) {
    const boardStatus = document.querySelector('#board-status');
    const boardNotes = document.querySelector('#board-notes');
    const boardSummary = document.querySelector('#board-summary');
    const boardResult = document.querySelector('#board-result');
    const boardMeta = document.querySelector('#board-meta');
    const boardActions = document.querySelector('#board-result-actions');
    const boardDownload = document.querySelector('#board-download');

    let boardUrl = null;
    let running = false;

    const sayBoard = (message, tone) => {
      boardStatus.textContent = message;
      boardStatus.classList.toggle('danger', tone === 'danger');
    };

    const setBoardMeta = (pairs) => {
      boardMeta.replaceChildren(...pairs.map(([label, value]) => {
        const item = document.createElement('li');
        item.className = 'chip';
        item.textContent = `${label}: ${value}`;
        return item;
      }));
      boardMeta.hidden = pairs.length === 0;
    };

    const showBoardFailure = (summary) => {
      if (boardUrl) URL.revokeObjectURL(boardUrl);
      boardUrl = null;
      boardResult.className = 'board-frame board-empty';
      const paragraph = document.createElement('p');
      paragraph.className = 'danger';
      paragraph.textContent = summary;
      boardResult.replaceChildren(paragraph);
      boardSummary.textContent = 'no board: the last attempt failed';
      boardMeta.hidden = true;
      boardMeta.replaceChildren();
      boardNotes.hidden = true;
      boardNotes.replaceChildren();
      boardActions.hidden = true;
      boardDownload.removeAttribute('href');
    };

    // A board left on screen next to a prompt it was not generated from is worse than no board, so any edit after a
    // successful generation says the board is stale rather than letting the two be read as a pair.
    form.addEventListener('input', () => {
      if (boardUrl && boardStatus.dataset.state === 'ready') {
        boardStatus.dataset.state = 'stale';
        sayBoard('The draft changed since this board was generated; press Generate again to see the current prompt.');
      }
    });

    generateButton.addEventListener('click', async () => {
      if (running) return;
      if (!form.reportValidity()) return;
      refresh();
      const live = values();
      const request = {
        schema_version: 1,
        brief_id: form.dataset.briefId,
        framework: form.dataset.framework,
        prompt: live.prompt,
        system_guidance: live.system_guidance ?? '',
        settings: {
          temperature: Number(live.temperature),
          max_tokens: Number(live.max_tokens),
          seed: Number(live.seed),
        },
      };
      running = true;
      generateButton.disabled = true;
      generateButton.setAttribute('aria-busy', 'true');
      boardStatus.dataset.state = 'running';
      sayBoard('Asking the hosted image model for a board... this takes about 15 seconds and every press is a billed call. Leave this page open.');
      try {
        const response = await fetch('/tuning/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (!response.ok) {
          let code = `HTTP ${response.status}`;
          let detail = 'the workbench did not say why';
          try {
            const failure = await response.json();
            code = failure.error ?? code;
            detail = failure.message ?? detail;
          } catch { /* A non-JSON error body is reported as the status alone. */ }
          showBoardFailure(`${code}: ${detail}`);
          boardStatus.dataset.state = 'failed';
          sayBoard(`Generation failed (${code}). ${detail}`, 'danger');
          return;
        }
        const blob = await response.blob();
        if (blob.size === 0) {
          showBoardFailure('The workbench returned an empty image response.');
          boardStatus.dataset.state = 'failed';
          sayBoard('Generation failed: the response carried no bytes.', 'danger');
          return;
        }
        const header = (name) => response.headers.get(name) ?? '';
        const width = Number(header('x-mwg-width'));
        const height = Number(header('x-mwg-height'));
        const ratio = width > 0 && height > 0 ? width / height : null;
        const widescreen = ratio !== null && ratio >= 1.75 && ratio <= 1.8;
        if (boardUrl) URL.revokeObjectURL(boardUrl);
        boardUrl = URL.createObjectURL(blob);
        const image = document.createElement('img');
        image.src = boardUrl;
        image.alt = `Generated design board for ${form.dataset.briefId}`;
        if (width > 0) image.width = width;
        if (height > 0) image.height = height;
        boardResult.className = 'board-frame';
        boardResult.replaceChildren(image);
        setBoardMeta([
          ['model', header('x-mwg-model')],
          ['bytes', String(blob.size)],
          ['dimensions', width > 0 && height > 0 ? `${width} x ${height}` : 'unmeasured'],
          ['ratio', ratio === null ? 'unmeasured' : `${ratio.toFixed(3)}${widescreen ? ' - widescreen contract' : ' - NOT the authored 1.75-1.80 contract'}`],
          ['image sha256', header('x-mwg-sha256').slice(0, 16)],
          ['prompt sha256', header('x-mwg-prompt-sha256').slice(0, 16)],
          ['elapsed', `${header('x-mwg-elapsed-ms')} ms`],
          ['finish reason', header('x-mwg-finish-reason') || 'unrecorded'],
          ['max output tokens', `${header('x-mwg-max-output-tokens')} (requested ${header('x-mwg-requested-max-output-tokens')})`],
        ]);
        boardSummary.textContent = width > 0 && height > 0 ? `${width} x ${height} from ${header('x-mwg-model')}` : `from ${header('x-mwg-model')}`;
        boardActions.hidden = false;
        boardDownload.href = boardUrl;
        boardDownload.download = `${form.dataset.briefId}-${form.dataset.framework}-board-${header('x-mwg-sha256').slice(0, 8)}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
        const notes = decodeURIComponent(header('x-mwg-notes') || '').split(' | ').map((note) => note.trim()).filter(Boolean);
        boardNotes.replaceChildren(...notes.map((note) => {
          const item = document.createElement('li');
          item.textContent = note;
          return item;
        }));
        boardNotes.hidden = notes.length === 0;
        boardStatus.dataset.state = 'ready';
        sayBoard(`Generated ${width} x ${height} with ${header('x-mwg-model')} in ${header('x-mwg-elapsed-ms')} ms. Nothing was written to this repository - download the board if you want to keep a copy.`);
      } catch (error) {
        showBoardFailure(`The generation request could not be completed: ${error.message}`);
        boardStatus.dataset.state = 'failed';
        sayBoard(`Generation failed: ${error.message}`, 'danger');
      } finally {
        running = false;
        generateButton.disabled = false;
        generateButton.removeAttribute('aria-busy');
      }
    });

    // The board is an object URL in this tab; release it when the page goes away rather than leaving the bytes pinned.
    globalThis.addEventListener('pagehide', () => { if (boardUrl) URL.revokeObjectURL(boardUrl); });
  }
}
