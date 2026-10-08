/**
 * The owner-auth scan, Paul's corpus rule of 2026-10-08:
 *
 *   "we just need to make sure when training owner Auth is not included to bias the results."
 *
 * Read precisely: synthetic demo login with fake users is a WANTED feature of some archetypes
 * (design brief clause 2), so the rule is not "no auth anywhere". It is NO OWNER AUTH: the owner's
 * identity, tokens, session secrets and the viewer/gate mechanism itself must never appear in a
 * site's source or in a corpus record. A model trained on owner-auth scaffolding could learn the
 * gate's idiom rather than the MWG property, and nothing in the acceptance criteria would reveal it.
 *
 * The scan is FAIL-CLOSED: if the identity configuration is missing, unreadable or invalid, the
 * result is ERROR and the pair must be treated as not accepted. A scan that cannot run is not a
 * scan that passed.
 *
 * Findings report the pattern id, the file and the line number - NEVER the matched text, which may
 * itself be a secret value.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export class ScanConfigError extends Error {}

const REQUIRED_CONFIG_KEYS = ['owner_identifiers', 'credential_env_names', 'proxy_header_names', 'proxy_endpoints', 'token_patterns'];

export function loadScanConfig(path) {
  if (!existsSync(path)) throw new ScanConfigError(`owner-identity config is missing: ${path}`);
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ScanConfigError(`owner-identity config is not parseable JSON: ${error.message}`);
  }
  for (const key of REQUIRED_CONFIG_KEYS) {
    if (!Array.isArray(config[key])) throw new ScanConfigError(`owner-identity config is invalid: '${key}' must be an array`);
  }
  for (const pattern of config.token_patterns) {
    if (typeof pattern?.id !== 'string' || typeof pattern?.regex !== 'string') {
      throw new ScanConfigError('owner-identity config is invalid: every token_patterns entry needs an id and a regex');
    }
    try {
      new RegExp(pattern.regex, 'gi');
    } catch (error) {
      throw new ScanConfigError(`owner-identity config is invalid: token pattern '${pattern.id}' does not compile: ${error.message}`);
    }
  }
  return config;
}

/** Build the matcher list once. Literal entries are case-insensitive substrings; tokens are regexes. */
export function buildMatchers(config) {
  const literals = [];
  for (const [kind, values] of [
    ['owner-identifier', config.owner_identifiers],
    ['credential-env-name', config.credential_env_names],
    ['proxy-header-name', config.proxy_header_names],
    ['proxy-endpoint', config.proxy_endpoints],
  ]) {
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) literals.push({ kind, id: `${kind}:${value.toLowerCase()}`, needle: value.toLowerCase() });
    }
  }
  const regexes = config.token_patterns.map((pattern) => ({
    kind: 'token-pattern',
    id: `token-pattern:${pattern.id}`,
    regex: new RegExp(pattern.regex, 'gi'),
  }));
  return { literals, regexes };
}

function looksBinary(buffer) {
  const probe = buffer.subarray(0, Math.min(buffer.length, 512));
  return probe.includes(0);
}

function* walkFiles(root, skipDirs) {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) stack.push(join(dir, entry.name));
      } else if (statSync(join(dir, entry.name)).isFile()) {
        yield join(dir, entry.name);
      }
    }
  }
}

/**
 * Scan one tree for owner-identifying material. Returns { status: 'PASS' | 'FAIL', findings }.
 * `findings` entries: { file, line, patternId, kind }. The matched text is deliberately absent.
 */
export function scanTree(root, matchers, options = {}) {
  const skipDirs = options.skipDirs ?? ['node_modules', '.git'];
  const skipExtensions = options.skipExtensions ?? [];
  const maxBytes = options.maxFileBytes ?? 1_048_576;
  const findings = [];
  if (!existsSync(root)) return { status: 'FAIL', findings: [{ file: null, line: null, patternId: 'tree-missing', kind: 'scan-error' }] };
  for (const file of walkFiles(root, skipDirs)) {
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
    if (skipExtensions.includes(ext)) continue;
    const size = statSync(file).size;
    if (size > maxBytes) {
      findings.push({ file: file, line: null, patternId: 'file-too-large-to-scan', kind: 'scan-error' });
      continue;
    }
    const buffer = readFileSync(file);
    if (looksBinary(buffer)) continue;
    const text = buffer.toString('utf8');
    const lowered = text.toLowerCase();
    const lines = text.split('\n');
    const rel = relative(root, file);
    for (const literal of matchers.literals) {
      let index = lowered.indexOf(literal.needle);
      while (index !== -1) {
        findings.push({ file: rel, line: lineNumberAt(text, index, lines), patternId: literal.id, kind: literal.kind });
        index = lowered.indexOf(literal.needle, index + literal.needle.length);
      }
    }
    for (const { id, kind, regex } of matchers.regexes) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        findings.push({ file: rel, line: lineNumberAt(text, match.index, lines), patternId: id, kind });
        if (match[0].length === 0) regex.lastIndex += 1;
      }
    }
  }
  const errorFindings = findings.filter((finding) => finding.kind === 'scan-error');
  return { status: findings.length === 0 ? 'PASS' : 'FAIL', findings, scan_errors: errorFindings.length };
}

function lineNumberAt(text, index, lines) {
  // Count newlines before index; lines is passed in to avoid splitting twice for large files.
  let line = 1;
  let offset = 0;
  for (const current of lines) {
    if (offset + current.length >= index) return line;
    offset += current.length + 1;
    line += 1;
  }
  return line;
}

/**
 * Scan an original/uplifted pair. Fail-closed at the pair level: any tree that fails or cannot be
 * scanned fails the pair. The pair result carries per-version detail for the evidence page.
 */
export function scanPair({ originalDir, upliftedDir, configPath }) {
  let config;
  try {
    config = loadScanConfig(configPath);
  } catch (error) {
    if (error instanceof ScanConfigError) {
      return { status: 'ERROR', reason: error.message, original: null, uplifted: null };
    }
    throw error;
  }
  const matchers = buildMatchers(config);
  const scanOptions = config.scan ?? {};
  const original = originalDir ? scanTree(originalDir, matchers, scanOptions) : { status: 'FAIL', findings: [{ file: null, line: null, patternId: 'tree-missing', kind: 'scan-error' }] };
  const uplifted = upliftedDir ? scanTree(upliftedDir, matchers, scanOptions) : { status: 'FAIL', findings: [{ file: null, line: null, patternId: 'tree-missing', kind: 'scan-error' }] };
  const passed = original.status === 'PASS' && uplifted.status === 'PASS';
  return { status: passed ? 'PASS' : 'FAIL', original, uplifted };
}
