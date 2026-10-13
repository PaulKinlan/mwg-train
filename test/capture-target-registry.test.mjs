import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isBlockedIpv4, isBlockedIpv6 } from '../src/capture/target.mjs';

const registry = JSON.parse(readFileSync(new URL('../docs/provenance/iana/special-purpose-addresses.json', import.meta.url), 'utf8'));

// Every place the policy and the registry disagree, in the policy's words rather than the registry's. Both directions
// are named because both are decisions: refusing an address the registry calls reachable is a capture that cannot be
// taken, and admitting one it does not is a request to somewhere that is not a public destination.
const DEVIATIONS = [
  {
    family: 'ipv4',
    address: '192.0.0.9/32',
    direction: 'refused-though-globally-reachable',
    reason: 'Port Control Protocol anycast. Inside 192.0.0.0/24, which the policy refuses as IETF protocol assignments; refusing this address costs a capture nobody takes, and carving an exception into a blocked block is how the block stops being a block.',
  },
  {
    family: 'ipv4',
    address: '192.0.0.10/32',
    direction: 'refused-though-globally-reachable',
    reason: 'TURN anycast, same block and same reasoning as 192.0.0.9/32.',
  },
  {
    family: 'ipv6',
    address: '2001:20::/28',
    direction: 'refused-though-globally-reachable',
    reason: 'ORCHIDv2. The registry marks it globally reachable, RFC 7343 says it must not be routed, and it sits inside 2001::/23 which the registry marks not globally reachable. Refusing it is the fail-closed reading of a registry entry that contradicts its own parent.',
  },
  {
    family: 'ipv6',
    address: '2001:30::/28',
    direction: 'refused-though-globally-reachable',
    reason: 'Drone Remote ID entity tags, same shape as ORCHIDv2: inside the not-globally-reachable 2001::/23, marked reachable in its own row.',
  },
  {
    family: 'ipv6',
    address: '2001::/23',
    direction: 'admitted-though-not-globally-reachable',
    reason: 'The IETF Protocol Assignments block is refused per sub-prefix rather than wholesale, because one of its children (AS112-v6, 2001:4:112::/48) IS globally reachable and the registry overrides the parent there. Refusing each non-reachable child is what makes the reachable one still capturable.',
  },
];

// A sample address inside a prefix. Chosen so it is the destination itself for a /32 and a low host elsewhere: the
// policy is being asked about the prefix, not about a specific host.
const sampleOf = (prefix) => {
  const [base] = prefix.split('/');
  if (!prefix.includes(':')) {
    const octets = base.split('.').map(Number);
    if (octets[3] === 0) octets[3] = 1;
    return octets.join('.');
  }
  if (base === '::') return '::1';
  if (base === '64:ff9b::') return '64:ff9b::808:808'; // translation: embed a globally reachable IPv4
  return base.replace(/::$/, '::1');
};

const deviationFor = (family, address) => DEVIATIONS.find((d) => d.family === family && d.address === address);
const checked = { ipv4: 0, ipv6: 0 };
const unasserted = [];

for (const reg of registry.registries) {
  const isBlocked = reg.family === 'ipv6' ? isBlockedIpv6 : isBlockedIpv4;
  assert.ok(reg.registry_updated, `${reg.family} registry must carry the date it was taken`);

  for (const record of reg.records) {
    const sample = sampleOf(record.address);
    // 'N/A' and blank are the registry declining to make the claim, and folding them into "not globally reachable"
    // invents findings: TEREDO's row is N/A, not False. They are collected and counted instead, so the number of
    // unasserted rows cannot grow without this test noticing.
    if (record.global !== 'True' && record.global !== 'False') {
      unasserted.push(`${reg.family} ${record.address} (${record.global || 'blank'})`);
      continue;
    }
    checked[reg.family] += 1;

    const blocked = isBlocked(sample);
    const deviation = deviationFor(reg.family, record.address);
    const wantsBlocked = record.global === 'False';
    if (deviation) {
      assert.equal(
        deviation.direction,
        blocked ? 'refused-though-globally-reachable' : 'admitted-though-not-globally-reachable',
        `${record.address}: the named deviation says ${deviation.direction} but the policy ${blocked ? 'refuses' : 'admits'} it`,
      );
      continue;
    }
    assert.equal(
      blocked,
      wantsBlocked,
      wantsBlocked
        ? `${record.address} (${record.name}) is not globally reachable and the policy admitted ${sample}`
        : `${record.address} (${record.name}) is globally reachable and the policy refused ${sample}`,
    );
  }
}

test('the capture policy agrees with every IANA special-purpose record, except where it says it does not', () => {
  // 24 and 23 asserted today, out of 25 rows in each registry: the rest are rows the registry declines to classify.
  // Asserted as numbers so a refreshed registry that adds rows is a visible change here rather than a silently weaker
  // check, and so a row quietly moving out of the asserted set fails.
  assert.equal(checked.ipv4, 24);
  assert.equal(checked.ipv6, 22);
});

test('the rows the registry declines to classify are counted, not silently treated as refusals', () => {
  assert.deepEqual(unasserted, [
    'ipv4 192.88.99.0/24 (blank)', // 6to4 relay anycast, deprecated by RFC 7526 and no longer classified here. The policy refuses it, which is the fail-closed reading, and no registry row either confirms or contradicts that.
    'ipv6 2001::/32 (N/A)', // TEREDO: a tunnel mechanism, so IANA marks it not applicable rather than reachable
    'ipv6 2001:10::/28 (blank)', // deprecated ORCHID
    'ipv6 2002::/16 (N/A)', // 6to4: the mechanism, like TEREDO, is marked not applicable rather than reachable
  ]);
});

test('every named deviation is a real disagreement, with a reason, in one direction only', () => {
  // A deviation table is a denylist of disagreements, so it has to be checked in both directions: an entry whose
  // disagreement has been fixed would otherwise sit here forgiving a future one.
  const byAddress = new Map();
  for (const reg of registry.registries) for (const record of reg.records) byAddress.set(`${reg.family} ${record.address}`, record);
  for (const deviation of DEVIATIONS) {
    const record = byAddress.get(`${deviation.family} ${deviation.address}`);
    assert.ok(record, `${deviation.address} is not in the registry at all`);
    assert.ok(deviation.reason && deviation.reason.length > 40, `${deviation.address} needs a reason a reader can weigh`);
    const isBlocked = deviation.family === 'ipv6' ? isBlockedIpv6 : isBlockedIpv4;
    const blocked = isBlocked(sampleOf(deviation.address));
    const wantsBlocked = record.global === 'False';
    assert.notEqual(blocked, wantsBlocked, `${deviation.address} is named as a deviation but the policy now agrees - remove the entry`);
  }
});
