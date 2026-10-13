/**
 * Which destination a capture may reach, and at what moment it is decided (mwg-train-ypgu, from mwg-train-3pqm).
 *
 * The capture CLI drives a real browser at an operator- or CI-supplied URL. With no restriction that URL can name the
 * host's own services (127.0.0.1 and friends), the private network behind it, or a cloud metadata endpoint
 * (169.254.169.254 is the well-known one), so a URL becomes a request this host makes on someone else's behalf. The
 * fix is not "do not capture local pages" - this project's own harness captures loopback servers it started itself -
 * but that reaching a non-global address has to be asked for explicitly, at the one boundary where a URL arrives
 * from outside.
 *
 * This module is the policy; src/capture/proxy.mjs is where it is applied. Two earlier attempts applied it in the
 * wrong place and are worth knowing about, because the reason they failed is the reason this design exists:
 *   - Judging the URL before launching and after navigating (mwg-train-zpjt) described a redirect instead of
 *     preventing it: the browser follows a redirect itself, so the request to the private address had already been
 *     sent by the time the landing URL was read.
 *   - Judging every request with CDP interception and pinning the captured host with --host-resolver-rules
 *     (mwg-train-car1) worked for a direct connection and failed the moment a proxy was configured, because then the
 *     proxy resolves and connects and neither the interceptor nor the flag sees a destination at all.
 * Both shared the same flaw: they decided about a URL while something else - the browser, or a proxy - owned the
 * connection. Here the resolve-then-connect decision happens in code this project controls, so the address that was
 * checked is the address that is contacted.
 *
 * The residual, stated rather than implied: this decides about the ADDRESS a name currently resolves to. A name whose
 * answer changes between our lookup and the connection cannot matter, because we connect to the address we resolved
 * rather than resolving again - but a name that resolves to a public address which forwards elsewhere is a different
 * problem and out of scope for an address policy.
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

/**
 * Ranges a capture may not reach without allowPrivate. Kept as an explicit list of ranges rather than a "is it
 * global" test because the question is answerable exactly this way and a wrong answer here is a request to someone
 * else's infrastructure.
 */
const BLOCKED_IPV4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including the cloud metadata address 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
];

/** An IPv4 dotted quad as a 32-bit integer, or null when the value is not one. */
export function ipv4ToInt(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    // Reject anything that is not a plain decimal octet: '0x7f' and '010' are not what they look like here, and an
    // address parser that guesses is how a bypass gets in.
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

export function isBlockedIpv4(address) {
  const value = ipv4ToInt(address);
  if (value === null) return false;
  return BLOCKED_IPV4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** The eight groups of an IPv6 address, or null when the value is not one. */
function ipv6Groups(value) {
  let text = String(value);
  if (!text.includes(':')) return null;
  // A trailing dotted quad (`::ffff:127.0.0.1`) is two 16-bit groups. Reading it as one hex group gives 127 - the
  // parse stops at the dot - which is how an address that means loopback passes as something else entirely.
  const lastColon = text.lastIndexOf(':');
  const trailingQuad = ipv4ToInt(text.slice(lastColon + 1));
  if (trailingQuad !== null) {
    text = `${text.slice(0, lastColon + 1)}${(trailingQuad >>> 16).toString(16)}:${(trailingQuad & 0xffff).toString(16)}`;
  }
  const [beforeDouble, afterDouble] = text.split('::');
  if (text.split('::').length > 2) return null;
  const head = beforeDouble ? beforeDouble.split(':').filter(Boolean) : [];
  const tail = afterDouble !== undefined && afterDouble ? afterDouble.split(':').filter(Boolean) : [];
  if (text.includes('::')) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    return [...head, ...Array(fill).fill('0'), ...tail];
  }
  return head.length === 8 ? head : null;
}

export function isBlockedIpv6(address) {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const lower = groups.map((group) => group.toLowerCase());
  const first = parseInt(lower[0] || '0', 16);
  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) carry an IPv4 address inside an IPv6 one, and a policy that
  // checks only the outer form lets `::ffff:127.0.0.1` through to loopback. The embedded address is converted back to
  // a dotted quad and judged by the same IPv4 rule, rather than by a second copy of it.
  const isMapped = lower.slice(0, 5).every((group) => parseInt(group, 16) === 0) && parseInt(lower[5] ?? '0', 16) === 0xffff;
  const isNat64 = lower.slice(0, 6).join(':') === '64:ff9b:0:0:0:0';
  if (isMapped || isNat64) {
    const high = parseInt(lower[6] ?? '0', 16);
    const low = parseInt(lower[7] ?? '0', 16);
    return isBlockedIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  if (groups.every((group) => parseInt(group, 16) === 0)) return true; // ::
  if (lower.slice(0, 7).every((group) => parseInt(group, 16) === 0) && parseInt(lower[7], 16) === 1) return true; // ::1
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** Names that always mean this machine, whatever a resolver says about them. */
function isLocalName(hostname) {
  const name = String(hostname).toLowerCase().replace(/\.$/, '');
  return name === 'localhost' || name.endsWith('.localhost');
}

/**
 * The blocked addresses a URL's host resolves to. An address literal is judged directly - the URL parser has already
 * normalised the spellings that mean loopback (`2130706433`, `0x7f000001`, `127.1`) into dotted quads - and a name is
 * resolved and every answer checked, because a name that answers with one public and one private address must not be
 * admitted on the strength of the public one.
 */
export async function blockedAddresses(url, { lookup = dnsLookup } = {}) {
  const parsed = url instanceof URL ? url : new URL(String(url));
  const hostname = parsed.hostname;
  const unbracketed = hostname.replace(/^\[|\]$/g, '');
  if (ipv4ToInt(unbracketed) !== null) return isBlockedIpv4(unbracketed) ? [unbracketed] : [];
  if (ipv6Groups(unbracketed)) return isBlockedIpv6(unbracketed) ? [unbracketed] : [];
  if (isLocalName(hostname)) return [hostname];
  const answers = await lookup(hostname, { all: true });
  const addresses = (Array.isArray(answers) ? answers : [answers]).map((answer) => answer?.address).filter(Boolean);
  return addresses.filter((address) => (ipv4ToInt(address) !== null ? isBlockedIpv4(address) : isBlockedIpv6(address)));
}

/** Refuse a capture target that resolves to a non-public address, before a browser is launched at it. */
export async function assertCaptureTarget(url, { allowPrivate = false, lookup = dnsLookup } = {}) {
  if (allowPrivate) return null;
  const blocked = await blockedAddresses(url, { lookup });
  if (blocked.length > 0) {
    const hostname = new URL(String(url)).hostname;
    throw new CaptureTargetError(
      'PRIVATE_TARGET',
      `capture target ${hostname} resolves to a non-public address (${blocked.join(', ')}); ` +
        'capturing loopback, private or link-local destinations requires --allow-private',
    );
  }
  return null;
}

/**
 * The single address a connection may be made to for a host and port. This is the function the proxy calls at connect
 * time, and its whole purpose is that the address returned is the one checked: resolving again at connect would put
 * the decision back in a resolver that can answer differently.
 *
 * An unresolvable name is REFUSED rather than passed on. Under the proxy there is no other resolver in the path - the
 * browser hands us a host and connects wherever it is told - so a name we cannot resolve is one we cannot vouch for,
 * and failing closed is the only honest answer. (The earlier CDP interceptor continued an unresolvable name, because
 * there the browser might resolve names this process could not; that reasoning does not survive the proxy, and this
 * is the difference.)
 */
export async function resolveAllowedAddress({ hostname, port = null, allowPrivate = false, lookup = dnsLookup } = {}) {
  const host = String(hostname).replace(/^\[|\]$/g, '');
  if (ipv4ToInt(host) !== null || ipv6Groups(host)) {
    const blocked = ipv4ToInt(host) !== null ? isBlockedIpv4(host) : isBlockedIpv6(host);
    if (blocked && !allowPrivate) throw privateTarget(host);
    return { address: host, family: ipv4ToInt(host) !== null ? 4 : 6 };
  }
  if (isLocalName(host) && !allowPrivate) throw privateTarget(host);
  let answers;
  try {
    answers = await lookup(host, { all: true });
  } catch (error) {
    throw new CaptureTargetError('UNRESOLVABLE', `capture refused: ${host}${port ? `:${port}` : ''} could not be resolved (${error.code ?? error.message})`);
  }
  const addresses = (Array.isArray(answers) ? answers : [answers]).map((answer) => answer?.address).filter(Boolean);
  if (addresses.length === 0) throw new CaptureTargetError('UNRESOLVABLE', `capture refused: ${host} has no addresses`);
  if (!allowPrivate) {
    const blocked = addresses.filter((address) => (ipv4ToInt(address) !== null ? isBlockedIpv4(address) : isBlockedIpv6(address)));
    if (blocked.length > 0) throw privateTarget(host, blocked);
  }
  // The first answer is used, and deliberately: one address is chosen here, checked here, and connected to here.
  const [first] = addresses;
  const literal = ipv4ToInt(first) !== null ? 4 : 6;
  return { address: first, family: first.includes(':') || literal === 6 ? 6 : 4 };
}

function privateTarget(host, blocked = null) {
  const shown = blocked && blocked.length > 0 ? blocked.join(', ') : host;
  return new CaptureTargetError(
    'PRIVATE_TARGET',
    `capture refused: ${host} resolves to a non-public address (${shown}); ` +
      'capturing loopback, private or link-local destinations requires --allow-private',
  );
}
