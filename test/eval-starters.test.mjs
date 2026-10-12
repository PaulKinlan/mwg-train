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

    // Trust pointer click on the SECOND span option (which is "10")
    const inputVal = await r03Page.evaluate(`
      const widget = document.querySelector('.amount-widget');
      if (!widget) return null;
      const spans = widget.querySelectorAll('span');
      if (spans.length < 2) return null;
      spans[1].click();
      const input = document.querySelector('.amount-widget input');
      return input ? input.value : null;
    `);
    assert.strictEqual(inputVal, "10", "Input value should be updated to 10 via pointer click");

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
