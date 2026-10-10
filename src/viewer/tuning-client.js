/* Owner-only prompt drafting. No network requests, model calls or tracked file writes. */
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
    setStatus('Restored the authored prompt and default settings locally.');
  });
}
