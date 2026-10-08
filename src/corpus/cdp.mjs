/**
 * A minimal Chrome DevTools Protocol client.
 *
 * The pilot has to drive a real browser: server journeys, reloads, form failures, screenshots and a
 * trace. That is normally a browser-automation dependency, and the fleet's rule is to avoid installs;
 * Node 24 has a global WebSocket and /usr/bin/google-chrome is present, so this file is the whole
 * driver. It is deliberately small and explicit rather than clever - the evidence it produces is the
 * point, not the abstraction.
 *
 * Usage:
 *   const chrome = await launchChrome();
 *   const page = await chrome.newPage({ viewport: { width: 390, height: 844 } });
 *   await page.goto('http://127.0.0.1:3000/');
 *   const title = await page.evaluate('document.title');
 *   await page.screenshot('/tmp/x.png');
 *   const trace = await page.trace(async () => { ... });
 *   await chrome.close();
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export class CdpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CdpError';
    this.code = code;
  }
}

function chromeBinary() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  throw new CdpError('NO_CHROME', `no Chrome binary found (tried ${CHROME_CANDIDATES.join(', ')})`);
}

/** A single CDP connection that multiplexes one browser target and its page sessions. */
class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => this.#onMessage(event.data));
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new CdpError('CLOSED', 'the CDP connection closed'));
      this.pending.clear();
    });
  }

  #onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new CdpError('CDP_ERROR', `${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
      return;
    }
    const key = message.method;
    for (const listener of this.listeners.get(key) ?? []) listener(message.params, message.sessionId);
    for (const listener of this.listeners.get('*') ?? []) listener(message);
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError('TIMEOUT', `${method} did not answer within 30s`));
      }, 30_000);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function fetchJson(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new CdpError('NO_DEBUGGER', `${url} never answered`);
}

/**
 * Launch one headless Chrome and keep it for the whole run.
 *
 * One browser at a time is a fleet rule (the reaper kills orphans and the box has two cores), so the
 * harness reuses a single instance across projects and closes it in a finally block.
 */
export async function launchChrome({ proxy = null, args = [] } = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mwg-chrome-'));
  const binary = chromeBinary();
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
      '--force-color-profile=srgb',
      '--window-size=1280,900',
      ...(proxy ? [`--proxy-server=${proxy}`] : []),
      ...args,
      'about:blank',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so the whole tree - zygotes, gpu, network, and anything the browser spawns
      // that does not carry the profile directory on its command line - can be killed together. Killing
      // only the parent left pieces behind.
      detached: true,
    },
  );

  /** Kill the browser and everything it spawned. */
  const killTree = () => {
    child.kill('SIGKILL');
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already reaped, or never got its own group */
    }
  };
  // The other half of the detached-group bargain. Giving Chrome its own group is what lets `close()` reap
  // the crashpad handler and the rest of the tree, but it also means a signal aimed at *this* process no
  // longer reaches the browser: a harness that is terminated (a `timeout`, a reaper sweep, a stopped agent)
  // used to leave the browser running, and that is how several were orphaned. These handlers make the
  // browser go down with us. SIGKILL cannot be caught - the reaper's own browser sweep is the backstop.
  const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  // Exit with the code the shell expects for that signal. `timeout` and the fleet's gate tooling read 143
  // as "the bound killed it" - exiting 1 instead would report a killed run as an ordinary failure, which
  // is the sort of misreading that costs an hour of someone else's afternoon.
  const EXIT_FOR = { SIGTERM: 143, SIGINT: 130, SIGHUP: 129 };
  const onSignal = (signal) => {
    // Take the whole launch down now rather than let the watchdog do it on its next poll: killing only the
    // browser here left a `sleep` and the profile directory for up to five seconds, which is a window in
    // which a sweep sees an orphan.
    killTree();
    stopWatchdog();
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(EXIT_FOR[signal] ?? 1);
  };
  for (const signal of SIGNALS) process.on(signal, onSignal);
  process.on('exit', killTree);

  // A watchdog, because the signal handlers above cannot catch SIGKILL: a harness killed outright still
  // leaves the browser behind, and that is what the reaper kept finding - a review subagent's verification
  // run, gone, with a 12-process browser still holding a gigabyte. The watchdog polls this process and, the
  // moment it is gone, kills the browser's group and removes the profile. It is killed in `close()` so it
  // does not linger for a process that launches browsers one after another.
  const watchdog = spawn(
    '/bin/sh',
    ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 5; done; kill -9 -${child.pid} 2>/dev/null; rm -rf "${userDataDir}" 2>/dev/null`],
    { detached: true, stdio: 'ignore' },
  );
  watchdog.unref();

  /** Stop the watchdog, and its `sleep` child with it, so no timer outlives this launch. */
  const stopWatchdog = () => {
    try {
      // Its own group: killing only the shell leaves an in-flight `sleep 5` reparented to init.
      process.kill(-watchdog.pid, 'SIGKILL');
    } catch {
      watchdog.kill('SIGKILL');
    }
  };
  /** Undo everything this launch installed: browser tree, watchdog, signal handlers. */
  const teardown = () => {
    killTree();
    stopWatchdog();
    for (const signal of SIGNALS) process.off(signal, onSignal);
    process.off('exit', killTree);
  };

  // If Chrome never reports an endpoint - a timeout, an early exit, a refused websocket - this function
  // rejects and the caller never receives a handle, so `close()` is never reached. Without this the
  // watchdog would keep polling and the signal handlers would stay installed for the life of the process,
  // leaking exactly what the watchdog exists to prevent.
  let built;
  try {
    built = await connect();
  } catch (error) {
    teardown();
    rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }

  async function connect() {
    const endpoint = await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new CdpError('CHROME_TIMEOUT', 'Chrome did not report a debugger endpoint')), 20_000);
      const onData = (chunk) => {
        buffer += chunk.toString();
        const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stderr.on('data', onData);
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new CdpError('CHROME_EXIT', `Chrome exited early with code ${code}`));
      });
    });

    const ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new CdpError('WS_ERROR', 'could not open the CDP websocket')), { once: true });
    });
    const connection = new Connection(ws);
    return { ws, connection, version: await connection.send('Browser.getVersion') };
  }

  const { ws, connection } = built;

  return {
    version: built.version,
    async newPage({ viewport = { width: 1280, height: 900 }, mobile = false } = {}) {
      const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
      const session = { connection, sessionId, targetId };
      await connection.send('Page.enable', {}, sessionId);
      await connection.send('Runtime.enable', {}, sessionId);
      await connection.send('Network.enable', {}, sessionId);
      if (mobile) {
        await connection.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 2, mobile: true, screenWidth: viewport.width, screenHeight: viewport.height }, sessionId);
        await connection.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
      } else {
        await connection.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false }, sessionId);
      }
      return new Page(session, viewport);
    },
    async close() {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
      // Kill the whole process group, not just the browser. Chrome spawns a crashpad handler whose command
      // line carries `--database=`, not the profile directory, so `child.kill` misses it and so did a
      // kill-by-profile-dir sweep: one from a launch of ours ran 46 minutes after the browser was gone. The
      // `--disable-breakpad` and `--disable-crash-reporter` flags were tried and do not stop it on Chrome
      // 155, so the group is the only reliable handle on the pieces.
      killTree();
      stopWatchdog();
      for (const signal of SIGNALS) process.off(signal, onSignal);
      process.off('exit', killTree);
      // Wait briefly for the browser to release the profile, then remove it. The directory is created per
      // launch and was never cleaned up, so a day of runs left dozens of them (and a few hundred MB) in
      // /tmp; nothing reads it once the browser is gone, and it is ours. Retried, because a single attempt
      // lost the race against a browser that was still exiting and left the directory behind.
      await new Promise((resolve) => {
        const done = () => resolve();
        child.once('exit', done);
        setTimeout(done, 500);
      });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        rmSync(userDataDir, { recursive: true, force: true });
        if (!existsSync(userDataDir)) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    },
  };
}

export class Page {
  constructor(session, viewport) {
    this.session = session;
    this.viewport = viewport;
    this.sessionId = session.sessionId;
    this.console = [];
    this.network = [];
    this.requests = new Map();
    this.#observe();
  }

  #observe() {
    const { connection, sessionId } = this.session;
    connection.on('Runtime.consoleAPICalled', (params, sid) => {
      if (sid !== sessionId) return;
      this.console.push({ type: params.type, text: (params.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type).join(' ') });
    });
    connection.on('Runtime.exceptionThrown', (params, sid) => {
      if (sid !== sessionId) return;
      this.console.push({ type: 'exception', text: params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'unknown exception' });
    });
    connection.on('Network.requestWillBeSent', (params, sid) => {
      if (sid !== sessionId) return;
      this.requests.set(params.requestId, { url: params.request.url, method: params.request.method, status: null });
    });
    connection.on('Network.responseReceived', (params, sid) => {
      if (sid !== sessionId) return;
      const entry = this.requests.get(params.requestId) ?? { url: params.response.url, method: 'GET' };
      entry.status = params.response.status;
      entry.headers = params.response.headers;
      this.requests.set(params.requestId, entry);
      this.network.push(entry);
    });
  }

  send(method, params) {
    return this.session.connection.send(method, params, this.sessionId);
  }

  /**
   * Navigate and wait until the new document is actually there.
   *
   * The first version resolved on the load event filtered by a main-frame id that was never set, so
   * the listener never fired and every navigation fell through to its timeout - and, worse, a stale
   * listener could resolve early, leaving the next assertion running against the *previous* page. That
   * is exactly how the rule checks came to report "no primary field found" on a page that has one.
   * Waiting on observable state (URL, readyState) instead of an event removes the race.
   */
  async goto(url, { timeout = 15_000 } = {}) {
    await this.send('Page.navigate', { url });
    const started = Date.now();
    for (;;) {
      const state = await this.evaluate(`
        return { href: location.href, ready: document.readyState };
      `);
      if (state.href === url && state.ready === 'complete') return state.ready;
      if (Date.now() - started > timeout) {
        const settled = await this.evaluate('return location.href');
        throw new CdpError('NAVIGATION_TIMEOUT', `navigation to ${url} did not complete within ${timeout}ms (now at ${settled})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }

  /**
   * Trusted input, driven through the browser's input pipeline.
   *
   * This is not a nicety. `:user-invalid` (and therefore any honest check of "does the field report
   * only after the user has interacted") does not flip for `dispatchEvent(new Event('input'))`: a
   * synthetic event is not user interaction, so a page that reports correctly looked broken and a page
   * that styled `:invalid` eagerly looked correct. Anything the vector asserts about user-facing state
   * is driven through here.
   */
  async realType(selector, text) {
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('realType: no element for ' + ${JSON.stringify(selector)});
      el.focus();
      return 1;
    `);
    await this.send('Input.insertText', { text });
  }

  /** One trusted key press. */
  async realKey(key) {
    const codes = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40 };
    const params = { key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }

  /** Type into a field, delete it, and leave the field the way a user leaves a required field empty. */
  async touchEmpty(selector) {
    await this.realType(selector, 'x');
    await this.realKey('Backspace');
    await this.realKey('Tab');
  }

  /** Wait until a selector matches, so a check never runs against a page that has not rendered yet. */
  async waitFor(selector, { timeout = 10_000 } = {}) {
    const started = Date.now();
    for (;;) {
      const found = await this.evaluate(`return Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (found) return true;
      if (Date.now() - started > timeout) throw new CdpError('WAIT_TIMEOUT', `${selector} never appeared within ${timeout}ms`);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      // An async wrapper, resolved by awaitPromise below: a check that needs to fetch from the page
      // (the write journey does) cannot use await inside a plain arrow function.
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new CdpError('EVAL_FAILED', exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  async click(selector) {
    const clicked = await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found' };
      el.click();
      return { ok: true, tag: el.tagName };
    `);
    if (!clicked?.ok) throw new CdpError('CLICK_FAILED', `click(${selector}) failed: ${clicked?.reason}`);
    await this.#settle();
    return clicked;
  }

  async type(selector, value) {
    const typed = await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found' };
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, name: el.name };
    `);
    if (!typed?.ok) throw new CdpError('TYPE_FAILED', `type(${selector}) failed: ${typed?.reason}`);
    return typed;
  }

  async submit(selector) {
    // Submitting usually navigates the document, and the reply to the evaluate that *caused* the
    // navigation can come back as "Inspected target navigated or closed". That is the expected result
    // of a submit, not a failure - treating it as one made a working form look unrunnable.
    const result = await this.evaluate(`
      const form = document.querySelector(${JSON.stringify(selector)});
      if (!form) return { ok: false, reason: 'not found' };
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
      return { ok: true, valid: form.checkValidity ? form.checkValidity() : null };
    `).catch((error) => {
      if (/navigated or closed/i.test(error.message)) return { ok: true, valid: null, navigated: true };
      throw error;
    });
    if (!result?.ok) throw new CdpError('SUBMIT_FAILED', `submit(${selector}) failed: ${result?.reason}`);
    await this.waitForSettled();
    return result;
  }

  /** Wait until the document is complete and has been quiet for a moment. */
  async waitForSettled({ timeout = 10_000, quiet = 150 } = {}) {
    const started = Date.now();
    for (;;) {
      let ready = null;
      try {
        ready = await this.evaluate('return document.readyState');
      } catch {
        ready = null;
      }
      if (ready === 'complete') {
        await new Promise((resolve) => setTimeout(resolve, quiet));
        return true;
      }
      if (Date.now() - started > timeout) return false;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  /** Wait for the page to stop changing: two animation frames plus a short quiet period. */
  async #settle(ms = 150) {
    try {
      await this.evaluate('return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
    } catch {
      /* the document navigated under us, which the caller already handles */
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async url() {
    const { result } = await this.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    return result.value;
  }

  async title() {
    const { result } = await this.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    return result.value;
  }

  async cookies() {
    const { cookies } = await this.send('Network.getCookies', { urls: [await this.url()] });
    return cookies;
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  /** Full-page HTML snapshot, used for evidence and for the static rule checks. */
  async content() {
    const { result } = await this.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true });
    return result.value;
  }

  /**
   * Record a Chrome trace around `fn`. The trace is the artefact that shows the journey actually
   * happened (navigations, layout, paint) rather than being asserted after the fact.
   */
  async trace(fn, { categories = ['devtools.timeline', 'blink.user_timing', 'loading', 'v8.execute'], path = null } = {}) {
    const collected = [];
    const listener = (params) => {
      for (const event of params.value ?? []) collected.push(event);
    };
    this.session.connection.on('Tracing.dataCollected', listener);
    await this.send('Tracing.start', { categories: categories.join(','), transferMode: 'ReportEvents' });
    try {
      await fn();
    } finally {
      const done = new Promise((resolve) => this.session.connection.on('Tracing.tracingComplete', resolve));
      await this.send('Tracing.end');
      await done;
    }
    const trace = { traceEvents: collected };
    if (path) writeFileSync(path, JSON.stringify(trace));
    return { path, events: collected.length, traceEvents: collected };
  }

  async close() {
    try {
      await this.session.connection.send('Target.closeTarget', { targetId: this.session.targetId });
    } catch {
      /* the browser may already be gone */
    }
  }
}
