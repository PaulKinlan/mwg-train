/**
 * Black-box site capture tool (arm A5_black_box_reproduction).
 *
 * Launches Chrome via direct CDP, navigates to a site, waits for it to settle,
 * extracts a derived structural description (landmarks, headings, nav, excerpt,
 * forms/controls, links, console, network), and captures evidence assets:
 * desktop screenshot, mobile screenshot, and full DOM snapshot.
 *
 * Raw assets are hashed and routed through the quarantine store
 * (assetStoragePath) and never written into the public repo tree.
 * The capture is validated against the frozen schema (validateCapture)
 * before any bytes are written to disk.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../corpus/cdp.mjs';
import { assertCaptureTarget, captureChromeArgs, hostResolverPin, installTargetGuard } from './target.mjs';

/** A promise that never settles: the race below needs a second arm even when no interception is installed. */
const NEVER = new Promise(() => {});
import { assetStoragePath } from '../provenance/store.mjs';
import { validateCapture, CAPTURE_VERSION, resolveCaptureOutputPath } from './schema.mjs';

export function defaultOutDir(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/[^a-zA-Z0-9_-]/g, '_');
  const port = parsed.port ? `_${parsed.port}` : '';
  const pathname = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const slug = [host + port, pathname].filter(Boolean).join('_');
  return `sites/${slug || 'root'}`;
}

export function cleanRelativeDir(dir) {
  if (!dir || typeof dir !== 'string') return null;
  const cleaned = dir.replace(/\\/g, '/').trim();
  if (cleaned.startsWith('/')) throw new Error(`refusing outDir '${dir}': absolute paths must be inside the quarantine store or an explicit test temp directory`);
  if (!cleaned) throw new Error('outDir must be a non-empty relative directory');
  const segments = cleaned.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`outDir '${dir}' cannot contain empty, '.' or '..' segments`);
  }
  return cleaned;
}

async function extractPageStructure(page) {
  return await page.evaluate(`
    const title = document.title || '';

    const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
    const headings = headingElements.map(el => (el.textContent || '').trim()).filter(Boolean);

    const landmarkSelectors = 'header, nav, main, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"], [role="search"], [role="region"], [role="form"]';
    const landmarkElements = Array.from(document.querySelectorAll(landmarkSelectors));
    const landmarks = landmarkElements.map(el => {
      const role = el.getAttribute('role');
      return (role || el.tagName.toLowerCase()).trim();
    }).filter(Boolean);

    const navElements = Array.from(document.querySelectorAll('nav a[href], [role="navigation"] a[href]'));
    const nav = navElements.map(el => el.getAttribute('href') || el.href).filter(Boolean);

    const bodyText = (document.body ? (document.body.innerText || document.body.textContent || '') : '')
      .trim()
      .replace(/\\s+/g, ' ');
    const text_excerpt = bodyText.slice(0, 500);

    const linkElements = Array.from(document.querySelectorAll('a[href]'));
    const links = [];
    const seenLinks = new Set();
    for (const a of linkElements) {
      const href = (a.getAttribute('href') || '').trim();
      if (!href) continue;
      const text = (a.textContent || '').trim();
      const key = href + '::' + text;
      if (!seenLinks.has(key)) {
        seenLinks.add(key);
        links.push({ href, text });
      }
    }

    const CONTROL_TYPES = new Set(['text', 'email', 'tel', 'url', 'search', 'password', 'number', 'date', 'time', 'textarea', 'select', 'checkbox', 'radio', 'submit', 'hidden']);
    const NAME_SAFE = /^[A-Za-z][A-Za-z0-9_-]*$/;

    const formElements = Array.from(document.querySelectorAll('form'));
    const forms = [];
    const dropped_controls = [];

    for (const form of formElements) {
      const action = form.getAttribute('action') ?? '';
      const rawMethod = (form.getAttribute('method') || form.method || 'get').toLowerCase();
      const method = rawMethod === 'post' ? 'post' : 'get';

      const controlElements = Array.from(form.querySelectorAll('input, select, textarea, button'));
      const controls = [];
      let submitCounter = 0;

      for (const el of controlElements) {
        const tag = el.tagName.toLowerCase();
        let type = '';

        if (tag === 'textarea') {
          type = 'textarea';
        } else if (tag === 'select') {
          type = 'select';
        } else if (tag === 'button') {
          const btnType = (el.getAttribute('type') || 'submit').toLowerCase();
          if (btnType === 'submit') {
            type = 'submit';
          } else {
            dropped_controls.push({ name: el.getAttribute('name') || 'unnamed button', type: btnType, reason: 'unsupported control type' });
            continue;
          }
        } else if (tag === 'input') {
          const inputType = (el.getAttribute('type') || el.type || 'text').toLowerCase();
          if (CONTROL_TYPES.has(inputType)) {
            type = inputType;
          } else {
            dropped_controls.push({ name: el.getAttribute('name') || 'unnamed input', type: inputType, reason: 'unsupported control type' });
            continue;
          }
        } else {
          continue;
        }

        let name = el.getAttribute('name') || el.name || '';
        if (!name && type === 'submit') {
          name = submitCounter === 0 ? 'submit' : ('submit_' + submitCounter);
          submitCounter++;
        }

        if (!NAME_SAFE.test(name)) {
          dropped_controls.push({ name: name || 'unnamed ' + tag, type, reason: name ? 'name is not NAME_SAFE' : 'missing name' });
          continue;
        }

        const required = Boolean(el.required || el.hasAttribute('required'));

        let label = '';
        if (el.id) {
          try {
            const labelEl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
            if (labelEl) label = (labelEl.textContent || '').trim();
          } catch {
            // ignore invalid selector characters
          }
        }
        if (!label && el.labels && el.labels.length > 0) {
          label = (el.labels[0].textContent || '').trim();
        }
        if (!label) {
          const parentLabel = el.closest('label');
          if (parentLabel) {
            label = (parentLabel.textContent || '').trim();
          }
        }
        if (!label) {
          label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim();
        }
        if (!label && (type === 'submit' || tag === 'button')) {
          label = (el.value || el.textContent || '').trim();
        }

        const controlObj = {
          name,
          type,
          required,
        };
        if (label) {
          controlObj.label = label;
        }

        if (type === 'select') {
          const options = Array.from(el.querySelectorAll('option')).map((opt) => (opt.value || opt.textContent || '').trim());
          controlObj.options = options;
        }

        controls.push(controlObj);
      }

      if (controls.length > 0) {
        forms.push({
          id: form.getAttribute('id') ?? '',
          action,
          method,
          controls,
        });
      }
    }

    return {
      title,
      landmarks,
      headings,
      nav,
      text_excerpt,
      forms,
      dropped_controls,
      links,
    };
  `);
}

/**
 * Capture a site into quarantined arm A5_black_box_reproduction.
 *
 * @param {object} options
 * @param {string} options.url Target http(s) URL
 * @param {string} options.rightsRef Provenance rights record reference
 * @param {object} [options.env=process.env] Environment variables (e.g. MWG_TRAIN_QUARANTINE override)
 * @param {string} [options.outDir] Relative directory under arm storage root
 * @param {string[]|string} [options.pages] Additional same-origin paths to capture
 * @param {function} [options._mutateCapture] Testing hook to mutate capture before validation
 * @returns {Promise<object>} Validated capture object
 */
export async function captureSite({
  url,
  rightsRef,
  env = process.env,
  outDir = null,
  pages = [],
  // A capture's URL arrives from outside - an operator or a CI job - so a non-public destination has to be asked for
  // explicitly. The harness and the suites pass true because they capture servers they started on loopback
  // (mwg-train-3pqm).
  allowPrivate = false,
  // How long a navigation may take. A real option rather than a test hook: a slow site wants a longer bound, and a
  // caller that knows a page will not load wants a shorter one, instead of every capture paying the same 15 seconds.
  navigationTimeoutMs = 15_000,
  _mutateCapture = null,
  // Test hooks, named as internal for the same reason _mutateCapture is: a suite has to be able to exercise the
  // request interception against a local server and a name of its own choosing (mwg-train-zpjt).
  _lookup = undefined,
  _chromeArgs = [],
} = {}) {
  if (!rightsRef || typeof rightsRef !== 'string' || rightsRef.trim() === '') {
    throw new Error('captureSite: --rights-ref is required and must name the rights record authorising this capture');
  }

  if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url) || url.includes(' ')) {
    throw new Error(`captureSite: url must be an http(s) URL without spaces, got '${url}'`);
  }

  const targetUrl = new URL(url).href;
  const baseOrigin = new URL(targetUrl).origin;
  // Refuse a destination on the host's own network, or a cloud metadata address, before a browser is launched or an
  // asset is written. A name is resolved here and every answer is checked; the re-checks after each navigation below
  // are what catch a redirect that lands somewhere else (mwg-train-3pqm).
  await assertCaptureTarget(targetUrl, { allowPrivate, lookup: _lookup });
  // Pin the hostname to the address just validated, so the browser cannot be told a different answer than this
  // process checked (mwg-train-car1). Computed here and passed at launch because the flag cannot be added later.
  const pin = allowPrivate ? null : await hostResolverPin(targetUrl, { lookup: _lookup });
  // Refuse an explicit forbidden destination before launching a browser or writing any assets.
  const absoluteOut = outDir && isAbsolute(outDir) ? resolveCaptureOutputPath(outDir, { env }) : null;
  const cleanOut = absoluteOut ? defaultOutDir(targetUrl) : (outDir ? cleanRelativeDir(outDir) : defaultOutDir(targetUrl));

  const pagesList = Array.isArray(pages)
    ? pages
    : (typeof pages === 'string' ? pages.split(',').map((p) => p.trim()).filter(Boolean) : []);

  let chrome = null;
  let desktopBuffer = null;
  let mobileBuffer = null;
  let domBuffer = null;
  let finalUrl = targetUrl;
  let targetGuard = null;
  const capturedPages = [];
  let consoleEntries = [];
  let requestEntries = [];

  try {
    chrome = await launchChrome({ args: captureChromeArgs({ pin, extra: _chromeArgs }) });
    const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });

    // Interception goes on before the first navigation, because a redirect is followed by Chrome itself: checking the
    // landing URL afterwards would be checking a request that has already been sent (mwg-train-zpjt). The guard
    // answers every paused request, and refusing one here means no traffic left this host.
    targetGuard = await installTargetGuard(page, { allowPrivate, lookup: _lookup });

    // 1. Navigate to initial page and wait for settling
    // A refused request leaves the navigation hanging until the browser's own timeout, so the refusal is raced
    // against it: the decision is already made, and waiting 15 seconds to report it is wrong for the gate and for an
    // operator. The navigation promise keeps its rejection handled either way.
    // null means the navigation completed; anything else is a refusal (an object) or a navigation error.
    const navigation = page.goto(targetUrl, { timeout: navigationTimeoutMs }).then(() => null, (error) => error);
    const outcome = await Promise.race([navigation, targetGuard?.blockedSignal ?? NEVER]);
    if (outcome !== null) throw targetGuard?.refusal() ?? outcome;
    try {
      await page.waitForSettled({ timeout: 10_000 });
    } catch (error) {
      throw targetGuard?.refusal() ?? error;
    }
    finalUrl = await page.url();
    // The interceptor should have caught a redirect to a private destination before it was sent. If one slipped
    // through anyway - a name that resolved differently for the browser - the landing URL is judged here as the
    // second line of defence, so the capture still refuses rather than measuring the wrong page.
    const refusal = targetGuard?.refusal();
    if (refusal) throw refusal;
    await assertCaptureTarget(finalUrl, { allowPrivate, lookup: _lookup });

    // 2. Extract initial page structural data
    const initialPageData = await extractPageStructure(page);
    const initialPath = new URL(finalUrl).pathname || '/';
    capturedPages.push({
      path: initialPath,
      ...initialPageData,
    });

    // 3. Desktop screenshot
    const { data: dData } = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
    });
    desktopBuffer = Buffer.from(dData, 'base64');

    // 4. Mobile screenshot (viewport emulation)
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await page.waitForSettled({ quiet: 100 });
    const { data: mData } = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
    });
    mobileBuffer = Buffer.from(mData, 'base64');

    // Restore desktop viewport
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForSettled({ quiet: 50 });

    // 5. DOM snapshot
    const domHtml = await page.content();
    domBuffer = Buffer.from(domHtml, 'utf8');

    // 6. Additional same-origin pages
    const visitedPaths = new Set([initialPath]);
    for (const p of pagesList) {
      let pageUrl;
      try {
        pageUrl = new URL(p, targetUrl);
      } catch {
        continue;
      }
      if (pageUrl.origin !== baseOrigin) {
        continue;
      }
      const pagePath = pageUrl.pathname || '/';
      if (visitedPaths.has(pagePath)) {
        continue;
      }
      visitedPaths.add(pagePath);

      const pageNavigation = page.goto(pageUrl.href, { timeout: navigationTimeoutMs }).then(() => null, (error) => error);
      const pageOutcome = await Promise.race([pageNavigation, targetGuard?.blockedSignal ?? NEVER]);
      if (pageOutcome !== null) throw targetGuard?.refusal() ?? pageOutcome;
      try {
        await page.waitForSettled({ timeout: 10_000 });
      } catch (error) {
        throw targetGuard?.refusal() ?? error;
      }
      const refused = targetGuard?.refusal();
      if (refused) throw refused;
      await assertCaptureTarget(await page.url(), { allowPrivate, lookup: _lookup });
      const additionalPageData = await extractPageStructure(page);
      capturedPages.push({
        path: pagePath,
        ...additionalPageData,
      });
    }

    // 7. Console and network requests
    consoleEntries = page.console.map((c) => ({
      type: c.type,
      text: String(c.text ?? ''),
    }));

    requestEntries = Array.from(page.requests.values())
      .filter((r) => typeof r?.url === 'string' && r.url.trim().length > 0 && typeof r?.method === 'string' && r.method.trim().length > 0)
      .map((r) => ({
        url: r.url,
        method: r.method,
        status: Number.isInteger(r.status) ? r.status : null,
      }));
  } finally {
    if (targetGuard) await targetGuard.stop().catch(() => {});
    if (chrome) {
      await chrome.close();
    }
  }

  // 8. Hash raw assets
  const desktopHash = createHash('sha256').update(desktopBuffer).digest('hex');
  const desktopBytes = desktopBuffer.byteLength;

  const mobileHash = createHash('sha256').update(mobileBuffer).digest('hex');
  const mobileBytes = mobileBuffer.byteLength;

  const domHash = createHash('sha256').update(domBuffer).digest('hex');
  const domBytes = domBuffer.byteLength;

  // 9. Assemble capture object
  const capture = {
    capture_version: CAPTURE_VERSION,
    source: {
      url,
      final_url: finalUrl,
      captured_at: new Date().toISOString(),
      rights_ref: rightsRef,
      arm: 'A5_black_box_reproduction',
    },
    viewport: {
      width: 1280,
      height: 900,
      device_scale_factor: 1,
    },
    pages: capturedPages,
    assets: {
      desktop_screenshot: {
        rel_path: `${cleanOut}/desktop.png`,
        sha256: desktopHash,
        bytes: desktopBytes,
      },
      mobile_screenshot: {
        rel_path: `${cleanOut}/mobile.png`,
        sha256: mobileHash,
        bytes: mobileBytes,
      },
      dom: {
        rel_path: `${cleanOut}/dom.html`,
        sha256: domHash,
        bytes: domBytes,
      },
    },
    console: consoleEntries,
    requests: requestEntries,
  };

  if (typeof _mutateCapture === 'function') {
    _mutateCapture(capture);
  }

  // 10. Refuse to write unless validateCapture returns no problems
  const problems = validateCapture(capture);
  if (problems.length > 0) {
    throw new Error(`Capture validation failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }

  // 11. Write assets into quarantine store
  const storageOptions = {};
  const qOverride = env?.MWG_TRAIN_QUARANTINE ?? process.env.MWG_TRAIN_QUARANTINE;
  if (qOverride) {
    storageOptions.quarantineRoot = qOverride;
  }
  if (env?.MWG_TRAIN_REPO) {
    storageOptions.repoRoot = env.MWG_TRAIN_REPO;
  }

  const outputPath = (file) => absoluteOut
    ? resolveCaptureOutputPath(join(absoluteOut, file), { env })
    : assetStoragePath('A5_black_box_reproduction', `${cleanOut}/${file}`, storageOptions);
  const desktopDiskPath = outputPath('desktop.png');
  const mobileDiskPath = outputPath('mobile.png');
  const domDiskPath = outputPath('dom.html');
  const captureJsonDiskPath = outputPath('capture.json');

  mkdirSync(dirname(desktopDiskPath), { recursive: true });
  writeFileSync(desktopDiskPath, desktopBuffer);
  writeFileSync(mobileDiskPath, mobileBuffer);
  writeFileSync(domDiskPath, domBuffer);
  writeFileSync(captureJsonDiskPath, JSON.stringify(capture, null, 2) + '\n');

  for (const page of capture.pages) {
    for (const dropped of page.dropped_controls) {
      console.warn(`Dropped control at ${page.path}: name '${dropped.name}', type '${dropped.type}': ${dropped.reason}`);
    }
    for (const form of page.forms) {
      if (form.id === '') {
        console.warn(`Captured ${form.method.toUpperCase()} form at ${page.path} (action: ${form.action}, controls: ${form.controls.map((control) => control.name).join(', ')}) has no id and cannot be clean-room translated`);
      }
    }
  }

  Object.defineProperty(capture, 'capturePath', {
    value: captureJsonDiskPath,
    enumerable: false,
    writable: true,
  });

  return capture;
}
