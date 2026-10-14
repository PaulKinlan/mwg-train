import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

const ROOT = new URL('../docs/portability/evidence/', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LOG = 'linux-7216ff3f.log.gz';
const GZIP_SHA256 = '6b7e6175bb5609d1d3e216f70bbd721dee050d1691e8da5ef3f29e481c379646';
const RAW_SHA256 = '611ddb225a5a6a41599ec8bad7517c1a825b5f3f7f142279efb09666f566acb0';

test('attached Linux portability log matches the digest and the attributed exit-0 result', () => {
  const compressed = readFileSync(new URL(LOG, ROOT));
  assert.equal(digest(compressed), GZIP_SHA256);
  const raw = gunzipSync(compressed);
  assert.equal(digest(raw), RAW_SHA256);
  const log = raw.toString('utf8');
  assert.match(log, /^commit=7216ff3fad314e9e1e13be1ffa62e6642a2d0438$/m);
  assert.match(log, /^platform=Linux 6\.12\.93 x86_64 GNU\/Linux$/m);
  assert.match(log, /^node=v24\.21\.0$/m);
  assert.match(log, /^chrome=Google Chrome 155\.0\.8059\.39\s*$/m);
  assert.match(log, /^> npm ci && npm test$/m);
  assert.match(log, /^added 48 packages, and audited 49 packages in 1s$/m);
  for (const [name, count] of Object.entries({ tests: 1258, pass: 1256, fail: 0, skipped: 2 })) {
    assert.match(log, new RegExp(`^ℹ ${name} ${count}$`, 'm'));
  }
  assert.doesNotMatch(log, /^✖/m);

  const record = readFileSync(new URL('README.md', ROOT), 'utf8');
  for (const value of [LOG, GZIP_SHA256, RAW_SHA256]) assert.ok(record.includes(value));
  assert.match(record, /macOS arm64 — attributed author report, not a raw-log attachment/);
  assert.match(record, /do not prove same-tree Linux\/macOS parity/i);
});
