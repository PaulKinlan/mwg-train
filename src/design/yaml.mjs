/**
 * A deliberately constrained YAML subset, used for the token block in a design.md frontmatter.
 *
 * The point is not to parse YAML. The point is that a token block is a machine-checked claim about a generated
 * stylesheet, so a block we cannot read exactly must fail loudly rather than being silently half-read. A general
 * YAML parser would accept far more than we need - anchors, aliases, flow collections, block scalars, tags,
 * multi-document streams - and every one of those is a way for a document to say something the checker does not
 * understand while still appearing to pass. So this subset accepts exactly the shapes the tokens need, and every
 * other shape is a finding naming the line.
 *
 * Supported, and nothing else:
 *   - a block mapping: `key: value`, nested by two spaces per level;
 *   - a block sequence: `- value`, nested under its key by two spaces;
 *   - scalars: bare strings, single- or double-quoted strings, integers, decimals, true, false, null;
 *   - a hex colour written bare, which is the one place a leading `#` is data rather than a comment. A `#`
 *     beginning a hex-coloured word is data wherever it appears, so `1px solid #8a8f98` is one value and is
 *     not mistaken for a trailing comment;
 *   - full-line comments beginning with `#`.
 *
 * Rejected, each with the line number: tabs, odd indentation, duplicates keys, flow collections, anchors, aliases,
 * tags, block scalars, directives, an unterminated quote, an unquoted value containing ': ', a key with neither a
 * value nor children, a list item written as a mapping, and unexpected indentation. A rejected line is reported, not
 * skipped silently: the value it would have produced is absent from the result, and the caller treats a non-empty
 * problem list as a failure.
 */

const KEY = /^([A-Za-z0-9_.-]+):(?: (.*))?$/;
const LIST_ITEM = /^- (.*)$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{3,8}$/;
const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+\.\d+$/;
// Shapes that belong to full YAML and that this subset deliberately does not implement. The structural check runs
// before the scalar-form checks below, because a value like '{a: 1}' is more usefully diagnosed as an unimplemented
// feature than as a bare value containing ': '.
const UNSUPPORTED = /[{}[\]&*|>%@`!]/;

function parseScalar(raw, problems, lineNo) {
  const text = raw.trim();
  if (text === '') return null;
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    if (text.length < 2 || text.at(-1) !== quote) {
      problems.push(`line ${lineNo}: unterminated ${quote === '"' ? 'double' : 'single'}-quoted string`);
      return null;
    }
    return text.slice(1, -1);
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (INTEGER.test(text)) return Number(text);
  if (DECIMAL.test(text)) return Number(text);
  if (HEX_COLOUR.test(text)) return text;
  const bad = UNSUPPORTED.exec(text);
  if (bad) {
    problems.push(`line ${lineNo}: '${bad[0]}' starts a YAML feature this subset does not implement`);
    return null;
  }
  const hash = text.search(/\s#(?![0-9a-fA-F]{3,8}(?:\s|$))/);
  if (hash !== -1) {
    problems.push(`line ${lineNo}: inline comments are not supported; put the comment on its own line`);
    return null;
  }
  if (text.includes(': ')) {
    problems.push(`line ${lineNo}: a bare value cannot contain ': '; quote it`);
    return null;
  }
  if (text.startsWith('#')) {
    problems.push(`line ${lineNo}: a value beginning with '#' is only understood as a hex colour`);
    return null;
  }
  return text;
}

function parseBlock(lines, cursor, indent, problems) {
  if (cursor.index >= lines.length || lines[cursor.index].indent < indent) return null;
  const first = lines[cursor.index];
  const sequence = first.content === '-' || LIST_ITEM.test(first.content);
  const value = sequence ? [] : {};

  while (cursor.index < lines.length) {
    const line = lines[cursor.index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      problems.push(`line ${line.lineNo}: unexpected indentation, expected ${indent} spaces`);
      cursor.index++;
      continue;
    }

    if (sequence) {
      if (line.content !== '-' && !LIST_ITEM.test(line.content)) {
        problems.push(`line ${line.lineNo}: expected a list item beginning with '- '`);
        cursor.index++;
        continue;
      }
      const rest = line.content === '-' ? '' : LIST_ITEM.exec(line.content)[1].trim();
      cursor.index++;
      if (rest === '') {
        value.push(parseBlock(lines, cursor, indent + 2, problems));
      } else if (KEY.test(rest)) {
        problems.push(`line ${line.lineNo}: a list item cannot be a mapping in this subset; nest a block instead`);
      } else {
        value.push(parseScalar(rest, problems, line.lineNo));
      }
      continue;
    }

    const match = KEY.exec(line.content);
    if (!match) {
      problems.push(`line ${line.lineNo}: expected "key: value"`);
      cursor.index++;
      continue;
    }
    const key = match[1];
    const rest = (match[2] ?? '').trim();
    if (Object.hasOwn(value, key)) problems.push(`line ${line.lineNo}: duplicate key '${key}'`);
    cursor.index++;
    if (rest === '') {
      const child = parseBlock(lines, cursor, indent + 2, problems);
      if (child === null) problems.push(`line ${line.lineNo}: '${key}' has neither a value nor any children`);
      value[key] = child;
    } else {
      value[key] = parseScalar(rest, problems, line.lineNo);
    }
  }
  return value;
}

/** Parses the subset above. Returns `{ value, problems }`; any problem means the document is not usable. */
export function parseYamlSubset(source) {
  const problems = [];
  const lines = [];
  for (const [index, raw] of source.split('\n').entries()) {
    const lineNo = index + 1;
    if (raw.includes('\t')) {
      problems.push(`line ${lineNo}: tab character; this subset indents with two spaces per level`);
      continue;
    }
    const trimmed = raw.replace(/\s+$/, '');
    if (trimmed === '') continue;
    if (trimmed.trimStart().startsWith('#')) continue;
    const indent = trimmed.length - trimmed.trimStart().length;
    if (indent % 2 !== 0) {
      problems.push(`line ${lineNo}: indentation of ${indent} spaces is not a multiple of two`);
      continue;
    }
    lines.push({ indent, content: trimmed.trim(), lineNo });
  }
  if (lines.length === 0) {
    // Append rather than replace: a block can be empty *because* every line was rejected, and dropping those
    // reasons would turn a malformed document into an uninformative one.
    problems.push('the block is empty');
    return { value: null, problems };
  }
  const value = parseBlock(lines, { index: 0 }, 0, problems);
  return { value, problems };
}

/**
 * Splits a document into its frontmatter block and its body. A document without a leading `---` fence is a finding
 * rather than an empty frontmatter, because a design.md is required to carry one.
 */
export function parseFrontmatter(source) {
  const problems = [];
  const lines = source.split('\n');
  if (lines[0].replace(/\s+$/, '') !== '---') {
    return { frontmatter: null, body: source, problems: ['the document does not begin with a --- frontmatter fence'] };
  }
  const end = lines.findIndex((line, index) => index > 0 && line.replace(/\s+$/, '') === '---');
  if (end === -1) {
    return { frontmatter: null, body: source, problems: ['the frontmatter fence is never closed'] };
  }
  const parsed = parseYamlSubset(lines.slice(1, end).join('\n'));
  problems.push(...parsed.problems);
  return { frontmatter: parsed.value, body: lines.slice(end + 1).join('\n'), problems };
}
