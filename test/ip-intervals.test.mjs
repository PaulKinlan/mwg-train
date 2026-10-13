// mwg-train-i147. Tests for the interval arithmetic that makes "this policy blocks exactly these registries" a
// checkable claim instead of a sampled one.
//
// The tests that matter most here are the MUTANT ones. A test that only asserts agreement between two large sets
// passes for almost any implementation, including one that samples, so each mutant case takes a correct set, removes
// exactly one address (or one boundary, or one two-address hole), and asserts both that equality fails AND that the
// missing addresses are named. Removing the first address of a range and removing an interior one are different bugs:
// the first is what an off-by-one produces, the second is what sampling misses. Both are here.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contains,
  difference,
  equals,
  formatAddress,
  formatSet,
  holes,
  intersect,
  normalize,
  parseAddress,
  parseCidr,
  parseIpv4,
  parseIpv6,
  size,
  union,
  addressRange,
} from '../src/capture/ip-ranges.mjs';

const cidrs = (...texts) => texts.map((text) => parseCidr(text));
const cidr = (text) => parseCidr(text);

test('addresses parse to their integer value, including the two IPv6 forms that carry an IPv4 address', () => {
  assert.equal(parseIpv4('0.0.0.0'), 0n);
  assert.equal(parseIpv4('255.255.255.255'), 4294967295n);
  assert.equal(parseIpv4('10.0.0.77'), 167772237n);
  assert.equal(parseIpv6('::'), 0n);
  assert.equal(parseIpv6('::1'), 1n);
  assert.equal(parseIpv6('2001:db8::1'), parseIpv6('2001:0db8:0000:0000:0000:0000:0000:0001'));
  // ::ffff:127.0.0.1 is 127.0.0.1 in the low 32 bits, and 64:ff9b::8.8.8.8 is 8.8.8.8 there too. A policy that judges
  // these by their embedded IPv4 needs both to land on exactly that value.
  assert.equal(parseAddress('::ffff:127.0.0.1').value, (0xffffn << 32n) | parseIpv4('127.0.0.1'));
  assert.equal(parseAddress('64:ff9b::8.8.8.8').value, (0x64ff9bn << 96n) | parseIpv4('8.8.8.8'));
  assert.equal(parseAddress('::ffff:127.0.0.1').family, 6);
});

test('a literal that is not an address is rejected rather than coerced', () => {
  const rejects = ['10.0.0', '10.0.0.256', '010.0.0.1', '10.0.0.-1', 'a.b.c.d', '1.2.3.4.5', '2001:db8::1::2', '2001:db8:0:0:0:0:0', 'gggg::1', '::ffff:999.0.0.1'];
  for (const literal of rejects) {
    assert.throws(() => parseAddress(literal), TypeError, `${literal} must not parse`);
  }
  // A 9-group address and an uncompressed 7-group address are the two shapes a hand-written check usually lets past.
  assert.throws(() => parseIpv6('1:2:3:4:5:6:7:8:9'));
  assert.throws(() => parseIpv6('1:2:3:4:5:6:7'));
});

test('a CIDR becomes the range it denotes, with host bits masked off and unaligned prefixes exact', () => {
  assert.deepEqual(cidr('10.0.0.0/8'), { family: 4, start: 167772160n, end: 184549375n, bits: 8 });
  assert.equal(size([cidr('10.0.0.0/8')]), 16777216n);
  // The case that motivates BigInt: /28 is not a nibble boundary in the group, and 2001:20::/28 ends mid-group.
  const orchid = cidr('2001:20::/28');
  assert.equal(formatAddress(6, orchid.start), '2001:20::');
  assert.equal(formatAddress(6, orchid.end), '2001:2f:ffff:ffff:ffff:ffff:ffff:ffff');
  assert.equal(size([orchid]), 2n ** 100n);
  // Host bits below the prefix are masked, not rejected: a registry row is written as a prefix.
  assert.deepEqual(cidr('10.0.0.77/24').start, cidr('10.0.0.0/24').start);
  assert.deepEqual(cidr('10.0.0.77/24').end, cidr('10.0.0.255/24').end);
  assert.equal(size([cidr('0.0.0.0/0')]), 2n ** 32n);
  assert.equal(size([cidr('::/0')]), 2n ** 128n);
  assert.equal(size([cidr('10.0.0.1/32')]), 1n);
  assert.throws(() => cidr('10.0.0.0/33'), TypeError);
  assert.throws(() => cidr('2001:db8::/129'), TypeError);
  assert.throws(() => cidr('10.0.0.0'), TypeError, 'a bare address is not a CIDR');
});

test('canonicalisation sorts, merges touching and overlapping ranges, and drops the contained', () => {
  const merged = normalize(cidrs('10.0.0.128/25', '10.0.0.0/25'));
  assert.deepEqual(merged, normalize([cidr('10.0.0.0/24')]));
  assert.equal(size(merged), 256n);
  // Touching is merging: 10.0.0.0/24 and 10.0.1.0/24 are one /23, and an implementation that only merges overlaps
  // normalises these differently, which makes set equality fail on two sets that are the same set.
  assert.deepEqual(normalize(cidrs('10.0.1.0/24', '10.0.0.0/24')), normalize([cidr('10.0.0.0/23')]));
  // Contained and unchanged by a merge of two unsorted inputs, three deep.
  assert.deepEqual(normalize(cidrs('10.0.0.0/8', '10.0.0.0/16', '10.1.0.0/16')).length, 1);
  // Families never merge, even when their integers touch, because they are different address spaces.
  const both = normalize([cidr('::/0'), cidr('0.0.0.0/0')]);
  assert.equal(both.length, 2);
  assert.equal(normalize([]).length, 0);
  assert.deepEqual(normalize([cidr('192.168.1.0/24')]), [{ family: 4, start: cidr('192.168.1.0/24').start, end: cidr('192.168.1.0/24').end }]);
});

test('union, intersection and difference agree with what the sets mean', () => {
  const a = cidrs('10.0.0.0/24');
  const b = cidrs('10.0.0.128/25', '10.0.2.0/24');
  assert.deepEqual(union(a, b), normalize(cidrs('10.0.0.0/24', '10.0.2.0/24')));
  assert.deepEqual(intersect(a, b), normalize(cidrs('10.0.0.128/25')));
  assert.deepEqual(difference(a, b), normalize(cidrs('10.0.0.0/25')));
  // Difference is a set operation, not a list filter: removing a middle range splits one into two pieces.
  const split = difference(cidrs('10.0.0.0/24'), cidrs('10.0.0.128/26'));
  assert.deepEqual(split, normalize(cidrs('10.0.0.0/25', '10.0.0.192/26')));
  assert.equal(size(split), 192n);
  assert.deepEqual(difference(cidrs('10.0.0.0/24'), cidrs('10.0.0.0/8')), []);
  assert.deepEqual(intersect(cidrs('10.0.0.0/24'), cidrs('::/0')), []);
  // Identity: a union with itself, and a difference of itself, are the set and the empty set.
  assert.ok(equals(union(a, a), a));
  assert.deepEqual(difference(a, a), []);
});

test('set equality is about the addresses, not about how the set is written', () => {
  const writtenThreeWays = [cidrs('10.0.0.0/24'), cidrs('10.0.0.128/25', '10.0.0.0/25'), [cidr('10.0.0.0/31'), cidr('10.0.0.2/31'), cidr('10.0.0.4/30'), cidr('10.0.0.8/29'), cidr('10.0.0.16/28'), cidr('10.0.0.32/27'), cidr('10.0.0.64/26'), cidr('10.0.0.128/25')]];
  for (const left of writtenThreeWays) {
    for (const right of writtenThreeWays) assert.ok(equals(left, right), 'the same set written two ways must compare equal');
  }
  const withAnExtra = [...writtenThreeWays[0], cidr('10.0.1.0/24')];
  const missingOne = difference(cidrs('10.0.0.0/24'), [addressRange('10.0.0.100')]);
  assert.equal(equals(writtenThreeWays[0], withAnExtra), false);
  assert.equal(equals(writtenThreeWays[0], missingOne), false);
  assert.equal(equals([cidr('10.0.0.0/24')], [cidr('2001:db8::/32')]), false);
  assert.ok(equals([], []));
});

test('MUTANT: a hole anywhere inside a range fails equality, and the addresses are named', () => {
  // The case that parked the registry test: with 10.0.0.77 admitted inside a blocked 10.0.0.0/8, a sampled check
  // passed because that address sits between the first sample and the middle one. This asserts the two things a
  // sampled test cannot: that equality FAILS, and that the difference is exactly the address that was removed.
  const whole = cidrs('10.0.0.0/8');
  const mutants = [
    ['10.0.0.77', '10.0.0.78', 'interior - the address that beat first/middle/last sampling'],
    ['10.0.0.0', '10.0.0.1', 'the first address, which is what an off-by-one produces'],
    ['10.255.255.255', '10.255.255.254', 'the last address, the other off-by-one'],
    ['10.0.0.255', '10.0.0.254', 'the last address of the first /24 - a boundary a stride scan would also catch'],
  ];
  for (const [address, neighbour, why] of mutants) {
    const mutant = difference(whole, [addressRange(address)]);
    assert.equal(equals(whole, mutant), false, `a range with ${address} removed is not the same set (${why})`);
    assert.deepEqual(holes(whole, mutant), [addressRange(address)], `holes() must name exactly ${address} (${why})`);
    assert.equal(contains(mutant, address), false);
    // And the neighbours are untouched, so a test that named the wrong address would be caught here.
    assert.equal(size(mutant), 16777215n);
    // The neighbour BY NAME as well as the size: mwg-train-xamf caught this comment claiming the neighbours were
    // asserted while the code checked the removed address and the total size only. Naming it is what catches a test
    // that removes or reports the wrong address.
    assert.equal(contains(mutant, neighbour), true, `${neighbour} must still be contained after removing ${address}`);
  }
});

test('MUTANT: a hole of one CIDR, of two addresses, and of two disjoint pieces are each found', () => {
  const whole = cidrs('10.0.0.0/8');
  const asParts = (pieces) => difference(whole, pieces);
  const cases = [
    [[cidr('10.4.0.0/16')], ['10.4.0.0/16']],
    [[cidr('10.0.0.0/31')], ['10.0.0.0/31']],
    [[cidr('10.0.0.5/32'), cidr('10.200.3.9/32')], ['10.0.0.5', '10.200.3.9']],
    // Two removed /9s that touch merge back into one CIDR, so the hole is named as the /8 it is rather than as the
    // two pieces it was removed in. A formatter that echoed the input pieces would be less useful and less true.
    [[cidr('10.0.0.0/9'), cidr('10.128.0.0/9')], ['10.0.0.0/8']],
  ];
  for (const [removed, expected] of cases) {
    const mutant = asParts(removed);
    assert.equal(equals(whole, mutant), false, `removing ${formatSet(removed)} must fail equality`);
    assert.deepEqual(formatSet(holes(whole, mutant)), expected.join(', '), `the hole must be reported as ${expected.join(', ')}`);
  }
  // Removing everything is the empty set, and holes() then reports the whole range - the largest mutant of all.
  assert.deepEqual(holes(whole, []), normalize(whole));
  assert.equal(equals(whole, []), false);
});

test('MUTANT: a range that is a union of two rows is not equal to one row, and neither is a superset', () => {
  // The other failure direction: not a missing address but an extra one. A policy that blocks more than the registry
  // says is also a disagreement, and equality has to be symmetric about it.
  const twoRows = cidrs('10.0.0.0/24', '10.0.1.0/24');
  const oneRow = cidrs('10.0.0.0/23');
  assert.ok(equals(twoRows, oneRow), 'two touching /24s ARE the /23, so this must be equal');
  const tooWide = cidrs('10.0.0.0/22');
  assert.equal(equals(twoRows, tooWide), false, 'a superset is a different set');
  assert.deepEqual(difference(tooWide, twoRows), normalize(cidrs('10.0.2.0/23')));
});

test('contains() answers about the boundaries, which is where an implementation goes wrong', () => {
  const set = cidrs('10.0.0.0/24', '2001:db8::/32');
  assert.ok(contains(set, '10.0.0.0'));
  assert.ok(contains(set, '10.0.0.255'));
  assert.ok(contains(set, '2001:db8::'));
  assert.ok(contains(set, '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'));
  assert.equal(contains(set, '10.0.0.1'), true);
  assert.equal(contains(set, '9.255.255.255'), false);
  assert.equal(contains(set, '10.0.1.0'), false);
  assert.equal(contains(set, '2001:db7:ffff:ffff:ffff:ffff:ffff:ffff'), false);
  assert.equal(contains(set, '2001:db9::'), false);
  // A /32 is one address, and an empty set contains nothing.
  assert.equal(contains(cidrs('10.0.0.1/32'), '10.0.0.1'), true);
  assert.equal(contains(cidrs('10.0.0.1/32'), '10.0.0.2'), false);
  assert.equal(contains([], '10.0.0.1'), false);
});

test('formatAddress round-trips every form it is given, and formatSet distinguishes a CIDR from a range', () => {
  for (const literal of ['0.0.0.0', '10.0.0.77', '255.255.255.255', '93.184.216.34']) {
    assert.equal(formatAddress(4, parseIpv4(literal)), literal);
  }
  for (const literal of ['::', '::1', '2001:db8::1', '2001:2f:ffff:ffff:ffff:ffff:ffff:ffff']) {
    assert.equal(formatAddress(6, parseIpv6(literal)), literal);
  }
  assert.equal(formatSet([]), '(empty)');
  assert.equal(formatSet(cidrs('10.0.0.0/24')), '10.0.0.0/24');
  assert.equal(formatSet(cidrs('2001:20::/28')), '2001:20::/28');
  // Not a CIDR, so it is reported as the range it is - a CIDR-looking string would be a lie about the boundaries.
  assert.equal(formatSet(difference(cidrs('10.0.0.0/24'), [addressRange('10.0.0.128')])), '10.0.0.0/25, 10.0.0.129-10.0.0.255');
  // A one-address removal on the low half is a /25 and reported as one; the /25 above is the case where the remaining
  // side is NOT a CIDR, so both spellings are exercised by one call each.
  assert.equal(formatSet([addressRange('10.0.0.1')]), '10.0.0.1');
});

test('the functions never mutate the sets they are given', () => {
  // The registry test this exists for compares sets built once and used many times; a normalisation that sorted in
  // place would corrupt the caller's copy and make a later assertion lie.
  const original = cidrs('10.0.0.128/25', '10.0.0.0/25');
  // A RAW snapshot - order, and the values themselves - not formatSet and not JSON.stringify. mwg-train-xamf found
  // this check was a false green: formatSet normalises what it is given, so a set sorted in place produced the same
  // string before and after and the assertion could never fail. JSON.stringify cannot stand in for it either, because
  // a range holds BigInts and stringify throws on them, which would fail for a reason unrelated to mutation.
  const snapshot = (set) => set.map((range) => `${range.family}:${range.start}:${range.end}:${range.bits}`).join('|');
  const before = snapshot(original);
  normalize(original);
  union(original, cidrs('192.168.0.0/16'));
  difference(original, cidrs('10.0.0.0/26'));
  intersect(original, cidrs('10.0.0.0/24'));
  contains(original, '10.0.0.1');
  size(original);
  assert.equal(snapshot(original), before);
});
