import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tree hashing for snapshot verification.
 *
 * The algorithm: sorted recursive walk, skipping `node_modules` and anything starting with `.git`;
 * for each file, update with `<relative-path>\n` then the file bytes; hex sha256, `sha256:` prefix.
 */
export function hashTree(root) {
  const hash = createHash('sha256');
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else if (statSync(path).isFile()) hash.update(`${prefix}${entry.name}\n`).update(readFileSync(path));
    }
  };
  if (!existsSync(root)) return null;
  walk(root);
  return `sha256:${hash.digest('hex')}`;
}
