// Interval arithmetic for IP address ranges (mwg-train-i147).
//
// Why this exists: a claim like "the capture policy blocks exactly what the IANA registries mark not globally
// reachable" has to be CHECKED, and it cannot be checked by sampling. The registry test that came before this parsed
// each row into CIDR text and then sampled one address from it; when that was improved to first/middle/last for large
// prefixes it still passed a mutant with a hole at 10.0.0.77 inside a blocked 10.0.0.0/8, because 10.0.0.77 sits
// between the first sample and the middle one. Three samples are three instances, not the shape. A stride scan has the
// same defect at a different scale. The only honest check is set equality over discrete integer intervals, which is
// what this module provides: every address in a prefix is represented by exactly one [start, end] pair, and comparing
// two sets of pairs is exact. IPv6 needs BigInt and unaligned prefixes handled correctly (2001:20::/28 is not
// 2001:20::/32), which is why nothing here goes through floating point or string comparison.
//
// Terms used below: a RANGE is { family, start, end } with start <= end, both BigInt, and family 4 or 6. A SET is an
// array of ranges. Ranges of different families never merge and never overlap. Every function returns new arrays and
// never mutates its arguments.

export const IPV4_BITS = 32;
export const IPV6_BITS = 128;

const MAX_VALUE = new Map([
  [4, (1n << 32n) - 1n],
  [6, (1n << 128n) - 1n],
]);

const addressError = (text, why) => {
  throw new TypeError(`not an IP address: ${JSON.stringify(String(text))} (${why})`);
};

/** Parses one dotted-quad IPv4 literal to a BigInt, or throws. Strict: no shorthand forms, no leading zeros. */
export function parseIpv4(text) {
  const parts = String(text).split('.');
  if (parts.length !== 4) addressError(text, 'a dotted quad has four parts');
  let value = 0n;
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) addressError(text, `"${part}" is not a decimal octet`);
    const octet = Number(part);
    if (octet > 255) addressError(text, `octet ${octet} is out of range`);
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

/** Parses one IPv6 literal to a BigInt, or throws. Handles "::" once, and an embedded IPv4 tail. */
export function parseIpv6(text) {
  const source = String(text);
  if (source.includes('.')) {
    // An embedded IPv4 tail (::ffff:127.0.0.1, 64:ff9b::8.8.8.8) is two groups' worth of address, so it is rewritten
    // as those two groups and parsed by the same code path rather than by a second IPv6 parser.
    const cut = source.lastIndexOf(':');
    if (cut === -1) addressError(text, 'a dotted tail must follow a colon');
    const tail = parseIpv4(source.slice(cut + 1));
    const head = source.slice(0, cut + 1);
    const groups = `${((tail >> 16n) & 0xffffn).toString(16)}:${(tail & 0xffffn).toString(16)}`;
    return parseIpv6(head + groups);
  }
  const halves = source.split('::');
  if (halves.length > 2) addressError(text, 'at most one "::" is allowed');
  const groupsOf = (part) => (part === '' ? [] : part.split(':'));
  const left = groupsOf(halves[0]);
  const right = halves.length === 2 ? groupsOf(halves[1]) : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && left.length !== 8) addressError(text, `an uncompressed address has 8 groups, found ${left.length}`);
  if (halves.length === 2 && missing < 1) addressError(text, '"::" must stand for at least one group');
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) addressError(text, `"${group}" is not a hexadecimal group`);
    value = (value << 16n) | BigInt(`0x${group}`);
  }
  return value;
}

/** Parses any literal, returning { family, value }, or throws. A literal carrying a colon is IPv6. */
export function parseAddress(text) {
  const source = String(text).trim();
  if (source.includes(':')) return { family: 6, value: parseIpv6(source) };
  return { family: 4, value: parseIpv4(source) };
}

/** Formats a BigInt back to its canonical literal, so a failing assertion can name the address it is about. */
export function formatAddress(family, value) {
  if (family === 4) {
    return [24n, 16n, 8n, 0n].map((shift) => (value >> shift) & 0xffn).join('.');
  }
  const groups = [];
  for (let shift = 112n; shift >= 0n; shift -= 16n) groups.push((value >> shift) & 0xffffn);
  // Compress the longest run of zero groups, as canonical IPv6 does, so messages match what a reader typed.
  let best = { at: -1, length: 0 };
  let at = -1;
  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === 0n) {
      if (at === -1) at = index;
      const length = index - at + 1;
      if (length > best.length) best = { at, length };
    } else {
      at = -1;
    }
  }
  const text = groups.map((group) => group.toString(16));
  if (best.length < 2) return text.join(':');
  return `${text.slice(0, best.at).join(':')}::${text.slice(best.at + best.length).join(':')}`;
}

/**
 * Parses a CIDR, returning { family, start, end, bits }. Host bits below the prefix are masked off rather than
 * rejected, because a registry row is written as a prefix and 2001:20::/28 has to become the range it denotes.
 */
export function parseCidr(text) {
  const source = String(text).trim();
  const slash = source.lastIndexOf('/');
  if (slash === -1) addressError(text, 'a CIDR needs a prefix length');
  const { family, value } = parseAddress(source.slice(0, slash));
  const rawBits = source.slice(slash + 1);
  if (!/^(0|[1-9][0-9]{0,2})$/.test(rawBits)) addressError(text, `"${rawBits}" is not a prefix length`);
  const bits = Number(rawBits);
  const width = family === 4 ? IPV4_BITS : IPV6_BITS;
  if (bits > width) addressError(text, `/${bits} is wider than an IPv${family} address`);
  const hostBits = BigInt(width - bits);
  const start = (value >> hostBits) << hostBits;
  const end = start | ((1n << hostBits) - 1n);
  return { family, start, end, bits };
}

/** A single address as a one-element range. */
export function addressRange(text) {
  const { family, value } = parseAddress(text);
  return { family, start: value, end: value };
}

const byStart = (left, right) => (left.family !== right.family ? left.family - right.family : left.start < right.start ? -1 : left.start > right.start ? 1 : 0);

/**
 * Sorts and merges a set of ranges: overlapping and TOUCHING ranges become one (10.0.0.0/25 and 10.0.0.128/25 are the
 * same set as 10.0.0.0/24), and a range contained in another disappears. The result is the canonical form, which is
 * what makes set equality a comparison of two arrays rather than a search.
 */
export function normalize(ranges) {
  const sorted = [...ranges].map(({ family, start, end }) => ({ family, start, end })).sort(byStart);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && last.family === range.family && range.start <= last.end + 1n) {
      if (range.end > last.end) last.end = range.end;
      continue;
    }
    out.push(range);
  }
  return out;
}

/** True when the two sets cover exactly the same addresses, whoever they are written differently. */
export function equals(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((range, index) => range.family === b[index].family && range.start === b[index].start && range.end === b[index].end);
}

/** Every address in either set. */
export function union(left, right) {
  return normalize([...left, ...right]);
}

/** Every address in both sets. */
export function intersect(left, right) {
  const out = [];
  for (const a of normalize(left)) {
    for (const b of normalize(right)) {
      if (a.family !== b.family) continue;
      const start = a.start > b.start ? a.start : b.start;
      const end = a.end < b.end ? a.end : b.end;
      if (start <= end) out.push({ family: a.family, start, end });
    }
  }
  return normalize(out);
}

/** Every address in the first set that is not in the second. */
export function difference(left, right) {
  const out = [];
  for (const a of normalize(left)) {
    let pieces = [{ ...a }];
    for (const b of normalize(right)) {
      if (a.family !== b.family) continue;
      const next = [];
      for (const piece of pieces) {
        if (b.end < piece.start || b.start > piece.end) {
          next.push(piece);
          continue;
        }
        if (b.start > piece.start) next.push({ family: piece.family, start: piece.start, end: b.start - 1n });
        if (b.end < piece.end) next.push({ family: piece.family, start: b.end + 1n, end: piece.end });
      }
      pieces = next;
    }
    out.push(...pieces);
  }
  return normalize(out);
}

/**
 * The addresses inside `range` that `set` does not cover - the holes. This is the function a mutant is caught by: give
 * it a blocked 10.0.0.0/8 and a policy that admits 10.0.0.77 and it names that one address, whichever sampling scheme
 * the test would otherwise have used.
 */
export function holes(range, set) {
  const target = Array.isArray(range) ? range : [range];
  return difference(target, set);
}

/** Whether the set covers the address. */
export function contains(set, address) {
  const { family, value } = parseAddress(address);
  return normalize(set).some((range) => range.family === family && value >= range.start && value <= range.end);
}

/** How many addresses the set covers, as a BigInt (a /0 is 2^32 or 2^128, which no Number holds exactly). */
export function size(set) {
  return normalize(set).reduce((total, range) => total + (range.end - range.start + 1n), 0n);
}

/** A readable form of a set, for assertion messages. */
export function formatSet(set) {
  const parts = normalize(set).map((range) => {
    if (range.start === range.end) return formatAddress(range.family, range.start);
    const bits = range.family === 4 ? IPV4_BITS : IPV6_BITS;
    // Only call it a CIDR when the range IS a CIDR, otherwise say the range it actually is.
    const span = range.end - range.start + 1n;
    if ((span & (span - 1n)) === 0n && range.start % span === 0n) {
      const hostBits = span.toString(2).length - 1;
      return `${formatAddress(range.family, range.start)}/${bits - hostBits}`;
    }
    return `${formatAddress(range.family, range.start)}-${formatAddress(range.family, range.end)}`;
  });
  return parts.length === 0 ? '(empty)' : parts.join(', ');
}
