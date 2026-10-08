import { FLOW_VERSION, validateFlow } from './schema.mjs';
import { launchChrome } from '../corpus/cdp.mjs';

/**
 * Record a user flow against a page by executing a declarative list of intents.
 *
 * Each intent is: { action, target?, value?, expectText? }
 * with action in goto | fill | select | click | submit.
 *
 * Drives actions through the real input path:
 *   - `realType` for fill
 *   - `selectOption` for select
 *   - `click` for click
 *   - `submit` for submit
 *
 * Never uses synthetic `page.type`.
 *
 * Respects the carry-state rule:
 * Only records an `expectText` when the value is one an EARLIER step supplied
 * AND it is actually visible on the page now. If not visible or not supplied,
 * omits the assertion.
 */
export async function recordFlow({ url, rightsRef, steps, page }) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url) || url.includes(' ')) {
    throw new Error(`recordFlow: url must be an http(s) URL without spaces, got '${url}'`);
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('recordFlow: steps must be a non-empty array');
  }

  let chrome = null;
  let ownedPage = false;
  if (!page) {
    chrome = await launchChrome();
    page = await chrome.newPage();
    ownedPage = true;
  }

  try {
    // Navigate to initial URL and establish starting path
    await page.goto(url);
    const initialUrl = new URL(await page.url());
    const startPath = initialUrl.pathname;
    let currentPath = startPath;

    const recordedSteps = [];
    const carried = new Set();

    for (let i = 0; i < steps.length; i++) {
      const intent = steps[i];
      if (!intent || typeof intent !== 'object') {
        throw new Error(`recordFlow: intent at index ${i} must be an object`);
      }

      const { action, target, value, expectText } = intent;
      const earlierSupplied = new Set(carried);
      const pathBefore = currentPath;

      switch (action) {
        case 'goto': {
          const dest = target || value;
          if (dest) {
            const destUrl = new URL(dest, await page.url()).href;
            await page.goto(destUrl);
          } else {
            const currentUrl = await page.url();
            if (!currentUrl || currentUrl === 'about:blank') {
              await page.goto(url);
            } else {
              await page.waitForSettled();
            }
          }
          break;
        }

        case 'fill': {
          if (!target) throw new Error(`fill intent at index ${i} requires target`);
          if (value === undefined || value === null) throw new Error(`fill intent at index ${i} requires value`);
          const strVal = String(value);
          await page.waitFor(target, { timeout: 10_000 });
          await page.realType(target, strVal);
          carried.add(strVal);
          await page.waitForSettled();
          break;
        }

        case 'select': {
          if (!target) throw new Error(`select intent at index ${i} requires target`);
          if (value === undefined || value === null) throw new Error(`select intent at index ${i} requires value`);
          const strVal = String(value);
          await page.waitFor(target, { timeout: 10_000 });
          await page.selectOption(target, strVal);
          carried.add(strVal);
          await page.waitForSettled();
          break;
        }

        case 'click': {
          if (!target) throw new Error(`click intent at index ${i} requires target`);
          await page.waitFor(target, { timeout: 10_000 });
          await page.click(target).catch((error) => {
            if (/navigated or closed/i.test(error.message)) return { ok: true };
            throw error;
          });
          await page.waitForSettled();
          break;
        }

        case 'submit': {
          if (!target) throw new Error(`submit intent at index ${i} requires target`);
          await page.waitFor(target, { timeout: 10_000 });
          const tag = await page.evaluate(`return document.querySelector(${JSON.stringify(target)})?.tagName?.toUpperCase()`);
          if (tag === 'FORM') {
            await page.submit(target);
          } else {
            await page.click(target).catch((error) => {
              if (/navigated or closed/i.test(error.message)) return { ok: true };
              throw error;
            });
            await page.waitForSettled();
          }
          break;
        }

        default:
          throw new Error(`recordFlow: unsupported action '${action}' at index ${i}`);
      }

      const currentUrl = new URL(await page.url());
      const pathAfter = currentUrl.pathname;

      const stepRecord = {
        index: i,
        path: pathBefore,
        action,
      };

      if (action === 'fill' || action === 'select') {
        stepRecord.target = target;
        stepRecord.value = String(value);
      } else if (action === 'click' || action === 'submit') {
        stepRecord.target = target;
      }

      if (pathAfter !== pathBefore) {
        stepRecord.expected_path = pathAfter;
        currentPath = pathAfter;
      } else {
        currentPath = pathBefore;
      }

      // Check expectText against carry-state rule:
      // only record expectText when value was supplied by an EARLIER step AND is visible now.
      if (expectText) {
        let candidate = null;
        if (typeof expectText === 'string') {
          if (earlierSupplied.has(expectText)) {
            candidate = expectText;
          }
        } else if (expectText === true) {
          // Find an earlier supplied value that is visible
          for (const val of earlierSupplied) {
            if (await isTextVisible(page, val)) {
              candidate = val;
              break;
            }
          }
        }

        if (candidate && (await isTextVisible(page, candidate))) {
          stepRecord.expectText = candidate;
        }
      }

      recordedSteps.push(stepRecord);
    }

    const flow = {
      flow_version: FLOW_VERSION,
      source: {
        url,
        rights_ref: rightsRef,
        captured_at: new Date().toISOString(),
      },
      start_path: startPath,
      steps: recordedSteps,
    };

    const problems = validateFlow(flow);
    if (problems.length > 0) {
      throw new Error(`validateFlow refused recording:\n  ${problems.join('\n  ')}`);
    }

    return flow;
  } finally {
    if (ownedPage) {
      if (chrome) {
        await chrome.close().catch(() => {});
      }
    }
  }
}

async function isTextVisible(page, text, timeout = 500) {
  const started = Date.now();
  for (;;) {
    let visibleText = '';
    try {
      visibleText = await page.evaluate(`
        return document.body ? document.body.innerText : (document.documentElement ? document.documentElement.innerText : "");
      `);
    } catch {
      visibleText = '';
    }
    if (visibleText && visibleText.includes(text)) {
      return true;
    }
    if (Date.now() - started > timeout) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
