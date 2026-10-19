import { createHash } from 'node:crypto';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const fail = (family, detail) => { throw new Error(`FAMILY_INTERFACE_INVALID ${family}: ${detail}`); };
const section = (plan, heading) => plan.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1];
const list = (text) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
// The only family with no update flow must preserve its reviewed Journey verbatim.
// Re-pin deliberately when changing that section, even for a non-functional edit.
const TR05_JOURNEY_SHA256 = 'd379562c510a436fd8601f7c7948bc2332e95d837ca4c8ac55ada0d9019bbb61';

/**
 * A family-parameterized version of the owner-approved Option A concept, not a literal copy of
 * tr-01's bicycle routes. Everything interpolated comes from this family's training-side plan.
 * Versioned/arm-identical bytes are hash-bound before any paid generation.
 */
export function familyInterfaceContract(family, plan) {
  if (!/^tr-(?:0[1-9]|[12]\d|3\d)$/.test(family)) fail(family, 'expected tr-01..tr-39');
  if (typeof plan !== 'string' || !plan.includes(`# \`${family}\` functional specification`))
    fail(family, 'plan family heading mismatch');
  const useCase = section(plan, 'Use case');
  const routes = section(plan, 'Routes and effects');
  const journey = section(plan, 'Journey');
  if (family === 'tr-05' && hash(journey ?? '') !== TR05_JOURNEY_SHA256)
    fail(family, 'Journey differs from the reviewed no-update section; review and re-pin before deriving an interface');
  const validation = section(plan, 'Validation and states');
  const acceptance = section(plan, 'Acceptance criteria');
  const titlePrefix = `# \`${family}\` functional specification — `;
  const title = plan.split('\n').find((line) => line.startsWith(titlePrefix))?.slice(titlePrefix.length);
  const fieldsMatch = useCase?.match(/The form the journey drives carries (\d+) fields: ([^\n]+)/);
  const fields = list(fieldsMatch?.[2] ?? '');
  const required = list(validation?.match(/\*\*Required fields:\*\* ([^\n]+)/)?.[1] ?? '');
  const form = journey?.match(/On `\/`, fill (form#[^:]+):/)?.[1];
  const routeRows = [...(routes ?? '').matchAll(/^\| `([^`]+)` \| ([^\n|]+) \|$/gm)]
    .map((match) => ({ path: match[1], role: match[2].trim() }));
  const search = journey?.match(/Separately, the brief declares a search flow: `([^`]+)` with query parameter `([^`]+)`="([^"]+)" lists "([^"]+)" inside `([^`]+)` and does not list "([^"]+)"/);
  const update = journey?.match(/And an update flow: the stored record's `([^`]+)` field can be changed to "([^"]+)"/);
  const criteria = acceptance?.split('\n').filter((line) => /^- /.test(line)) ?? [];
  const redirectTargets = criteria.flatMap((criterion) =>
    [...criterion.matchAll(/\bredirects to (\/[^\s,;)]+)/g)].map((match) => match[1]));
  // tr-05 calls its profile route "supporting" but POST /register redirects there.
  // Compare the FULL target, not a prefix: redirects to /volunteer/profile does not mean /.
  const readBack = routeRows.find((row) => row.role.startsWith('read-back')) ??
    routeRows.find((row) => row.path !== '/' && criteria.some((criterion) =>
      criterion.startsWith(`- GET ${row.path} `) || redirectTargets.includes(row.path)));
  // Every other family must expose an extractable update journey before re-pinning.
  if (!title || fields.length !== Number(fieldsMatch?.[1]) || !required.length ||
      required.some((field) => !fields.includes(field)) || !form || !routeRows.some((row) => row.path === '/') ||
      !readBack || !search || !criteria.length ||
      routeRows.some((row) => !row.path.startsWith('/')) ||
      (!update && family !== 'tr-05') ||
      (update && (family === 'tr-05' || !fields.includes(update[1]))))
    fail(family, 'plan route/field/journey/criteria extraction incomplete');
  const mutableReadBackParam = update && readBack.path.split('/').includes(`:${update[1]}`);
  const text = `BEGIN ${family.toUpperCase()} EVALUATOR INTERFACE V1\n` +
`Build a runnable Node website with server.mjs; accept --port and --db and serve GET /__health with HTTP 200. Keep the plan's records on the server across browser reloads for the lifetime of the process, never browser-only storage as source of truth. Do not run generated code during generation. This contract is identical for default/C1/C2/C3/T; do not add routes or fields from unrelated families.\n\n` +
`Family and domain: ${title}\n` +
`Use the domain routes declared by THIS family's plan (the shared evaluator API, search and intake routes below are additional; do not replace domain routes or change their methods):\n${routeRows.map((row) => `- ${row.path}: ${row.role}`).join('\n')}\n` +
`The form on / is ${form}; preserve labelled named fields ${fields.map((field) => `\`${field}\``).join(', ')}. Required fields are ${required.map((field) => `\`${field}\``).join(', ')}. Refuse invalid submission with field-associated accessible inline errors and no new server record. Follow this family's plan for select options, carried /intake step, write-route method and redirect; reload its declared read-back route to retrieve the same stored record.\n` +
`Search: ${search[1]}?${search[2]}=${encodeURIComponent(search[3])} must show ${JSON.stringify(search[4])} inside ${search[5]}, exclude a separately stored ${JSON.stringify(search[6])} decoy, and retain both records in an unfiltered server listing.\n` +
(update ? `Update: edit the SAME server record's \`${update[1]}\` field to ${JSON.stringify(update[2])}; do not append a second record. On read-back reload the new value must appear in visible body text.\n` : 'No update flow is declared for this family: do not invent a domain-specific update requirement.\n') +
(mutableReadBackParam ? `The \`:${update[1]}\` segment of ${readBack.path} is a stable create-time reference, NOT the mutable \`${update[1]}\` field value. Preserve the original landing URL and reference when changing that field; do not re-key the route or the /api/record/{ref} lookup.\n` : '') +
`Expose GET /api/records as the unfiltered list of records (JSON array or {"records":[...]}), GET /api/record/{ref} for one stable reference, and GET /api/me as {"ref":"<most recent reference>"} when one exists. Return the plan's named ${fields.includes('password') ? 'non-credential ' : ''}fields, including ${update ? `the updated \`${update[1]}\` value` : 'the persisted record values'}, from these SAME server records, not localStorage or fabricated fixture responses.\n` +
(fields.includes('password') ? 'Keep the password server-side as a salted hash for login verification; never return plaintext or hash through the read-back page, search, or any GET /api/ route.\n' : '') +
`Honor this family's acceptance criteria (do not replace its domain with another family's routes):\n${criteria.join('\n')}\n` +
`END ${family.toUpperCase()} EVALUATOR INTERFACE V1\n`;
  return { text, sha256: hash(text) };
}
