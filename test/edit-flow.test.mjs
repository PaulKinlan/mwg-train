/**
 * The edit-flow fix (mwg-train-q7v): a parameterised write route like /subscriptions/:id/edit is an
 * UPDATE of an existing record, so (a) the generated form action carries the seeded record's
 * reference, never the literal ':id', and (b) the handler upserts the record keyed by the captured
 * segment instead of inserting a new one. Verified in both arms over HTTP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildProjectFor, writeProject } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');

/** The tr-26 shape: web-shop base with the brief's parameterised edit route. */
function editArchetype() {
  const base = TRAINING_ARCHETYPES['web-shop'];
  return {
    ...base,
    routes: [
      { method: 'GET', path: '/', kind: 'page' },
      { method: 'POST', path: '/subscriptions/:id/edit', kind: 'write', redirect: () => '/subscriptions/${ref}' },
      { method: 'GET', path: '/subscriptions/:ref', kind: 'read-by-reference' },
    ],
  };
}

test('the generated form action substitutes the seeded reference, never the literal :id', () => {
  for (const arm of ['raw', 'hono']) {
    const { files } = buildProjectFor(editArchetype(), { frameworkName: arm });
    const page = files['app/page.mjs'];
    assert.equal(page.includes(':id'), false, `${arm} page emits a literal :id`);
    assert.ok(page.includes('action="/subscriptions/current/edit"'), `${arm} form action is the seeded edit path`);
    assert.ok(files['server.mjs'].includes('INSERT OR REPLACE'), `${arm} server upserts`);
  }
});

test('an edit POST updates the seeded record in place, in both arms', async (t) => {
  const archetype = editArchetype();
  const fillBody = (customer) =>
    new URLSearchParams(
      Object.fromEntries(Object.entries(archetype.journey.fill).map(([selector, value]) => [selector.match(/\[name=["']?([^\]"']+)/)[1], selector.includes('customer') ? customer : value])),
    ).toString();

  for (const arm of ['raw', 'hono']) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `editflow-${arm}-`));
      const port = arm === 'raw' ? 5530 : 5531;
      const { projectId, files, spec } = buildProjectFor(archetype, { frameworkName: arm });
      writeProject(dir, { projectId, files, spec });
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'test.sqlite')], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
      try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);

        // The seeded record exists before any edit: the edit form has something to update.
        const before = await fetch(`${base}/subscriptions/current`);
        assert.equal(before.status, 200, 'the seeded subscription is served');

        const first = await fetch(`${base}/subscriptions/current/edit`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: fillBody('Nadia Okonjo'),
          redirect: 'manual',
        });
        assert.equal(first.status, 303);
        assert.equal(first.headers.get('location'), '/subscriptions/current', 'the redirect keeps the edit target');

        const afterFirst = await (await fetch(`${base}/api/record/current`)).json();
        assert.equal(afterFirst.customer, 'Nadia Okonjo', 'the first edit is stored under the edit target');
        // The confirmation page renders for the updated record (the echo itself is client-side).
        const confirmFirst = await fetch(`${base}/subscriptions/current`);
        assert.equal(confirmFirst.status, 200);

        const second = await fetch(`${base}/subscriptions/current/edit`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: fillBody('Amara Okafor'),
          redirect: 'manual',
        });
        assert.equal(second.status, 303);

        const records = await (await fetch(`${base}/api/records`)).json();
        assert.equal(records.length, 1, `UPDATE, not INSERT: still one record after two edits (got ${records.length})`);
        assert.equal(records[0].customer, 'Amara Okafor', 'the second edit replaced the record');
      } finally {
        child.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
