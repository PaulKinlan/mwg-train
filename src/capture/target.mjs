/**
 * Which destination a capture may be pointed at (mwg-train-3pqm).
 *
 * The capture CLI takes an operator- or CI-supplied URL and drives a real browser at it. With no restriction that
 * URL can name the host's own services (127.0.0.1 and friends), the private network behind it, or a cloud metadata
 * endpoint (169.254.169.254 is the well-known one), so a URL becomes a request the host makes on someone else's
 * behalf. The fix is not "do not capture local pages" - this project's own harness captures loopback servers it
 * started itself - but that reaching a non-global address has to be asked for explicitly, at the one boundary where
 * a URL arrives from outside.
 *
 * Two limits are stated rather than hidden:
 *   - A name is resolved here and every address it answers with is checked, but the browser resolves again when it
 *     navigates. A name whose answer changes between those two lookups (DNS rebinding) is not caught by this check;
 *     the check after the navigation in src/capture/site.mjs is what catches the common case of a redirect.
 *   - Only the document is validated. Subresources a public page pulls in are the browser's requests, not this
 *     function's, and are not intercepted.
 */
import { lookup as dnsLookup } from 'node:dns/promises';

/** A refused target, with a code so a caller can distinguish a policy refusal from a bad argument. */
export class CaptureTargetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CaptureTargetError';
    this.code = code;
  }
}

// IPv4 ranges that are not a public destination. 169.254.0.0/16 is the link-local block that contains the cloud
// metadata addresses; 100.64.0.0/10 is carrier-grade NAT, which is somebody else's private space; 0.0.0.0/8 is "this
// host"; 198.18.0.0/15 is the benchmarking block.
const BLOCKED_IPV4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
];

/** The dotted quad as a 32-bit integer, or null when the string is not one. */
export function ipv4ToInt(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

/** Is this dotted quad inside a range a capture must not reach by default? */
export function isBlockedIpv4(address) {
  const value = ipv4ToInt(address);
  if (value === null) return false;
  return BLOCKED_IPV4.some(([network, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(network) & mask);
  });
}

/** The eight 16-bit groups of an IPv6 address, or null when the string is not one. */
function ipv6Groups(value) {
  let text = String(value).replace(/^\[|\]$/g, '');
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  // An embedded dotted quad (::ffff:127.0.0.1) is two groups, not four, so convert it first.
  const v4 = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const asInt = ipv4ToInt(v4[1]);
    if (asInt === null) return null;
    const high = (asInt >>> 16).toString(16);
    const low = (asInt & 0xffff).toString(16);
    text = `${text.slice(0, v4.index)}${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (chunk) => (chunk === '' ? [] : chunk.split(':').map((group) => parseInt(group || '0', 16)));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...tail].some((group) => Number.isNaN(group) || group > 0xffff)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...Array(fill).fill(0), ...tail];
}

/** Is this IPv6 address one a capture must not reach by default? */
export function isBlockedIpv6(address) {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const [first] = groups;
  const isZero = groups.every((group) => group === 0);
  if (isZero) return true; // :: , the unspecified address
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1 loopback
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 destination: judge that instead.
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
  if (mapped || nat64) {
    const dotted = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
    return isBlockedIpv4(dotted);
  }
  return false;
}

/** Is this hostname a local name, whatever it resolves to? */
function isLocalName(hostname) {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  return name === 'localhost' || name.endsWith('.localhost');
}

/**
 * The addresses a destination must not reach unless the caller says so, or an empty array when it may be reached.
 * `lookup` is injectable so the check is testable offline and so a caller can supply its own resolver.
 */
export async function blockedAddresses(url, { lookup = dnsLookup } = {}) {
  const hostname = new URL(url).hostname;
  if (hostname === '') return ['an empty host'];
  const unbracketed = hostname.replace(/^\[|\]$/g, '');
  // URL normalises the alternative IPv4 spellings (0x7f000001, 2130706433, 127.1) to a dotted quad, so the literal
  // checks below cover encodings nobody should have to enumerate by hand.
  if (ipv4ToInt(unbracketed) !== null) return isBlockedIpv4(unbracketed) ? [unbracketed] : [];
  if (ipv6Groups(unbracketed)) return isBlockedIpv6(unbracketed) ? [unbracketed] : [];
  if (isLocalName(hostname)) return [hostname];
  const answers = await lookup(hostname, { all: true });
  return (Array.isArray(answers) ? answers : [answers])
    .map((answer) => answer?.address)
    .filter((address) => (ipv4ToInt(address) !== null ? isBlockedIpv4(address) : isBlockedIpv6(address)));
}

/**
 * Refuse a destination a capture must not reach, before a browser is launched or an asset is written. A non-global
 * address is allowed only when the caller passes allowPrivate, which is how the project captures the loopback
 * servers its own harness started and how an operator opts in with --allow-private.
 */
export async function assertCaptureTarget(url, { allowPrivate = false, lookup = dnsLookup } = {}) {
  if (allowPrivate) return new URL(url).href;
  let blocked;
  try {
    blocked = await blockedAddresses(url, { lookup });
  } catch (error) {
    // A name that cannot be resolved is not a capture target: fail closed, with the resolver's reason attached.
    throw new CaptureTargetError('UNRESOLVABLE', `capture target ${new URL(url).host} cannot be resolved: ${error.message}`);
  }
  if (blocked.length > 0) {
    throw new CaptureTargetError(
      'PRIVATE_TARGET',
      `capture target ${new URL(url).host} resolves to a non-public address (${blocked.join(', ')}); ` +
        'capturing loopback, private or link-local destinations requires --allow-private',
    );
  }
  return new URL(url).href;
}
