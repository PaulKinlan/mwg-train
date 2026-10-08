// Capture and flow schemas (capture bead mwg-train-c0u).
//
// A capture is EVIDENCE about a third-party site and is quarantined (arm A5). A flow is a recorded sequence of
// real interactions against that site, and it reuses the carried-state rule added by mwg-train-4cy so a captured
// flow can be replayed by the existing journey driver without a second, parallel notion of a step.
//
// Both validators are FAIL-CLOSED and return every problem rather than the first. They deliberately check the
// STRUCTURE of the input before anything downstream hashes or trusts it: a check that hashes a malformed record
// is a check that certifies nothing.

export const CAPTURE_VERSION = 1;
export const FLOW_VERSION = 1;

// Capturing a third-party site and re-implementing it are both quarantined activities. Nothing here may claim a
// trainable or public arm: A1/A6 belong to this repo's own authored corpora, whose manifests forbid third-party
// material outright.
export const CAPTURE_ARMS = ['A5_black_box_reproduction', 'A4_clean_room_reproduction'];

// Control types a capture may record. This mirrors the field types the seven framework generators can actually
// render, so a captured control that cannot be expressed is reported as a problem here rather than silently
// dropped by a translator later.
export const CONTROL_TYPES = ['text', 'email', 'tel', 'url', 'search', 'password', 'number', 'date', 'time', 'textarea', 'select', 'checkbox', 'radio', 'submit', 'hidden'];

// Actions a recorded step may take. `goto` is only legal as a step that navigates without touching a control;
// `click` exists because a real flow often has to click a link or button that is not a form submission.
export const FLOW_ACTIONS = ['goto', 'fill', 'select', 'click', 'submit'];

const isString = (v) => typeof v === 'string';
const isNonEmpty = (v) => isString(v) && v.trim().length > 0;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isAbsolutePath = (v) => isString(v) && v.startsWith('/') && !v.startsWith('//') && !v.includes('..');
const isSha256 = (v) => isString(v) && /^[0-9a-f]{64}$/.test(v);
const isHttpUrl = (v) => isString(v) && /^https?:\/\//.test(v) && !v.includes(' ');

// A control name is round-tripped into generated markup as name="<name>". A name that cannot survive that raw
// interpolation is refused here rather than escaped later, because the generators build selectors and form
// payload keys from it.
const NAME_SAFE = /^[A-Za-z][A-Za-z0-9_-]*$/;

// A step target must name exactly ONE complete element, e.g. `input[name=email]` or `form#checkout`. Partial or
// ambiguous selectors are how a driver ends up typing into the wrong thing - the failure that cost mwg-train-4cy
// a full diagnostic round when a read page carried two elements with the same name.
const SELECTOR = /^(?:(?:form|input|select|textarea|button|a)#[A-Za-z][A-Za-z0-9_-]*|(?:form|input|select|textarea|button|a)\[name=[A-Za-z][A-Za-z0-9_-]*\])$/;

export function validateCapture(capture) {
  const problems = [];
  const fail = (path, message) => problems.push(`${path}: ${message}`);

  if (!isObject(capture)) return ['capture: must be an object'];
  if (capture.capture_version !== CAPTURE_VERSION) fail('capture.capture_version', `must be ${CAPTURE_VERSION}`);
  if (!isObject(capture.source)) fail('capture.source', 'must be an object');
  else {
    const s = capture.source;
    if (!isHttpUrl(s.url)) fail('capture.source.url', 'must be an http(s) URL without spaces');
    if (!isHttpUrl(s.final_url)) fail('capture.source.final_url', 'must be an http(s) URL without spaces');
    if (!isNonEmpty(s.captured_at)) fail('capture.source.captured_at', 'must be a non-empty timestamp');
    // Rights is not decoration: reaching a third-party site may breach its terms, and the repo's rights record
    // for reproduction studies says so. A capture with no rights reference is refused rather than stored.
    if (!isNonEmpty(s.rights_ref)) fail('capture.source.rights_ref', 'must name the rights record authorising this capture');
    if (!CAPTURE_ARMS.includes(s.arm)) fail('capture.source.arm', `must be one of ${CAPTURE_ARMS.join(', ')}`);
  }

  if (!isObject(capture.viewport)) fail('capture.viewport', 'must be an object');
  else {
    for (const key of ['width', 'height']) {
      const n = capture.viewport[key];
      if (!Number.isInteger(n) || n <= 0) fail(`capture.viewport.${key}`, 'must be a positive integer');
    }
    const dsf = capture.viewport.device_scale_factor;
    if (typeof dsf !== 'number' || !(dsf > 0)) fail('capture.viewport.device_scale_factor', 'must be a positive number');
  }

  const pages = capture.pages;
  if (!Array.isArray(pages) || pages.length === 0) fail('capture.pages', 'must be a non-empty array');
  else {
    const seen = new Set();
    pages.forEach((page, i) => {
      const at = `capture.pages[${i}]`;
      if (!isObject(page)) return fail(at, 'must be an object');
      if (!isAbsolutePath(page.path)) fail(`${at}.path`, 'must be an absolute path with no .. segment');
      else if (seen.has(page.path)) fail(`${at}.path`, `duplicate path ${page.path}`);
      else seen.add(page.path);
      if (!isString(page.title)) fail(`${at}.title`, 'must be a string');
      for (const key of ['landmarks', 'headings', 'nav']) {
        if (!Array.isArray(page[key])) fail(`${at}.${key}`, 'must be an array');
      }
      if (!isString(page.text_excerpt)) fail(`${at}.text_excerpt`, 'must be a string');

      if (!Array.isArray(page.forms)) fail(`${at}.forms`, 'must be an array');
      else page.forms.forEach((form, fi) => {
        const fat = `${at}.forms[${fi}]`;
        if (!isObject(form)) return fail(fat, 'must be an object');
        if (!isString(form.action)) fail(`${fat}.action`, 'must be a string');
        if (form.method !== 'get' && form.method !== 'post') fail(`${fat}.method`, 'must be "get" or "post"');
        if (!Array.isArray(form.controls) || form.controls.length === 0) fail(`${fat}.controls`, 'must be a non-empty array');
        else form.controls.forEach((control, ci) => {
          const cat = `${fat}.controls[${ci}]`;
          if (!isObject(control)) return fail(cat, 'must be an object');
          if (!NAME_SAFE.test(control.name ?? '')) fail(`${cat}.name`, 'must be usable as name="<name>" in generated markup');
          if (!CONTROL_TYPES.includes(control.type)) fail(`${cat}.type`, `must be one of ${CONTROL_TYPES.join(', ')}`);
          if (typeof control.required !== 'boolean') fail(`${cat}.required`, 'must be a boolean');
          if (control.label !== undefined && !isString(control.label)) fail(`${cat}.label`, 'must be a string when present');
          if (control.options !== undefined && !Array.isArray(control.options)) fail(`${cat}.options`, 'must be an array when present');
          if (control.type === 'select' && !Array.isArray(control.options)) fail(`${cat}.options`, 'a select must record its options');
        });
      });

      if (!Array.isArray(page.links)) fail(`${at}.links`, 'must be an array');
      else page.links.forEach((link, li) => {
        const lat = `${at}.links[${li}]`;
        if (!isObject(link)) return fail(lat, 'must be an object');
        if (!isNonEmpty(link.href)) fail(`${lat}.href`, 'must be a non-empty string');
        if (!isString(link.text)) fail(`${lat}.text`, 'must be a string');
      });
    });
  }

  // Assets are the raw, quarantined bytes. Their relative paths must stay inside the store - an absolute path or
  // a .. segment would let a capture write outside the quarantine root.
  if (!isObject(capture.assets)) fail('capture.assets', 'must be an object');
  else for (const key of ['desktop_screenshot', 'mobile_screenshot', 'dom']) {
    const asset = capture.assets[key];
    const at = `capture.assets.${key}`;
    if (!isObject(asset)) { fail(at, 'must be an object'); continue; }
    if (!isNonEmpty(asset.rel_path)) fail(`${at}.rel_path`, 'must be a non-empty relative path');
    else if (asset.rel_path.startsWith('/') || asset.rel_path.includes('..')) fail(`${at}.rel_path`, 'must be relative and contain no .. segment');
    if (!isSha256(asset.sha256)) fail(`${at}.sha256`, 'must be a lowercase 64-hex sha256');
    if (!Number.isInteger(asset.bytes) || asset.bytes <= 0) fail(`${at}.bytes`, 'must be a positive integer');
  }

  for (const key of ['console', 'requests']) {
    if (!Array.isArray(capture[key])) fail(`capture.${key}`, 'must be an array');
  }
  if (Array.isArray(capture.requests)) capture.requests.forEach((r, i) => {
    const at = `capture.requests[${i}]`;
    if (!isObject(r)) return fail(at, 'must be an object');
    if (!isNonEmpty(r.url)) fail(`${at}.url`, 'must be a non-empty string');
    if (!isNonEmpty(r.method)) fail(`${at}.method`, 'must be a non-empty string');
    if (r.status !== undefined && r.status !== null && !Number.isInteger(r.status)) fail(`${at}.status`, 'must be an integer or null when present');
  });

  return problems;
}

export function validateFlow(flow) {
  const problems = [];
  const fail = (path, message) => problems.push(`${path}: ${message}`);

  if (!isObject(flow)) return ['flow: must be an object'];
  if (flow.flow_version !== FLOW_VERSION) fail('flow.flow_version', `must be ${FLOW_VERSION}`);
  if (!isObject(flow.source)) fail('flow.source', 'must be an object');
  else {
    if (!isHttpUrl(flow.source.url)) fail('flow.source.url', 'must be an http(s) URL without spaces');
    if (!isNonEmpty(flow.source.rights_ref)) fail('flow.source.rights_ref', 'must name the rights record authorising this recording');
    if (!isNonEmpty(flow.source.captured_at)) fail('flow.source.captured_at', 'must be a non-empty timestamp');
  }
  if (!isAbsolutePath(flow.start_path)) fail('flow.start_path', 'must be an absolute path with no .. segment');

  const steps = flow.steps;
  if (!Array.isArray(steps) || steps.length === 0) return [...problems, 'flow.steps: must be a non-empty array'];

  // Every value an earlier step supplied, so a later step may legitimately expect to see it. This is the
  // carried-state rule from the journey schema: an expectText nothing supplied is a claim about the page that the
  // recording never established.
  const carried = new Set();
  steps.forEach((step, i) => {
    const at = `flow.steps[${i}]`;
    if (!isObject(step)) return fail(at, 'must be an object');
    if (step.index !== i) fail(`${at}.index`, `must be ${i}`);
    if (!isAbsolutePath(step.path)) fail(`${at}.path`, 'must be an absolute path with no .. segment');
    if (!FLOW_ACTIONS.includes(step.action)) fail(`${at}.action`, `must be one of ${FLOW_ACTIONS.join(', ')}`);

    if (step.action === 'fill' || step.action === 'select') {
      if (!SELECTOR.test(step.target ?? '')) fail(`${at}.target`, 'must name exactly one complete element, e.g. input[name=email] or form#checkout');
      if (!isNonEmpty(step.value)) fail(`${at}.value`, 'must be a non-empty string for fill/select');
      else carried.add(step.value);
    }
    if (step.action === 'click' || step.action === 'submit') {
      if (!SELECTOR.test(step.target ?? '')) fail(`${at}.target`, 'must name exactly one complete element, e.g. button#pay or form#checkout');
    }
    if (step.expectText !== undefined) {
      if (!isNonEmpty(step.expectText)) fail(`${at}.expectText`, 'must be a non-empty string when present');
      else if (!carried.has(step.expectText)) fail(`${at}.expectText`, 'must be a value an earlier step supplied - a recording cannot assert text it never entered');
    }
    if (step.expected_path !== undefined && !isAbsolutePath(step.expected_path)) {
      fail(`${at}.expected_path`, 'must be an absolute path with no .. segment when present');
    }
  });

  return problems;
}

// Names a step may not use, because the generator reserves them for its own bookkeeping or because recording one
// would let a captured flow claim to have set the record reference.
export function isReservedControlName(name) {
  return ['ref', 'created_at', 'id'].includes(String(name));
}
