import test from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { createRoutes, serve, openStore } from '../src/eval/site-kit.mjs';

test('Starter defects test: mwg-train-n2wa', async () => {
  let chrome = null;
  let r03Server = null;
  let r02Server = null;
  try {
    chrome = await launchChrome();

    // Test fam-r03 custom combobox pointer submit
    const r03Spec = JSON.parse(readFileSync('docs/eval/projects/repair/fam-r03/spec.json', 'utf8'));
    const r03Store = openStore('/tmp/r03-store.json', r03Spec.seed);
    const r03Routes = createRoutes(r03Spec, r03Store);
    r03Server = await serve(r03Routes);

    const r03Page = await chrome.newPage();
    await r03Page.goto(`http://127.0.0.1:${r03Server.port}/expenses/new`);
    await r03Page.type('input[name="description"]', 'Team Lunch');
    await r03Page.type('input[name="spent_on"]', '2026-10-12');

    // A TRUSTED pointer click on the SECOND span option (which is "10").
    //
    // This used to call `spans[1].click()` inside evaluate. That is a synthetic click: it produces no
    // pointerdown and performs no hit-testing, so a widget that covered its own options, set
    // `pointer-events: none`, or laid them out under another element still passed this test. The comment
    // above the old code claimed a "Trust pointer click", so the assertion was the opposite of what the
    // test said it was doing - the version of "it passes" that proves nothing (mwg-train-cu9b).
    //
    // Real mouse events at the option's own centre mean a hit-testing or pointer-events regression now
    // fails here rather than passing silently.
    const secondSpan = await r03Page.evaluate(`
      const widget = document.querySelector('.amount-widget');
      if (!widget) return null;
      const spans = widget.querySelectorAll('span');
      if (spans.length < 2) return null;
      const bounds = spans[1].getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    `);
    assert.ok(secondSpan, 'the amount widget must expose at least two span options to click');
    await r03Page.realPointer(secondSpan.x, secondSpan.y);
    const inputVal = await r03Page.evaluate(`
      const input = document.querySelector('.amount-widget input');
      return input ? input.value : null;
    `);
    assert.strictEqual(inputVal, "10", "Input value should be updated to 10 via a trusted pointer click");

    await r03Page.submit('form');
    
    const r03Url = await r03Page.evaluate('return location.href');
    const r03Html = await r03Page.evaluate('return document.body.innerHTML');
    
    assert.match(r03Html, /<dt>amount<\/dt><dd>10<\/dd>/);

    // Test fam-r02 no-persistence defect
    const r02Spec = JSON.parse(readFileSync('docs/eval/projects/repair/fam-r02/spec.json', 'utf8'));
    const r02Store = openStore('/tmp/r02-store.json', r02Spec.seed);
    const r02Routes = createRoutes(r02Spec, r02Store);
    r02Server = await serve(r02Routes);

    const r02Page = await chrome.newPage();
    await r02Page.goto(`http://127.0.0.1:${r02Server.port}/register`);
    await r02Page.type('input[name="name"]', 'Runner');
    await r02Page.type('input[name="email"]', 'runner@example.test');
    await r02Page.selectOption('select[name="ticket"]', 'standard');
    await r02Page.submit('form');

    // First load after submit should render the confirmation page
    const r02Html1 = await r02Page.evaluate('return document.body.innerHTML');
    assert.match(r02Html1, /<dt>name<\/dt><dd>Runner<\/dd>/);

    // Reload the page
    await r02Page.goto(await r02Page.evaluate('return location.href'));
    const r02Html2 = await r02Page.evaluate('return document.body.innerHTML');
    
    // The defect makes it disappear on reload, returning 404
    assert.match(r02Html2, /<h1>Not found<\/h1>/);

  } finally {
    if (chrome) await chrome.close();
    if (r03Server) r03Server.server.close();
    if (r02Server) r02Server.server.close();
  }
});
