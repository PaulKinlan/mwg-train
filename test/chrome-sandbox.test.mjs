import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CHROME_CANDIDATES, chromeArgs, chromeBinary, chromeIsUnsandboxed, launchChrome } from '../src/corpus/cdp.mjs';

// The sandbox is not "did Chrome start": --no-sandbox was passed for a long time precisely because Chrome starts
// either way, and a run that passes looks identical to one that does not. The property that changes is whether a
// renderer is in its own user namespace, so that is what is measured here (mwg-train-u7ev).

test('standard macOS Chrome binaries are discoverable and a missing binary explains CHROME_PATH', () => {
  assert.ok(CHROME_CANDIDATES.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  assert.ok(CHROME_CANDIDATES.includes('/Applications/Chromium.app/Contents/MacOS/Chromium'));
  assert.throws(() => chromeBinary(['/this/Chrome/binary/does/not/exist']),
    (error) => error.code === 'NO_CHROME' && /Set CHROME_PATH/.test(error.message));
});

test('the default launch arguments do not disable the sandbox', () => {
  const args = chromeArgs({ userDataDir: '/tmp/example' });
  assert.equal(args.includes('--no-sandbox'), false, 'the renderer sandbox must be on unless an operator opts out');
  assert.equal(args.filter((a) => a.startsWith('--user-data-dir=')).length, 1);
  assert.equal(args.at(-1), 'about:blank');
});

test('the opt-in is the only thing that adds --no-sandbox, and it adds it exactly once', () => {
  const args = chromeArgs({ userDataDir: '/tmp/example', unsandboxed: true });
  assert.equal(args.filter((a) => a === '--no-sandbox').length, 1);
});

test('the opt-in is a value an operator sets, not a default', () => {
  assert.equal(chromeIsUnsandboxed({}), false);
  assert.equal(chromeIsUnsandboxed({ MWG_ALLOW_UNSANDBOXED_CHROME: '0' }), false);
  assert.equal(chromeIsUnsandboxed({ MWG_ALLOW_UNSANDBOXED_CHROME: '1' }), true);
});

test('a caller argument passes only if it is on the allowlist, whatever it is', () => {
  // mwg-train-p58l was a caller passing --no-sandbox in extra args, and my fix for it was a denylist of
  // sandbox-disabling flags. mwg-train-kkcv then named --disable-seccomp-filter-sandbox, which the list did not have.
  // A denylist of a browser's flags cannot be finished, so this asserts the opposite property: what is not on the
  // allowlist does not arrive, including flags nobody has thought of yet - the last case here is invented.
  for (const flag of [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu-sandbox',
    '--disable-seccomp-filter-sandbox', // mwg-train-kkcv
    '--disable-namespace-sandbox',
    '--disable-something-sandbox', // not a real flag: the point is that it does not have to be
    '--load-extension=/tmp/anything',
  ]) {
    const args = chromeArgs({ userDataDir: '/tmp/example', extra: [flag] });
    assert.equal(args.includes(flag), false, `${flag} must not reach Chrome`);
  }
});

test('the allowlisted argument is exact: no spelling of the same flag can widen it', () => {
  // mwg-train-c1nk: allowing --proxy-bypass-list by NAME let a caller pass --proxy-bypass-list=* and bypass the
  // intercepting proxy entirely, which was the enforcement point for the capture destination policy. The flag names the
  // knob; the value is how far it turns, so the allowlist holds a whole argument and every other value is dropped.
  for (const arg of [
    '--proxy-bypass-list=*',
    '--proxy-bypass-list=<-loopback>,*',
    '--proxy-bypass-list=*.<local>',
    '--proxy-bypass-list=',
    '--proxy-bypass-list=<-loopback> ', // a trailing space is a different argument
    '--proxy-bypass-list=<-loopback>x',
  ]) {
    const args = chromeArgs({ userDataDir: '/tmp/example', extra: [arg] });
    assert.equal(args.some((a) => a.startsWith('--proxy-bypass-list')), false, `${arg} must not reach Chrome`);
  }
});

test('a caller argument that IS on the allowlist arrives, value and all', () => {
  // The other direction, because an allowlist that drops everything passes every refusal test above. This also pins
  // the one argument the parked capture proxy work needs.
  const kept = chromeArgs({ userDataDir: '/tmp/example', extra: ['--proxy-bypass-list=<-loopback>', '--no-sandbox'] });
  assert.ok(kept.includes('--proxy-bypass-list=<-loopback>'));
  assert.equal(kept.includes('--no-sandbox'), false);
});

test('the opt-in does not reopen the caller path', () => {
  // MWG_ALLOW_UNSANDBOXED_CHROME=1 is how a host that cannot sandbox is dealt with. It is not a second route for
  // caller arguments, and a caller cannot borrow it.
  const args = chromeArgs({ userDataDir: '/tmp/example', extra: ['--disable-seccomp-filter-sandbox'], unsandboxed: true });
  assert.equal(args.includes('--disable-seccomp-filter-sandbox'), false);
  assert.equal(args.filter((a) => a === '--no-sandbox').length, 1, 'the opt-in still adds its own flag, exactly once');
});

test('launchChrome says out loud which argument it dropped, and what the rule is', async (t) => {
  // Silently dropping it would be the other half of the same problem: a caller that asked for something and did not
  // get it needs to be told, or the next run looks like a mystery. The message names the allowlist so the answer to
  // "I need this argument" is in the warning itself. The dropped one here is the wildcard from mwg-train-c1nk.
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning);
  process.on('warning', onWarning);
  t.after(() => process.off('warning', onWarning));

  const chrome = await launchChrome({ args: ['--proxy-bypass-list=*'] });
  t.after(() => chrome.close());
  const dropped = warnings.find((w) => w.code === 'MWG_CALLER_ARGS_DROPPED');
  assert.ok(dropped, 'the dropped argument must be announced');
  assert.match(dropped.message, /--proxy-bypass-list=\*/);
  assert.match(dropped.message, /CALLER_ARG_ALLOWLIST/);
});

test('the real launch path drives generated JS with the sandbox on', async (t) => {
  // Drives launchChrome itself rather than spawning Chrome here: the question is whether the code this project
  // actually uses runs generated JS while sandboxed, and a test that launches its own browser would keep passing if
  // launchChrome re-added the flag (the mistake an earlier change on this project made - measuring Chrome's
  // behaviour while claiming to measure the caller's).
  const chrome = await launchChrome();
  t.after(() => chrome.close());
  const page = await chrome.newPage();
  await page.goto('data:text/html,<title>sandboxed</title><div id="value">nothing</div>');
  // evaluate takes an expression string with an explicit return, as the rest of this suite uses it.
  const result = await page.evaluate(`
    const node = document.querySelector('#value');
    node.textContent = 'generated code ran';
    return { title: document.title, text: node.textContent };
  `);
  assert.deepEqual(result, { title: 'sandboxed', text: 'generated code ran' });
});

// The measurement needs /proc, so it is Linux-only. Where it cannot be measured it is better to say so than to assert
// something weaker under the same name.
const linuxOnly = { skip: process.platform !== 'linux' ? 'needs /proc to read namespace membership' : false };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Launch Chrome with the given arguments, and report the user namespace each renderer runs in. Always cleans up. */
async function rendererNamespaces({ unsandboxed }) {
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-check-'));
  // A real page, not about:blank: headless Chrome spawns no renderer at all for an empty document, so a probe that
  // loads about:blank counts the crashpad handlers and zygotes instead and reports them as renderers. The first
  // version of this test did exactly that and its numbers were meaningless even though its direction was right.
  const child = spawn(chromeBinary(), chromeArgs({ userDataDir: dir, unsandboxed, url: 'data:text/html,<p>sandbox</p>' }), {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, TMPDIR: dir },
  });
  try {
    let stderr = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Chrome did not report an endpoint: ${stderr.split('\n').filter(Boolean).slice(-1)[0] ?? ''}`)), 20_000);
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (/DevTools listening on/.test(stderr)) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited early with code ${code}: ${stderr.split('\n').filter(Boolean).slice(-1)[0] ?? ''}`));
      });
    });
    // Renderers are spawned after the endpoint is announced, and how long after depends on the host, so poll for them
    // rather than assume a fixed delay is enough - a fixed 500ms passed on one run and found none on the next.
    const collect = () => {
      const found = [];
      for (const entry of readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) continue;
        let command;
        try {
          // Read the file rather than shelling out: a shell command built with a template literal turns `\\0` into a
          // real NUL byte, argv cannot contain one, and execSync throws - which a bare catch then swallowed, so an
          // earlier version of this scan silently found nothing and reported "no renderers" as a fact about Chrome.
          command = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
        } catch {
          continue; // the process is gone, or is not ours to read
        }
        if (!command.includes(dir) || !command.includes('--type=renderer')) continue;
        try {
          found.push(readlinkSync(`/proc/${entry}/ns/user`));
        } catch {
          /* raced with exit */
        }
      }
      return found;
    };
    let namespaces = [];
    for (let attempt = 0; attempt < 25 && namespaces.length === 0; attempt += 1) {
      await sleep(200);
      namespaces = collect();
    }
    assert.ok(namespaces.length > 0, 'expected at least one renderer to inspect');
    return namespaces;
  } finally {
    // Its own process group, so the zygotes, the gpu process and the crashpad handler go with it; a browser left
    // behind by a test is the orphan the reaper exists to sweep.
    try {
      child.kill('SIGKILL');
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the sandbox is on by default and the opt-in turns it off - measured on the renderers, not on "it started"', linuxOnly, async () => {
  const ours = readlinkSync('/proc/self/ns/user');

  const sandboxed = await rendererNamespaces({ unsandboxed: false });
  assert.equal(
    sandboxed.filter((ns) => ns !== ours).length,
    sandboxed.length,
    'every renderer must be in its own user namespace when the sandbox is on',
  );

  // The other direction, because a measurement that reports "namespaced" whatever the arguments would pass the
  // assertion above while measuring nothing. With the flag, the same probe must report the opposite.
  const unsandboxed = await rendererNamespaces({ unsandboxed: true });
  assert.equal(
    unsandboxed.filter((ns) => ns !== ours).length,
    0,
    'with --no-sandbox no renderer may be in its own user namespace, so this is what the default moved away from',
  );
});
