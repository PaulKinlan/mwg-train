import test from 'node:test';
import assert from 'node:assert/strict';

import { translateCapture } from '../src/capture/translate.mjs';
import { CAPTURE_VERSION, FLOW_VERSION } from '../src/capture/schema.mjs';

// The defect this file exists for: the translator used to carry the flow's steps through verbatim, so a generated
// journey contained {action, target, value} where the replay driver in src/corpus/harness.mjs reads
// step.fill / step.select / step.submit / step.expectText. The driver would navigate and then do nothing, and no
// gate would notice, because validateSpec does not inspect step structure. These tests go through translateCapture
// rather than the converter alone, so they fail on the old behaviour rather than merely document the new one.

const JOURNEY_KEYS = ['path', 'fill', 'select', 'submit', 'expectText'];

function capture() {
  return {
    capture_version: CAPTURE_VERSION,
    source: {
      url: 'https://shop.example.test/',
      final_url: 'https://shop.example.test/',
      captured_at: '2026-10-08T21:00:00Z',
      rights_ref: 'docs/provenance/assets/reproduction-studies.md',
      arm: 'A5_black_box_reproduction',
    },
    viewport: { width: 1280, height: 800, device_scale_factor: 1 },
    pages: [{
      path: '/',
      title: 'Checkout',
      landmarks: ['main'],
      headings: ['Checkout'],
      nav: ['/'],
      text_excerpt: 'Checkout',
      forms: [{
        id: 'checkout',
        action: '/order',
        method: 'post',
        controls: [
          { name: 'name', type: 'text', label: 'Name', required: true },
          { name: 'email', type: 'email', label: 'Email', required: true },
        ],
      }],
      links: [{ href: '/', text: 'Home' }],
    }],
    assets: {
      desktop_screenshot: { rel_path: 'A5/shop/desktop.png', sha256: 'a'.repeat(64), bytes: 1024 },
      mobile_screenshot: { rel_path: 'A5/shop/mobile.png', sha256: 'b'.repeat(64), bytes: 2048 },
      dom: { rel_path: 'A5/shop/dom.html', sha256: 'c'.repeat(64), bytes: 4096 },
    },
    console: [],
    requests: [{ url: 'https://shop.example.test/', method: 'GET', status: 200 }],
  };
}

function flow() {
  return {
    flow_version: FLOW_VERSION,
    source: { url: 'https://shop.example.test/', rights_ref: 'docs/provenance/assets/reproduction-studies.md', captured_at: '2026-10-08T21:00:00Z' },
    start_path: '/',
    steps: [
      { index: 0, path: '/', action: 'goto' },
      { index: 1, path: '/', action: 'fill', target: 'input[name=name]', value: 'Ada Lovelace' },
      { index: 2, path: '/', action: 'fill', target: 'input[name=email]', value: 'ada@example.test' },
      { index: 3, path: '/', action: 'submit', target: 'form#checkout', expected_path: '/order' },
      { index: 4, path: '/order', action: 'goto', expectText: 'Ada Lovelace' },
    ],
  };
}

test('journey steps are emitted in the shape the replay driver reads, never the flow\'s action shape', () => {
  const spec = translateCapture({ capture: capture(), flow: flow() });

  for (const step of spec.journey.steps) {
    for (const key of Object.keys(step)) {
      assert.ok(JOURNEY_KEYS.includes(key), `step carries "${key}"; the driver reads only ${JOURNEY_KEYS.join(', ')}`);
    }
  }

  // The three things the driver actually needs in order to perform the recorded flow.
  const filling = spec.journey.steps.find((s) => s.fill);
  assert.equal(filling.fill['input[name=name]'], 'Ada Lovelace', 'the filled value must be reachable as step.fill[selector]');
  const submitting = spec.journey.steps.find((s) => s.submit);
  assert.equal(submitting.submit, 'form#checkout', 'the submission must be reachable as step.submit');
  const expectation = spec.journey.steps.find((s) => s.expectText === 'Ada Lovelace');
  assert.ok(expectation, 'the observed value must be reachable as step.expectText');
  assert.equal(expectation.path, '/', 'the submit step lands on the generated read-by-reference page without navigating to /order');
  assert.equal(expectation.submit, 'form#checkout');
});

test('a step is only closed by its own submit, so fills and selects stay with the path they happened on', () => {
  const spec = translateCapture({ capture: capture(), flow: flow() });

  // The journey's whole point is the carried value: it is typed on /, submitted from /, and observed on /order.
  // If the converter emitted one step per action, or dropped the fill into the wrong step, the driver would
  // submit an empty form and every later assertion would be about nothing.
  // The converter keeps them in ONE step, which is what the driver expects: it applies step.fill and then
  // performs step.submit on the same step. Asserting a separate fill step would have asserted a shape the driver
  // would then have to reassemble - my first version of this test did exactly that and failed against correct code.
  const submitIndex = spec.journey.steps.findIndex((s) => s.submit);
  const fillIndex = spec.journey.steps.findIndex((s) => s.fill?.['input[name=name]']);
  assert.ok(fillIndex >= 0 && fillIndex <= submitIndex, 'the fill must be at or before the submit that carries it');
  const carried = spec.journey.steps[submitIndex].fill;
  assert.equal(carried?.['input[name=name]'], 'Ada Lovelace', 'the submit step must carry the recorded value itself');
  assert.equal(carried?.['input[name=email]'], 'ada@example.test', 'and every other value typed on that path');
});
