import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCapture, validateFlow, isReservedControlName, CAPTURE_VERSION, FLOW_VERSION } from '../src/capture/schema.mjs';

// A minimal capture that MUST pass. Every negative case below is built by mutating exactly one thing, so a
// failure names the rule that broke rather than the fixture.
function goodCapture() {
  return {
    capture_version: CAPTURE_VERSION,
    source: {
      url: 'https://example.test/',
      final_url: 'https://example.test/',
      captured_at: '2026-10-08T21:00:00Z',
      rights_ref: 'docs/provenance/assets/reproduction-studies.md',
      arm: 'A5_black_box_reproduction',
    },
    viewport: { width: 1280, height: 800, device_scale_factor: 1 },
    pages: [{
      path: '/',
      title: 'Example',
      landmarks: ['main'],
      headings: ['Welcome'],
      nav: ['/'],
      text_excerpt: 'Welcome',
      forms: [{
        action: '/order',
        method: 'post',
        controls: [
          { name: 'email', type: 'email', label: 'Email', required: true },
          { name: 'size', type: 'select', label: 'Size', required: false, options: ['s', 'm'] },
        ],
      }],
      links: [{ href: '/', text: 'Home' }],
    }],
    assets: {
      desktop_screenshot: { rel_path: 'A5/site/desktop.png', sha256: 'a'.repeat(64), bytes: 1024 },
      mobile_screenshot: { rel_path: 'A5/site/mobile.png', sha256: 'b'.repeat(64), bytes: 2048 },
      dom: { rel_path: 'A5/site/dom.html', sha256: 'c'.repeat(64), bytes: 4096 },
    },
    console: [],
    requests: [{ url: 'https://example.test/', method: 'GET', status: 200 }],
  };
}

function goodFlow() {
  return {
    flow_version: FLOW_VERSION,
    source: { url: 'https://example.test/', rights_ref: 'docs/provenance/assets/reproduction-studies.md', captured_at: '2026-10-08T21:00:00Z' },
    start_path: '/',
    steps: [
      { index: 0, path: '/', action: 'goto' },
      { index: 1, path: '/', action: 'fill', target: 'input[name=email]', value: 'buyer@example.test' },
      { index: 2, path: '/', action: 'submit', target: 'form#order', expected_path: '/thanks' },
      { index: 3, path: '/thanks', action: 'goto', expectText: 'buyer@example.test' },
    ],
  };
}

// Mutate one field of a good record and assert the validator refuses it with a problem naming that field.
function refuses(mutate, field, build = goodCapture, validate = validateCapture) {
  const record = build();
  mutate(record);
  const problems = validate(record);
  assert.ok(problems.length > 0, `expected a refusal mentioning ${field}`);
  assert.ok(problems.some((p) => p.includes(field)), `expected a problem naming ${field}, got ${JSON.stringify(problems)}`);
}

test('a well-formed capture passes, and so does a well-formed flow', () => {
  assert.deepEqual(validateCapture(goodCapture()), []);
  assert.deepEqual(validateFlow(goodFlow()), []);
});

test('a capture without a rights reference is refused, so an unauthorised capture cannot be stored', () => {
  refuses((c) => { c.source.rights_ref = '   '; }, 'rights_ref');
  refuses((c) => { delete c.source.rights_ref; }, 'rights_ref');
});

test('a capture may only claim a quarantined arm', () => {
  // A1/A6 belong to this repo's authored corpora, whose manifests forbid third-party material. A capture that
  // claimed one would route raw third-party bytes into the trainable tree.
  refuses((c) => { c.source.arm = 'A1_self_generated'; }, 'arm');
  refuses((c) => { c.source.arm = 'A6_evaluation'; }, 'arm');
});

test('asset paths cannot escape the quarantine store', () => {
  refuses((c) => { c.assets.dom.rel_path = '/etc/passwd'; }, 'rel_path');
  refuses((c) => { c.assets.dom.rel_path = '../../public/data/dom.html'; }, 'rel_path');
});

test('an asset hash must be a real sha256, because the hash is the only thing that makes the bytes checkable', () => {
  refuses((c) => { c.assets.desktop_screenshot.sha256 = 'not-a-hash'; }, 'sha256');
  refuses((c) => { c.assets.desktop_screenshot.sha256 = 'A'.repeat(64); }, 'sha256');
  refuses((c) => { c.assets.desktop_screenshot.bytes = 0; }, 'bytes');
});

test('a duplicate page path is refused: two different pages reported under one path', () => {
  refuses((c) => { c.pages.push({ ...c.pages[0] }); }, 'duplicate');
});

test('control names must survive raw interpolation into name="<name>"', () => {
  refuses((c) => { c.pages[0].forms[0].controls[0].name = 'email"; onload="x'; }, 'name');
  refuses((c) => { c.pages[0].forms[0].controls[0].name = '1st'; }, 'name');
  refuses((c) => { c.pages[0].forms[0].controls[0].name = ''; }, 'name');
});

test('a control type the generators cannot render is refused rather than dropped by a translator later', () => {
  refuses((c) => { c.pages[0].forms[0].controls[0].type = 'range'; }, 'type');
});

test('a select must record its options, or the re-implementation cannot render something the capture saw', () => {
  refuses((c) => { delete c.pages[0].forms[0].controls[1].options; }, 'options');
});

test('a flow step index must match its position, so a reordered recording is caught instead of replayed', () => {
  refuses((f) => { f.steps[2].index = 5; }, 'index', goodFlow, validateFlow);
});

test('a recording may not assert text no earlier step supplied', () => {
  // The carried-state rule: without it a flow could claim any page content it liked and still pass.
  refuses((f) => { f.steps[3].expectText = 'Order confirmed'; }, 'expectText', goodFlow, validateFlow);
});

test('a step target must name exactly one complete element', () => {
  refuses((f) => { f.steps[1].target = '[name=email]'; }, 'target', goodFlow, validateFlow);
  refuses((f) => { f.steps[1].target = 'input'; }, 'target', goodFlow, validateFlow);
  refuses((f) => { f.steps[2].target = '#order .submit'; }, 'target', goodFlow, validateFlow);
});

test('a recorded flow cannot claim to have set the record reference', () => {
  assert.equal(isReservedControlName('ref'), true);
  assert.equal(isReservedControlName('email'), false);
});

test('every problem is reported, not just the first, so one pass tells the whole story', () => {
  const c = goodCapture();
  c.source.rights_ref = '';
  c.assets.dom.sha256 = 'nope';
  const problems = validateCapture(c);
  assert.ok(problems.length >= 2, `expected several problems, got ${JSON.stringify(problems)}`);
});
