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
import { difference, normalize, parseCidr } from './ip-ranges.mjs';

/** A refused target, with a code so a caller can distinguish a policy refusal from a bad argument. */
export class CaptureTargetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CaptureTargetError';
    this.code = code;
  }
}

/**
 * Ranges a capture may not reach without allowPrivate: the special-purpose address registries, IPv4 and IPv6, not a
 * list of the ones that came to mind. Both families have now been extended by review findings after being written
 * that way - IPv4 by mwg-train-uin8 and IPv6 twice, by uin8 and mwg-train-4dn2 - and the entries below carry the
 * registry section each one comes from so a reader can check the transcription rather than trust it.
 *
 * The rule this implements is "only a global unicast destination may be reached", and in IPv4 that set is defined by
 * exclusion - IANA's special-purpose registry names what is NOT globally reachable - so the registry is what is
 * transcribed here. Writing a shorter list is how multicast (224.0.0.0/4), reserved (240.0.0.0/4, which includes
 * 255.255.255.255) and the documentation ranges were admitted until a reviewer checked
 * (mwg-train-uin8): the list was a denylist of remembered cases, and a remembered case is one a reader cannot check.
 *
 * Maintained against https://www.iana.org/assignments/iana-ipv4-special-registry/. If a prefix is added there and not
 * here, the policy admits a destination that is not globally reachable, which is the failure direction that matters.
 */
const BLOCKED_IPV4 = [
  ['0.0.0.0', 8], // "this network" (RFC 1122)
  ['10.0.0.0', 8], // private (RFC 1918)
  ['100.64.0.0', 10], // carrier-grade NAT (RFC 6598)
  ['127.0.0.0', 8], // loopback (RFC 1122)
  ['169.254.0.0', 16], // link-local, including the cloud metadata address 169.254.169.254 (RFC 3927)
  ['172.16.0.0', 12], // private (RFC 1918)
  ['192.0.0.0', 24], // IETF protocol assignments (RFC 6890)
  ['192.0.2.0', 24], // TEST-NET-1, documentation (RFC 5737)
  ['192.88.99.0', 24], // 6to4 relay anycast, deprecated (RFC 7526)
  ['192.168.0.0', 16], // private (RFC 1918)
  ['198.18.0.0', 15], // benchmarking (RFC 2544)
  ['198.51.100.0', 24], // TEST-NET-2, documentation (RFC 5737)
  ['203.0.113.0', 24], // TEST-NET-3, documentation (RFC 5737)
  ['224.0.0.0', 4], // multicast (RFC 5771)
  ['240.0.0.0', 4], // reserved, including the broadcast address 255.255.255.255 (RFC 1112)
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
  const second = parseInt(lower[1] ?? '0', 16);
  if (groups.every((group) => parseInt(group, 16) === 0)) return true; // ::
  if (lower.slice(0, 7).every((group) => parseInt(group, 16) === 0) && parseInt(lower[7] ?? '0', 16) === 1) return true; // ::1
  if (first === 0x0100 && lower.slice(1, 4).every((group) => parseInt(group, 16) === 0)) return true; // 100::/64 discard-only (RFC 6666)
  if (first === 0x0100 && parseInt(lower[1] ?? '0', 16) === 0 && parseInt(lower[2] ?? '0', 16) === 0 && parseInt(lower[3] ?? '0', 16) === 1) return true; // 100:0:0:1::/64 Dummy IPv6 Prefix (RFC 9780)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local, deprecated (RFC 3879)
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // The IETF Protocol Assignments block (2001::/23) is transcribed per sub-prefix rather than as one block, because
  // some of it IS globally reachable - Teredo and the AS112 delegations - and refusing those would be over-blocking
  // rather than policy. Each entry below is a sub-prefix the registry does not mark globally reachable.
  // The IETF Protocol Assignments block (2001::/23) is REFUSED AS A WHOLE, with the few children the registry marks
  // reachable named explicitly below.
  //
  // The earlier version did the opposite: it refused each unreachable sub-prefix and admitted the rest of the space.
  // mwg-train-mkdx showed what that costs - 2001:40::1 sits inside the umbrella in space NO row classifies, and it was
  // admitted by omission. "Refused unless named" and "admitted unless named" agree on every row that exists and differ
  // on the space that has no row at all, which is the space a mistake lives in.
  if (first === 0x2001 && second <= 0x01ff) {
    // Reachable children of the umbrella, each one named by a registry row that says so:
    if (second === 0x0000) return false; // 2001::/32 TEREDO (row value N/A: a tunnelling mechanism, routable, named reachable by the reviewer)
    const anycast = second === 0x0001 && lower.slice(2, 7).every((group) => parseInt(group, 16) === 0) && [1, 2, 3].includes(parseInt(lower[7] ?? '0', 16));
    if (anycast) return false; // 2001:1::1, 2001:1::2 and 2001:1::3/128 - Port Control Protocol, TURN and DNS-SD anycast
    if (second === 0x0003) return false; // 2001:3::/32 AMT
    if (second === 0x0004 && parseInt(lower[2] ?? '0', 16) === 0x0112) return false; // 2001:4:112::/48 AS112-v6
    // Everything else inside the umbrella, including 2001:20::/28 and 2001:30::/28 (which their own rows mark
    // reachable while RFC 7343 and RFC 9374 say otherwise) and 2001:10::/28 (blank), is refused.
    return true;
  }
  if (first === 0x2001 && second === 0x0db8) return true; // 2001:db8::/32 documentation (RFC 3849)
  if (first === 0x2002) return true; // 2002::/16 6to4 (RFC 3056)
  if (first === 0x3fff && (second & 0xf000) === 0) return true; // 3fff::/20 documentation (RFC 9637)
  if (first === 0x5f00) return true; // 5f00::/16 SRv6 SIDs (RFC 9602)
  if (first === 0x0064 && second === 0xff9b && parseInt(lower[2] ?? '0', 16) === 1) return true; // 64:ff9b:1::/48 local-use NAT64
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
/**
 * The addresses this policy blocks, as a canonical interval set (mwg-train-i147, second half).
 *
 * Why it exists: a claim like "the policy blocks exactly what the IANA registries mark not globally reachable" has to
 * be CHECKED, and predicates cannot be compared as sets - you can only sample them, and sampling cannot prove a prefix
 * property (a hole at 10.0.0.77 inside a blocked 10.0.0.0/8 survived first/middle/last sampling). With the blocked set
 * expressed as intervals the check is set equality against the registry rows, which is exact.
 *
 * Everything below is a transcription of the predicates above, and the two have to agree: the registry test asserts this
 * set against the registries and the proxy suite asserts the predicates, so a change to one that the other does not
 * follow is a failing test rather than a silent divergence.
 *
 * The IETF protocol umbrella is expressed exactly rather than approximated: it is blocked EXCEPT for the reachable
 * children the registry names, which is a set difference the interval engine already has. Same rule as the predicate's
 * allowlist, same list, written once as ranges.
 *
 * NOT here, because they are rules rather than ranges: ::ffff:0:0/96 (IPv4-mapped) and 64:ff9b::/96 (IPv4-IPv6
 * translation) are judged by the IPv4 address they carry, so which parts are blocked depends on that address and not on
 * a position in the IPv6 space. They are named in IPV6_RULE_CLASSES so a reader can see they were decided rather than
 * forgotten, and the predicate above is where their behaviour lives.
 */
export const IPV6_RULE_CLASSES = [
  { prefix: '::ffff:0:0/96', rule: 'blocked when the embedded IPv4 address is blocked, admitted when it is not (::ffff:8.8.8.8 in, ::ffff:127.0.0.1 out)' },
  { prefix: '64:ff9b::/96', rule: 'blocked when the translated IPv4 address is blocked, admitted when it is not (64:ff9b::808:808 in, 64:ff9b::0 out)' },
];

// The reachable children of the IETF protocol umbrella, from the registry rows that say so. Named once and used to carve
// the umbrella, so a change here is a change to both the blocked set and the predicate's allowlist.
const IETF_UMBRELLA_CHILDREN = ['2001::/32', '2001:1::1/128', '2001:1::2/128', '2001:1::3/128', '2001:3::/32', '2001:4:112::/48'];

const IPV6_BLOCKED_CIDRS = [
  '::/128', '::1/128', '100::/64', '100:0:0:1::/64', 'fe80::/10', 'fec0::/10', 'fc00::/7', 'ff00::/8',
  '2001:2::/48', '2001:10::/28', '2001:20::/28', '2001:30::/28', '2001:db8::/32', '2002::/16', '3fff::/20',
  '5f00::/16', '64:ff9b:1::/48',
];

/** The blocked set as intervals, canonicalised. Every address the predicates refuse is in here, and the converse. */
export function blockedRanges() {
  // BLOCKED_IPV4 holds [base, bits] pairs, so the prefix length has to be put back on before parsing.
  const v4 = BLOCKED_IPV4.map(([base, bits]) => parseCidr(`${base}/${bits}`));
  const v6 = IPV6_BLOCKED_CIDRS.map((cidr) => parseCidr(cidr));
  const umbrella = difference([parseCidr('2001::/23')], IETF_UMBRELLA_CHILDREN.map((cidr) => parseCidr(cidr)));
  return normalize([...v4, ...v6, ...umbrella]);
}

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
