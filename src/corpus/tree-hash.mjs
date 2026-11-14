import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tree hashing for snapshot verification.
 *
 * The algorithm: sorted recursive walk, skipping `node_modules` and anything starting with `.git`;
 * for each file, update with `<relative-path>\n` then the file bytes; hex sha256, `sha256:` prefix.
 *
 * A directory reached through a symlink is walked, not skipped (mwg-train-yvop): `isDirectory()`
 * answers false for a symlink, so testing the dirent alone left a linked subtree's files out of the
 * hash while they still sat inside the project tree. Each directory's real path is recorded once, so
 * following a link cannot loop - a cycle lands on an already-visited real path and stops - and a
 * directory reachable under two names is hashed under the first name the sorted walk reaches.
 */
export function hashTree(root) {
  const hash = createHash('sha256');
  const visited = new Set();
  const walk = (dir, prefix = '') => {
    const real = realpathSync(dir);
    if (visited.has(real)) return;
    visited.add(real);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      const path = join(dir, entry.name);
      // `statSync` follows the link: a symlinked directory is walked like a real one.
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else if (stat.isFile()) hash.update(`${prefix}${entry.name}\n`).update(readFileSync(path));
    }
  };
  if (!existsSync(root)) return null;
  walk(root);
  return `sha256:${hash.digest('hex')}`;
}
