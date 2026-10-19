/**
 * Preserve constrained fixture fields when building the search-negative record. A date may need to
 * be on the event's schedule, and number controls may have cross-field arithmetic invariants
 * (party = adults + children). Replacing each with an arbitrary valid-looking value does not
 * establish a stored decoy. The caller refuses any retained value containing the search query.
 */
export function decoyValueForControl(type, { original, token, suffix, index }) {
  switch (String(type).toLowerCase()) {
    case 'date': case 'datetime-local': case 'time': case 'month': case 'week':
    case 'number': case 'range':
      return String(original);
    case 'email': return `zzz-decoy-${suffix}@example.test`;
    case 'password': return `Zz9!${suffix}2026Q`;
    case 'tel': return '+44 7700 900001';
    case 'url': return `https://zzz-decoy.example.test/${suffix}`;
    default: return `${token}-${index}`;
  }
}
