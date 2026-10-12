import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'scaffold-eval-projects.mjs');

test('scaffold-eval-projects cleans up its eval-snapshot temp directories', () => {
  const getSnapshots = () => readdirSync(tmpdir()).filter(f => f.startsWith('eval-snapshot-'));
  
  const before = getSnapshots();
  
  const run = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8', timeout: 60000 });
  
  assert.equal(run.status, 0, `Expected scaffold-eval-projects to pass, stderr: ${run.stderr}\nstdout: ${run.stdout}`);
  
  const after = getSnapshots();
  const leaked = after.filter(d => !before.includes(d));
  
  assert.deepEqual(leaked, [], `scaffold-eval-projects leaked temp directories: ${leaked.join(', ')}`);
});