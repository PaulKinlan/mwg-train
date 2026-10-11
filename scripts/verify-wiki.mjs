/**
 * Functional local-browser verification for the wiki capability (mwg-train-suu).
 *
 * Verifies the acceptance journey in a real headless Chrome browser:
 * 1. Search: go to /wiki/search?q=lime and assert soil is in the results.
 * 2. Open: click through to /wiki/soil and assert current revision (text "Do not add lime", author Grace Hopper).
 * 3. Follow a cross-link: click link to clay and assert landing on /wiki/clay (real navigation).
 * 4. History: follow history link and assert at least two revisions with authors and dates (Ada Lovelace and Grace Hopper).
 * 5. Read older revision: click revision 1 link, assert older body differs from current revision (no leaf-mould sentence),
 *    and attribution/revision notice is shown.
 * 6. Link to create: back on current clay, assert leaf-mould link has class "wiki-link missing" and data-create="true",
 *    and following it gives HTTP 200, .wiki-missing-notice, and #wiki-create-form (NOT 404).
 * 7. Screenshots taken and inspected for each step.
 *
 * Usage: node scripts/verify-wiki.mjs [arm]   (WIKI_ARM=vue to check another arm)
 * Evidence (screenshots) is written to /tmp/wiki-shots.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { wikiSpec } from './lib/wiki-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.WIKI_SHOTS ?? '/tmp/wiki-shots';
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const availablePort = () =>
  new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });

export async function runJourney(arm) {
  console.log(`\n=== Starting Acceptance Journey for Arm: ${arm} ===`);
  const checks = [];
  function check(name, truth, detail) {
    checks.push({ name, ok: Boolean(truth), detail });
    console.log(`${truth ? 'PASS' : 'FAIL'} [${arm}] ${name}: ${detail}`);
  }

  const port = await availablePort();
  const spec = wikiSpec();
  const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
  const dir = mkdtempSync(join(tmpdir(), `wiki-verify-${arm}-`));
  writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  const base = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'verify.sqlite')], {
    cwd: dir,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let chrome;
  try {
    let up = false;
    for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
      await sleep(250);
      up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
    }
    check('the generated server is ready', up, `${arm} on ${base}`);
    if (!up) throw new Error(`${arm} server never came up`);

    chrome = await launchChrome({});
    const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });

    // Helper to click and wait for state
    const clickAndWait = async (selector, targetUrlSubstring, waitSelector) => {
      await page.click(selector);
      const started = Date.now();
      while (Date.now() - started < 10000) {
        const u = await page.url();
        if (!targetUrlSubstring || u.includes(targetUrlSubstring)) {
          if (!waitSelector) {
            await page.waitForSettled();
            return;
          }
          const has = await page.evaluate(`return Boolean(document.querySelector(${JSON.stringify(waitSelector)}))`);
          if (has) {
            await page.waitForSettled();
            return;
          }
        }
        await sleep(60);
      }
      throw new Error(`Timed out after clicking ${selector} waiting for ${targetUrlSubstring} and ${waitSelector}`);
    };

    // -------------------------------------------------------------------------
    // Step 1: Search
    // Go to /wiki/search?q=lime and assert the soil page is in the results.
    // -------------------------------------------------------------------------
    await page.goto(`${base}/wiki/search?q=lime`);
    await page.waitForSettled();
    const searchShot = join(SHOTS, `01-search-lime-${arm}.png`);
    await page.screenshot(searchShot);

    const searchResults = await page.evaluate(`
      const items = Array.from(document.querySelectorAll('#wiki-search-results li'));
      return items.map((li) => {
        const a = li.querySelector('a');
        return { text: a?.textContent?.trim(), href: a?.getAttribute('href') };
      });
    `);
    const foundSoil = searchResults.some((r) => r.href === '/wiki/soil' && r.text.includes('Soil'));
    check(
      'search: soil page found for body keyword "lime"',
      foundSoil,
      `found ${searchResults.length} results: ${JSON.stringify(searchResults)}`,
    );

    // -------------------------------------------------------------------------
    // Step 2: Open
    // Click through to /wiki/soil and assert the current revision is shown.
    // -------------------------------------------------------------------------
    await clickAndWait('#wiki-search-results a[href="/wiki/soil"]', '/wiki/soil', '.wiki-body');
    const soilShot = join(SHOTS, `02-soil-current-${arm}.png`);
    await page.screenshot(soilShot);

    const soilPageData = await page.evaluate(`
      const body = document.querySelector('.wiki-body')?.textContent?.trim() ?? '';
      const author = document.querySelector('.wiki-author')?.textContent?.trim() ?? '';
      const revision = document.querySelector('.wiki-revision')?.textContent?.trim() ?? '';
      const date = document.querySelector('.wiki-date')?.textContent?.trim() ?? '';
      return { body, author, revision, date };
    `);
    check(
      'open: soil current revision contains "Do not add lime"',
      soilPageData.body.includes('Do not add lime'),
      `body: "${soilPageData.body.slice(0, 80)}..."`,
    );
    check(
      'open: current revision author is Grace Hopper',
      soilPageData.author === 'Grace Hopper',
      `author="${soilPageData.author}", rev=${soilPageData.revision}`,
    );

    // -------------------------------------------------------------------------
    // Step 3: Follow a cross-link
    // Click the link to clay and assert landing on /wiki/clay (real navigation).
    // -------------------------------------------------------------------------
    const clayLinkExists = await page.evaluate(`
      const a = document.querySelector('.wiki-body a.wiki-link[href="/wiki/clay"]');
      return Boolean(a);
    `);
    check('cross-link: clay link is present in soil body', clayLinkExists, 'selector: .wiki-body a.wiki-link[href="/wiki/clay"]');

    await clickAndWait('.wiki-body a.wiki-link[href="/wiki/clay"]', '/wiki/clay', '.wiki-body');
    const clayUrl = await page.url();
    const clayShot = join(SHOTS, `03-clay-page-${arm}.png`);
    await page.screenshot(clayShot);

    const clayPageData = await page.evaluate(`
      const h1 = document.querySelector('h1')?.textContent?.trim() ?? '';
      const body = document.querySelector('.wiki-body')?.textContent?.trim() ?? '';
      return { h1, body };
    `);
    check(
      'cross-link: navigates to /wiki/clay (real navigation)',
      clayUrl.endsWith('/wiki/clay'),
      `navigated to ${clayUrl}`,
    );
    check(
      'cross-link: clay page renders',
      clayPageData.h1.includes('Clay') && clayPageData.body.length > 0,
      `h1="${clayPageData.h1}", bodyLength=${clayPageData.body.length}`,
    );

    // -------------------------------------------------------------------------
    // Step 4: History
    // Follow the history link and assert at least two revisions are listed,
    // each with author and date, and both Ada Lovelace and Grace Hopper appear.
    // -------------------------------------------------------------------------
    await clickAndWait('a.wiki-history-link', '/wiki/clay/history', '#wiki-history');
    const historyUrl = await page.url();
    const historyShot = join(SHOTS, `04-clay-history-${arm}.png`);
    await page.screenshot(historyShot);

    const historyData = await page.evaluate(`
      const rows = Array.from(document.querySelectorAll('.wiki-revision-row'));
      return rows.map((row) => ({
        revision: row.dataset.revision,
        author: row.querySelector('.wiki-author')?.textContent?.trim() ?? '',
        date: row.querySelector('.wiki-date')?.textContent?.trim() ?? '',
        linkText: row.querySelector('.wiki-revision-link')?.textContent?.trim() ?? '',
        linkHref: row.querySelector('.wiki-revision-link')?.getAttribute('href') ?? '',
      }));
    `);
    check(
      'history: navigates to /wiki/clay/history',
      historyUrl.endsWith('/wiki/clay/history'),
      `url=${historyUrl}`,
    );
    check(
      'history: lists at least two revisions',
      historyData.length >= 2,
      `found ${historyData.length} revisions`,
    );
    const eachHasAuthorAndDate = historyData.every((r) => r.author && r.date);
    check(
      'history: each revision has an author and date',
      eachHasAuthorAndDate,
      JSON.stringify(historyData.map((r) => ({ rev: r.revision, author: r.author, date: r.date }))),
    );
    const authors = historyData.map((r) => r.author);
    const hasBothAuthors = authors.includes('Ada Lovelace') && authors.includes('Grace Hopper');
    check(
      'history: both Ada Lovelace and Grace Hopper appear',
      hasBothAuthors,
      `authors found: ${authors.join(', ')}`,
    );

    // -------------------------------------------------------------------------
    // Step 5: Read an older revision
    // Click the link that reads revision 1 and assert the older body is shown,
    // DIFFERS from the current revision body (no leaf-mould sentence), and
    // the page says which revision and author you are reading.
    // -------------------------------------------------------------------------
    await clickAndWait('a.wiki-revision-link[href="/wiki/clay/revision/1"]', '/wiki/clay/revision/1', '.wiki-revision-banner');
    const rev1Url = await page.url();
    const rev1Shot = join(SHOTS, `05-clay-revision-1-${arm}.png`);
    await page.screenshot(rev1Shot);

    const rev1Data = await page.evaluate(`
      const banner = document.querySelector('.wiki-revision-banner')?.textContent?.trim() ?? '';
      const author = document.querySelector('.wiki-revision-banner .wiki-author')?.textContent?.trim() ?? '';
      const date = document.querySelector('.wiki-revision-banner .wiki-date')?.textContent?.trim() ?? '';
      const body = document.querySelector('.wiki-body')?.textContent?.trim() ?? '';
      const currentLink = document.querySelector('a.wiki-current-link')?.getAttribute('href') ?? '';
      return { banner, author, date, body, currentLink };
    `);
    check(
      'older revision: navigated to /wiki/clay/revision/1',
      rev1Url.endsWith('/wiki/clay/revision/1'),
      `url=${rev1Url}`,
    );
    check(
      'older revision: body differs from current revision (no leaf-mould text)',
      !rev1Data.body.includes('leaf-mould'),
      `body="${rev1Data.body}"`,
    );
    check(
      'older revision: banner attributes revision 1 to author Ada Lovelace',
      rev1Data.banner.includes('1') && rev1Data.author === 'Ada Lovelace',
      `banner="${rev1Data.banner}"`,
    );

    // -------------------------------------------------------------------------
    // Step 6: The link-to-create
    // Back on current clay revision, assert leaf-mould link renders with class
    // "wiki-link missing" and data-create="true", is an <a>, and following it
    // gives HTTP 200, .wiki-missing-notice, and #wiki-create-form.
    // -------------------------------------------------------------------------
    await clickAndWait('a.wiki-current-link', '/wiki/clay', '.wiki-body');
    const clayCurrentUrl = await page.url();
    const missingLinkShot = join(SHOTS, `06a-clay-missing-link-${arm}.png`);
    await page.screenshot(missingLinkShot);

    const missingLinkInfo = await page.evaluate(`
      const a = document.querySelector('a[href="/wiki/leaf-mould"]');
      if (!a) return null;
      return {
        tag: a.tagName,
        className: a.className,
        hasMissingClass: a.classList.contains('missing') && a.classList.contains('wiki-link'),
        dataCreate: a.dataset.create,
        href: a.getAttribute('href'),
        text: a.textContent.trim(),
      };
    `);
    check(
      'link-to-create: returned to current clay page',
      clayCurrentUrl.endsWith('/wiki/clay'),
      `url=${clayCurrentUrl}`,
    );
    check(
      'link-to-create: leaf-mould link has class "wiki-link missing" and data-create="true"',
      missingLinkInfo?.hasMissingClass && missingLinkInfo?.dataCreate === 'true',
      JSON.stringify(missingLinkInfo),
    );
    check(
      'link-to-create: leaf-mould link is a clickable <a> anchor',
      missingLinkInfo?.tag === 'A' && missingLinkInfo?.href === '/wiki/leaf-mould',
      `tag=${missingLinkInfo?.tag}, href=${missingLinkInfo?.href}`,
    );

    // Follow the link to /wiki/leaf-mould
    await clickAndWait('a[href="/wiki/leaf-mould"]', '/wiki/leaf-mould', '#wiki-create-form');
    const leafMouldUrl = await page.url();
    const createShot = join(SHOTS, `06b-create-leaf-mould-${arm}.png`);
    await page.screenshot(createShot);

    // Check HTTP status for the navigation (fetch directly from browser context or fetch API)
    const httpStatus = await page.evaluate(`
      return fetch(location.href).then(r => r.status);
    `);
    const createPageData = await page.evaluate(`
      const notice = document.querySelector('.wiki-missing-notice')?.textContent?.trim() ?? '';
      const form = document.querySelector('#wiki-create-form');
      const action = form?.getAttribute('action') ?? '';
      const method = form?.getAttribute('method') ?? '';
      const titleInput = form?.querySelector('input[name="title"]')?.value ?? null;
      const authorInput = form?.querySelector('input[name="author"]') ? true : false;
      const bodyInput = form?.querySelector('textarea[name="body"]') ? true : false;
      return { notice, action, method, titleInput, authorInput, bodyInput };
    `);

    check(
      'link-to-create: unwritten page returns HTTP 200 (NOT 404)',
      httpStatus === 200,
      `HTTP status was ${httpStatus} on ${leafMouldUrl}`,
    );
    check(
      'link-to-create: .wiki-missing-notice is present on create page',
      createPageData.notice.length > 0,
      `notice="${createPageData.notice}"`,
    );
    check(
      'link-to-create: #wiki-create-form is present with author and body fields',
      createPageData.action.includes('/wiki/leaf-mould/create') &&
        createPageData.authorInput &&
        createPageData.bodyInput,
      `action="${createPageData.action}", method="${createPageData.method}", prefilled title="${createPageData.titleInput}"`,
    );

    const passed = checks.filter((c) => c.ok).length;
    const total = checks.length;
    console.log(`\n[${arm}] Summary: ${passed}/${total} checks passed.`);

    return { arm, checks, passed, total, ok: passed === total };
  } finally {
    if (chrome) {
      try {
        await chrome.close();
      } catch (err) {
        console.error('Error closing chrome:', err);
      }
    }
    server.kill('SIGTERM');
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

// Run for raw first, then hono if time allows
async function main() {
  const armArg = process.argv[2] || process.env.WIKI_ARM || 'raw';
  const armsToRun = armArg === 'all' ? ['raw', 'hono'] : [armArg];

  const results = [];
  for (const arm of armsToRun) {
    const res = await runJourney(arm);
    results.push(res);
  }

  const allOk = results.every((r) => r.ok);
  if (!allOk) {
    console.error('Some checks failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
