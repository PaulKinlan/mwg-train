# IANA special-purpose address registries

`special-purpose-addresses.json` is derived from the two IANA registries that define which addresses are (and are
not) globally reachable:

- <https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xml>
- <https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xml>

It exists so that `src/capture/target.mjs` is checked against a dated document rather than against a list somebody
remembered. Every finding on that policy so far has been the same shape: `mwg-train-uin8` (multicast and IPv6
site-local), `mwg-train-4dn2` (ORCHIDv2 and five others) and `100:0:0:1::/64`, which the check found before a
reviewer did. `test/capture-target-registry.test.mjs` asserts the policy agrees with every record here, and names
every deliberate divergence, so a registry entry the policy does not cover fails a test rather than waiting for a
reviewer.

`registry_updated` is the registry's own last-modified date, and it is the fact that matters: this JSON being old is
fine, the registry having moved is not.

## Refreshing

Needs network access, so it is not part of `check:all`:

```bash
curl -s -o /tmp/iana-v4.xml https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xml
curl -s -o /tmp/iana-v6.xml https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xml
python3 - <<'PY'
import xml.etree.ElementTree as ET, json
NS = '{http://www.iana.org/assignments}'
out = {'note': 'see README.md', 'registries': []}
for fam, url, path in [
    ('ipv4', 'https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xml', '/tmp/iana-v4.xml'),
    ('ipv6', 'https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xml', '/tmp/iana-v6.xml'),
]:
    root = ET.parse(path).getroot()
    regs = [e for e in root.iter(NS + 'registry') if len(list(e.findall(NS + 'record')))]
    recs = []
    for rec in regs[-1].findall(NS + 'record'):
        g = lambda t: (rec.find(NS + t).text or '').strip() if rec.find(NS + t) is not None else ''
        recs.append({'address': g('address'), 'name': g('name'), 'global': g('global'), 'spec': g('spec')})
    out['registries'].append({'family': fam, 'source': url, 'registry_updated': root.find(NS + 'updated').text, 'records': recs})
json.dump(out, open('docs/provenance/iana/special-purpose-addresses.json', 'w'), indent=2)
PY
```

Two things this command does that a shorter one did not, and both were bugs in an earlier version:

- It parses the XML with a real XML parser. Splitting on the string `<record>` found 18 of the 25 IPv4 rows, because
  some rows carry attributes - so a check built on it reported agreement with records it had never read.
- It keeps the `global` field as the registry writes it, including `N/A` and blank. Folding those into "not globally
  reachable" invents a finding: TEREDO's own row is `N/A`, not `False`.
