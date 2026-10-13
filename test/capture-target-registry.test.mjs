import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blockedRanges, IPV6_RULE_CLASSES, isBlockedIpv4, isBlockedIpv6 } from '../src/capture/target.mjs';
import { addressRange, contains, difference, equals, formatAddress, formatSet, holes, intersect, parseCidr, union } from '../src/capture/ip-ranges.mjs';

const registry = JSON.parse(readFileSync(new URL('../docs/provenance/iana/special-purpose-addresses.json', import.meta.url), 'utf8'));
const ranges = (prefixes) => prefixes.map((prefix) => parseCidr(prefix));
const FAMILY = { ipv4: 4, ipv6: 6 };

// Exact, justified departures from IANA's classified rows. Every entry must remain a real disagreement; a broader
// exception cannot hide an interior hole because the comparison below is over discrete address sets, not samples.
const DEVIATIONS = [
  {
    family: 'ipv4', prefix: '192.0.0.9/32', direction: 'blocked-though-reachable',
    reason: 'PCP anycast sits in the refused IETF protocol /24; capture intentionally refuses this exceptional host rather than opening that block.',
  },
  {
    family: 'ipv4', prefix: '192.0.0.10/32', direction: 'blocked-though-reachable',
    reason: 'TURN anycast sits in the refused IETF protocol /24, under the same conservative policy as the PCP host.',
  },
  {
    family: 'ipv6', prefix: '2001:20::/28', direction: 'blocked-though-reachable',
    reason: 'ORCHIDv2 is marked reachable in its row but sits under the non-reachable 2001::/23 umbrella; RFC 7343 says it must not be routed.',
  },
  {
    family: 'ipv6', prefix: '2001:30::/28', direction: 'blocked-though-reachable',
    reason: 'Drone Remote ID entity tags are marked reachable in their row but sit under the non-reachable 2001::/23 umbrella.',
  },
];

// IANA declines to classify these four rows. Each choice is explicit; a new unasserted row fails the inventory below.
const UNASSERTED = [
  { family: 'ipv4', prefix: '192.88.99.0/24', global: '', blocked: true, reason: 'Deprecated 6to4 relay anycast is refused wholesale, including 192.88.99.2.' },
  { family: 'ipv6', prefix: '2001::/32', global: 'N/A', blocked: false, reason: 'TEREDO is a tunnel mechanism admitted as a named child of the blocked IETF umbrella.' },
  { family: 'ipv6', prefix: '2001:10::/28', global: '', blocked: true, reason: 'Deprecated ORCHID is refused under the blocked IETF umbrella.' },
  { family: 'ipv6', prefix: '2002::/16', global: 'N/A', blocked: true, reason: '6to4 is a tunnel mechanism conservatively refused.' },
];

// Outside the special-purpose rows: multicast is not a global unicast capture target, and deprecated IPv6 site-local
// space remains refused. Metadata is already inside IANA link-local /16, so it must not be double-counted as a delta.
const NON_REGISTRY_BLOCKS = ['224.0.0.0/4', 'fec0::/10', 'ff00::/8'];
const RULE_PREFIXES = ['::ffff:0:0/96', '64:ff9b::/96'];
const indexed = registry.registries.flatMap((reg) => {
  assert.ok(reg.registry_updated, `${reg.family} registry must carry its update date`);
  assert.ok(reg.source.startsWith('https://www.iana.org/'), `${reg.family} must cite its IANA source`);
  return reg.records.map((record) => ({ ...record, family: reg.family }));
});
const splitPrefixes = (address) => address.split(/,\s*/).map((prefix) => prefix.trim());
const rows = (classification) => indexed.filter((row) => row.global === classification).flatMap((row) => splitPrefixes(row.address));
const key = ({ family, prefix }) => `${family} ${prefix}`;
const unassertedRows = indexed.filter((row) => row.global !== 'True' && row.global !== 'False')
  .flatMap((row) => splitPrefixes(row.address).map((prefix) => ({ family: row.family, prefix, global: row.global })));

function expectedRanges() {
  // A reachable child takes precedence over its non-reachable parent, except for the four named over-blocks.
  // Dynamic payload prefixes are handled separately rather than pretending every address in each /96 has one answer.
  const classifiedBlocked = rows('False').filter((prefix) => !RULE_PREFIXES.includes(prefix));
  const classifiedReachable = rows('True').filter((prefix) => !RULE_PREFIXES.includes(prefix));
  const base = difference(ranges(classifiedBlocked), ranges(classifiedReachable));
  const classified = union(base, ranges(DEVIATIONS.filter((item) => item.direction === 'blocked-though-reachable').map((item) => item.prefix)));
  const withUnasserted = union(classified, ranges(UNASSERTED.filter((item) => item.blocked).map((item) => item.prefix)));
  return difference(union(withUnasserted, ranges(NON_REGISTRY_BLOCKS)), ranges(UNASSERTED.filter((item) => !item.blocked).map((item) => item.prefix)));
}

const actual = blockedRanges();
const expected = expectedRanges();
const forFamily = (set, family) => set.filter((range) => range.family === FAMILY[family]);

test('both registry families agree with the blocked interval set, including every address inside each prefix', () => {
  assert.equal(indexed.filter((row) => row.family === 'ipv4' && row.global !== '').length, 24);
  assert.equal(indexed.filter((row) => row.family === 'ipv6' && ['True', 'False'].includes(row.global)).length, 22);
  for (const family of ['ipv4', 'ipv6']) {
    const want = forFamily(expected, family);
    const got = forFamily(actual, family);
    assert.ok(equals(got, want), `${family}: missing blocks ${formatSet(holes(want, got))}; unexpected blocks ${formatSet(difference(got, want))}`);
  }
  assert.equal(contains(actual, '169.254.169.254'), true, 'cloud metadata belongs to IANA link-local /16');
  assert.equal(contains(actual, '2001:40::1'), true, 'unallocated interior of the blocked IETF umbrella remains refused');
});

test('the connection-time predicates match interval membership at every policy transition', () => {
  // The predicates are a second encoding used by the proxy. Test every interval edge and its immediate neighbours;
  // this guards transcription drift but is not a proof about arbitrary interior point mutations to the predicates.
  for (const range of actual) {
    const max = (1n << BigInt(range.family === 4 ? 32 : 128)) - 1n;
    const predicate = range.family === 4 ? isBlockedIpv4 : isBlockedIpv6;
    for (const value of [range.start - 1n, range.start, range.end, range.end + 1n]) {
      if (value < 0n || value > max) continue;
      const address = formatAddress(range.family, value);
      // The dynamic /96s are tested against their embedded IPv4 payloads below.
      if (range.family === 6 && RULE_PREFIXES.some((prefix) => contains([parseCidr(prefix)], address))) continue;
      assert.equal(predicate(address), contains(actual, address), `${address}: proxy predicate diverges from blockedRanges()`);
    }
  }
});

test('deviations are justified, exact ranges and still contradict a classified IANA row', () => {
  const classified = difference(ranges(rows('False').filter((prefix) => !RULE_PREFIXES.includes(prefix))), ranges(rows('True').filter((prefix) => !RULE_PREFIXES.includes(prefix))));
  const declared = ranges(DEVIATIONS.map((item) => item.prefix));
  for (const item of DEVIATIONS) {
    const record = indexed.find((row) => row.family === item.family && splitPrefixes(row.address).includes(item.prefix));
    assert.ok(record && record.global === 'True', `${item.prefix} must still be classified as reachable`);
    assert.equal(item.direction, 'blocked-though-reachable');
    assert.ok(item.reason.length > 40, `${item.prefix} needs a substantive reason`);
    assert.ok(equals(intersect(actual, [parseCidr(item.prefix)]), [parseCidr(item.prefix)]), `${item.prefix}: named deviation shrank`);
    assert.ok(equals(intersect(classified, [parseCidr(item.prefix)]), []), `${item.prefix}: no longer a disagreement`);
  }
  // This equality catches either an unlisted over-block or a larger/smaller listed over-block.
  const refusedReachable = intersect(actual, ranges(rows('True').filter((prefix) => !RULE_PREFIXES.includes(prefix))));
  assert.ok(equals(refusedReachable, declared),
    `classified reachable rows refused outside named deviations: ${formatSet(difference(refusedReachable, declared))}; missing: ${formatSet(difference(declared, refusedReachable))}`);
});

test('unasserted rows and dynamic IPv4-payload rule classes are explicitly accounted for', () => {
  assert.deepEqual(unassertedRows, UNASSERTED.map(({ family, prefix, global }) => ({ family, prefix, global })));
  for (const item of UNASSERTED) {
    assert.ok(item.reason.length > 40, `${item.prefix} needs a reason`);
    assert.ok(equals(intersect(actual, [parseCidr(item.prefix)]), item.blocked ? [parseCidr(item.prefix)] : []), `${item.prefix}: unasserted decision changed`);
  }
  assert.deepEqual(IPV6_RULE_CLASSES.map(({ prefix }) => prefix), RULE_PREFIXES);
  // The two /96s depend on the carried IPv4 address. Compare both directions and include a private interior host;
  // the interval comparison above deliberately excludes those two dynamic classes from static row equality.
  for (const prefix of RULE_PREFIXES) {
    assert.ok(equals(intersect(actual, [parseCidr(prefix)]), []), `${prefix} must not be a blanket static block`);
    for (const [v4, blocked] of [['8.8.8.8', false], ['127.0.0.1', true], ['10.0.0.77', true], ['192.88.99.2', true]]) {
      const encoded = prefix.startsWith('::ffff') ? `::ffff:${v4}` : `64:ff9b::${v4}`;
      assert.equal(isBlockedIpv6(encoded), blocked, `${encoded} should follow IPv4 payload policy`);
      assert.equal(isBlockedIpv4(v4), blocked, `${v4} must agree with its translated form`);
    }
  }
});

test('a single-address hole defeats interval equality and holes names the missing address', () => {
  for (const host of ['10.0.0.77', '192.88.99.2']) {
    const mutant = difference(actual, [addressRange(host)]);
    assert.equal(equals(mutant, expected), false, `admitting ${host} must fail equality`);
    assert.ok(equals(holes(expected, mutant), [addressRange(host)]), `holes must name exactly ${host}: ${formatSet(holes(expected, mutant))}`);
    assert.equal(formatSet(holes(expected, mutant)), host);
  }
});
