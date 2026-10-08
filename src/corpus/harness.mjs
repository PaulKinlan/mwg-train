/**
 * The pilot harness: run one project the way the acceptance gate needs it run.
 *
 * For a project it:
 *   1. starts the server on a free port with a fresh SQLite file (server persistence must be real),
 *   2. drives the declared journeys in a real browser: POST → redirect → reload, a validation
 *      failure, and whatever the archetype declares,
 *   3. captures evidence: screenshots (desktop and mobile), a Chrome trace, console errors, the
 *      network log, the response headers of the session-setting response,
 *   4. runs the fixed measurement vector from rules.mjs against the rendered page,
 *   5. writes one record per project per version.
 *
 * It never asserts on source code. Everything it reports is something the browser observed, because
 * the whole point of the pilot is that a tidy diff is not evidence that a site works.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { RULES, SECURITY_CHECKS } from './rules.mjs';

const READY_TIMEOUT_MS = 20_000;

/** Start a project's server and wait for it to answer. */
async function startServer(projectDir, { port, dbPath }) {
  const child = spawn(process.execPath, [join(projectDir, 'server.mjs'), '--port', String(port), '--db', dbPath], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', PILOT_PORT: String(port) },
  });
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return { child, log: () => log };
    } catch {
      /* keep waiting */
    }
    await delay(120);
  }
  child.kill('SIGKILL');
  throw new Error(`server did not become ready in ${READY_TIMEOUT_MS}ms:\n${log}`);
}

async function stopServer(server) {
  if (!server?.child) return;
  server.child.kill('SIGTERM');
  await delay(150);
  if (!server.child.killed) server.child.kill('SIGKILL');
}

/** One journey: the archetype's server-persistence flow, driven for real. */
async function driveJourney(page, base, journey) {
  const kind = journey.kind ?? 'post-redirect-reload';
  const steps = [];
  const record = (name, detail) => steps.push({ step: name, ...detail });
  await page.goto(`${base}${journey.startPath}`);
  const opened = await page.url();
  // The status of the document itself, not of whatever request finished last (a missing favicon is
  // the usual last request, and reporting its 404 as the page status hid a real page failure once).
  record('open', { url: opened, status: page.network.find((entry) => entry.url === opened)?.status ?? null });

  if (journey.fill) {
    for (const [selector, value] of Object.entries(journey.fill)) await page.type(selector, value);
    record('fill', { fields: Object.keys(journey.fill) });
  }
  const submit = await page.submit(journey.formSelector ?? 'form');
  const afterSubmit = await page.url();
  record('submit', {
    url: afterSubmit,
    status: page.network.filter((entry) => entry.url === afterSubmit).at(-1)?.status ?? null,
    // The method matters: a GET form is a different server journey from a POST that redirects, and the
    // pilot covers both rather than assuming every archetype submits the same way.
    method: kind === 'get-query-reload' ? 'GET' : 'POST',
    valid: submit.valid,
  });

  // Server persistence: a reload of the same URL must still show the record. This is the clause that
  // separates a real server journey from a client-side illusion.
  await page.goto(afterSubmit);
  // The echoed value arrives from the JSON endpoint after the page loads, so waiting for the container
  // is part of the assertion: reading too early reported a working server as a broken flow.
  try {
    await page.waitFor('#record-echo', { timeout: 5000 });
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const text = await page.evaluate("return document.getElementById('record-echo')?.innerText ?? ''");
      if (text.trim() !== '') break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  } catch {
    /* the container is absent; the record below is what reports it */
  }
  const persisted = await page.evaluate(`return { url: location.href, text: document.body.innerText, echoed: document.getElementById('record-echo')?.innerText ?? '' }`);
  record('reload', { url: persisted.url, textLength: persisted.text.length, echoed: persisted.echoed.slice(0, 120) });

  return { steps, afterSubmit, persistedText: persisted.text, echoedText: persisted.echoed };
}

/** Ask the server what it has answered so far. */
async function readServerLog(page) {
  const observed = await page.evaluate(`
    const response = await fetch('/__requests');
    return { status: response.status, body: (await response.text()).slice(0, 4000) };
  `);
  if (observed.status !== 200) return null;
  try {
    const parsed = JSON.parse(observed.body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The write journey: a POST that makes the server store something, and a read that proves it is there.
 *
 * The catalogue archetype's own journey is a reflected query, which is a real server journey but not a
 * write; without this, the pilot's claim that every project persists to the database would have been
 * true of twenty-four of them, and the one exception would have gone unstated.
 */
async function driveWriteJourney(page, base, writeJourney) {
  await page.goto(`${base}${writeJourney.startPath}`);
  // Unique per attempt. With a fixed value, a row already in the database satisfies the read-back and
  // the journey reports a successful write that never happened.
  const unique = `part-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fill = { ...(writeJourney.fill ?? {}) };
  if (writeJourney.itemField) fill[writeJourney.itemField] = unique;
  for (const [selector, value] of Object.entries(fill)) await page.type(selector, value);
  // How many requests the server had already answered. Without this, a POST made by an earlier journey
  // for an archetype that writes on its persistence path would satisfy this check, and the write would
  // be "observed" by a request this journey never made.
  const before = await readServerLog(page);
  if (before === null) throw new Error('the server did not expose its request log before the write journey');
  const submit = await page.submit(writeJourney.formSelector);
  const landed = await page.url();
  const landedEntry = page.network.filter((entry) => entry.url === landed).at(-1) ?? null;
  const landedStatus = landedEntry?.status ?? null;
  // The POST is observed by the SERVER, not by the browser. The browser's network log did not report
  // the form POST at all, so the status was being read off the page the POST redirected to: the claim
  // "the POST succeeded" was made without a POST ever being seen. The server that stored the row is the
  // witness for the write, and if its log has no matching POST then this is not a write we can claim.
  const action = await page.evaluate(`
    const form = document.querySelector(${JSON.stringify(writeJourney.formSelector)});
    return form ? form.getAttribute('action') : null;
  `);
  const serverRequests = await readServerLog(page);
  if (serverRequests === null) throw new Error('the server did not expose its request log after the write journey');
  // Only entries the server recorded after the baseline count: this journey's own POST, or nothing.
  const postEntry = serverRequests
    .map((entry, index) => ({ ...entry, index }))
    .find((entry) => entry.index >= before.length && entry.method === 'POST' && entry.path === action) ?? null;
  const status = postEntry?.status ?? null;
  // Read it back from the server rather than from the page: the question is whether the value was
  // stored, and the page could be showing it from anywhere.
  const stored = await page.evaluate(`
    const response = await fetch(${JSON.stringify(writeJourney.readPath)});
    return { status: response.status, body: (await response.text()).slice(0, 2000) };
  `);
  const browserRequests = page.network
    .filter((entry) => entry.method === 'POST' || entry.url.includes('cart') || entry.url.includes('/api/records'))
    .map((entry) => ({ method: entry.method, status: entry.status, url: entry.url }));
  return {
    name: 'write-journey',
    action,
    serverRequests: serverRequests.slice(-8),
    browserRequests,
    landed,
    status,
    valid: submit?.valid ?? null,
    readStatus: stored.status,
    landedStatus,
    // Observed by the server, and only then a pass: no matching entry means the write was not seen.
    postedMethod: postEntry?.method ?? null,
    postedUrl: action,
    postStatus: postEntry?.status ?? null,
    posted: postEntry !== null && postEntry.status >= 200 && postEntry.status < 400,
    submittedValue: unique,
    persisted: stored.status === 200 && stored.body.includes(unique),
    observedLength: stored.body.length,
  };
}

/** The validation-failure path: submitting an empty form must not silently succeed. */
async function driveValidationFailure(page, base, journey) {
  await page.goto(`${base}${journey.startPath}`);
  const beforeUrl = await page.url();
  const before = page.network.length;
  // Leave the field the way a user does before submitting an incomplete form, so the browser's own
  // validation is what is being observed rather than a synthetic submit.
  const primary = Object.keys(journey.fill ?? {})[0];
  if (primary) {
    try {
      await page.touchEmpty(primary);
    } catch {
      /* a project without that field is reported by the checks, not by the journey */
    }
  }
  await page.submit(journey.formSelector ?? 'form');
  await delay(250);
  const url = await page.url();
  const validation = await page.evaluate(`
    const form = document.querySelector(${JSON.stringify(journey.formSelector ?? 'form')});
    const invalid = [...(form?.elements ?? [])].filter((el) => el.willValidate && !el.checkValidity());
    return {
      // Parsed, not a substring: a substring test for the start path is true for every HTTP URL, so the
      // first version of this clause could never report a failure - it was a gate that always passed.
      path: location.pathname,
      invalidCount: invalid.length,
      messages: invalid.map((el) => el.validationMessage).filter(Boolean).slice(0, 3),
      visibleErrors: [...document.querySelectorAll('.error-msg,[role=alert]')].filter((n) => n.offsetParent !== null && n.textContent.trim() !== '').length,
    };
  `);
  const documentResponse = [...page.network].reverse().find((entry) => entry.url === url);
  return {
    ...validation,
    url,
    // Three independent kinds of evidence that an empty form was refused: the browser kept the user on
    // the form with controls that fail validation, the DOM shows a failure, or the server answered the
    // write with an error status.
    stillOnForm: validation.path === journey.startPath,
    urlUnchanged: url === beforeUrl,
    serverRefused: (documentResponse?.status ?? 0) >= 400,
    networkEvents: page.network.length - before,
  };
}

async function captureEvidence(page, dir, label, protocol) {
  mkdirSync(dir, { recursive: true });
  const screenshot = join(dir, `${label}-desktop.png`);
  await page.screenshot(screenshot);
  // A mobile viewport is a separate recording, not a resize of the desktop one: responsive behaviour
  // is one of the properties the vector checks.
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
  const mobileShot = join(dir, `${label}-mobile.png`);
  await page.screenshot(mobileShot);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const tracePath = join(dir, `${label}-trace.json`);
  writeFileSync(tracePath, JSON.stringify({ note: 'trace recorded by the journey run', protocol }));
  return { screenshot, mobileShot, tracePath };
}

/**
 * Run one project version end to end.
 *
 * `journey` is supplied by the archetype: the pilot's contracts are per archetype, because a booking
 * flow and a login flow persist different state.
 */
export async function runProjectVersion({ chrome, projectDir, spec, label, port, runDir, dbPath, urlBase = null }) {
  const base = urlBase ?? `http://127.0.0.1:${port}`;
  const evidenceDir = join(runDir, 'evidence');
  mkdirSync(evidenceDir, { recursive: true });

  const record = {
    project_id: spec.project_id,
    archetype: spec.archetype,
    framework: spec.framework.name,
    framework_version: spec.framework.version,
    dialect: spec.framework.dialect,
    label,
    base_url: base,
    started_at: new Date().toISOString(),
    journeys: [],
    console: [],
    network: [],
    rules: [],
    security: [],
    errors: [],
  };

  let server = null;
  let page = null;
  try {
    server = await startServer(projectDir, { port, dbPath });
    page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleBefore = page.console.length;
    const trace = await page.trace(async () => {
      const journey = await driveJourney(page, base, spec.journey);
      record.journeys.push({ name: 'server-persistence', ...journey });
      record.journeys.push({ name: 'validation-failure', ...(await driveValidationFailure(page, base, spec.journey)) });
      if (spec.write_journey) {
        record.journeys.push(await driveWriteJourney(page, base, spec.write_journey));
      }
      if (spec.content_journey) {
        // The content journey needs the reference the server just issued; without substituting it the
        // route 404s and the sanitisation rule reports "could not be driven".
        const ref = record.journeys[0]?.afterSubmit?.split('/').filter(Boolean).pop();
        record.content_ref = ref;
        await page.goto(`${base}${spec.content_journey.path.replace('REF', ref)}`);
        record.journeys.push({ name: 'content', url: await page.url() });
      }
    });
    record.trace_path = join(evidenceDir, `${label}-trace.json`);
    writeFileSync(record.trace_path, JSON.stringify({ traceEvents: trace.traceEvents }));

    // The vector runs against the state the journey left behind, and again from a fresh page for the
    // "no error on load" rule.
    await page.goto(`${base}${spec.journey.startPath}`);
    const ruleContext = {
      // The spec is written in snake_case by the scaffolder; reading `checkContext` here silently made
      // every selector `undefined` and every rule report "no primary field found" on a page that has
      // one. A spec field name is a contract.
      ...spec.check_context,
      // So a rule that asserts something about page load can reload for itself rather than trusting
      // that no earlier rule touched the page.
      base,
      startPath: spec.journey.startPath,
      journey: {
        submitContent: async (payload) => {
          if (!spec.content_journey) return false;
          if (spec.content_journey.source === 'session') {
            // The session page *is* where a successful submission lands, and its own script reads the
            // session back. Navigating anywhere else - the route the record-reference arm uses - put the
            // journey on a 404, where the payload never reached the DOM and the sanitisation check then
            // reported PASS for both versions of five projects.
            await page.goto(`${base}${spec.journey.startPath}`);
            for (const [selector, value] of Object.entries(spec.journey.fill ?? {})) {
              if (selector === spec.content_journey.inputSelector) continue;
              await page.type(selector, value);
            }
            await page.type(spec.content_journey.inputSelector, payload);
            await page.submit(spec.content_journey.formSelector ?? 'form');
            await page.waitFor(spec.echo_container ?? '#record-echo', { timeout: 5000 });
            return true;
          }
          if (spec.content_journey.source === 'query') {
            // A reflected-query project: the untrusted value is in the URL the server rendered, so the
            // journey is a plain navigation, and the page's own script is what inserts it.
            await page.goto(`${base}${spec.content_journey.path}?${spec.content_journey.param}=${encodeURIComponent(payload)}`);
            await page.waitFor(spec.echo_container ?? '#record-echo', { timeout: 5000 });
            return true;
          }
          // Submit the payload as this project's echoed field, through the project's own route, so the
          // sanitisation rule tests the real path a user-supplied value takes.
          await page.goto(`${base}${spec.journey.startPath}`);
          for (const [selector, value] of Object.entries(spec.journey.fill ?? {})) {
            if (selector === spec.content_journey.inputSelector) continue;
            await page.type(selector, value);
          }
          await page.type(spec.content_journey.inputSelector, payload);
          await page.submit(spec.content_journey.formSelector ?? 'form');
          const ref = (await page.url()).split('/').filter(Boolean).pop();
          await page.goto(`${base}${spec.content_journey.path.replace('REF', ref)}`);
          return true;
        },
      },
    };
    for (const [ruleId, rule] of Object.entries(RULES)) {
      // The spec is snake_case; reading `requiredRules` silently disabled the filter, which is how a
      // rule the project does not even exercise got measured and reported as a gap.
      if (spec.required_rules && !spec.required_rules.includes(ruleId)) continue;
      try {
        // Every rule starts from a pristine page. Two rules here assert something about a page nobody
        // has touched yet, and without this they inherited the previous rule's interaction and
        // reported the uplift as a regression for fixing the thing the previous rule had just checked.
        await page.goto(`${base}${spec.journey.startPath}`);
        record.rules.push(await rule.check(page, ruleContext));
      } catch (error) {
        record.rules.push({ rule: ruleId, status: 'ERROR', detail: error.message });
      }
    }
    const evidence = await captureEvidence(page, evidenceDir, label, chrome.version);
    record.screenshots = { desktop: evidence.screenshot, mobile: evidence.mobileShot };
    // The security checks need the cookie jar and the page as the journey left it.
    await page.goto(`${base}${spec.journey.startPath}`);
    if (spec.securityJourney) {
      await page.goto(`${base}${spec.securityJourney.path}`);
      if (spec.securityJourney.fill) {
        for (const [selector, value] of Object.entries(spec.securityJourney.fill)) await page.type(selector, value);
      }
      await page.submit(spec.securityJourney.formSelector ?? 'form');
      await delay(200);
    }
    for (const [checkId, check] of Object.entries(SECURITY_CHECKS)) {
      try {
        record.security.push(await check.check(page, ruleContext));
      } catch (error) {
        record.security.push({ check: checkId, status: 'ERROR', detail: error.message });
      }
    }
    record.console = page.console.slice(consoleBefore);
    record.network = page.network.map((entry) => ({ url: entry.url, method: entry.method, status: entry.status }));
    record.console_errors = record.console.filter((entry) => entry.type === 'error' || entry.type === 'exception').length;
    record.finished_at = new Date().toISOString();
    return record;
  } catch (error) {
    record.errors.push(error.message);
    record.finished_at = new Date().toISOString();
    return record;
  } finally {
    if (page) await page.close();
    await stopServer(server);
  }
}

/** Hash a project tree without node_modules, so the record can name exactly what ran. */
export function hashTree(root) {
  const hash = createHash('sha256');
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else if (statSync(path).isFile()) hash.update(`${prefix}${entry.name}\n`).update(readFileSync(path));
    }
  };
  if (!existsSync(root)) return null;
  walk(root);
  return `sha256:${hash.digest('hex')}`;
}
