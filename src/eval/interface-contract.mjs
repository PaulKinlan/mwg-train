import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Paul approved the drafted Option A server/DOM row on 2026-10-13 (i5i2.6).
// The exact V1 bytes are author-pinned for review, not separately approved verbatim by Paul.
// The document retains its candidate filename for provenance.
const source = readFileSync(new URL('../../docs/eval/interface-contract.tr-01.candidate.md', import.meta.url), 'utf8');
const marker = /^BEGIN TR-01 EVALUATOR INTERFACE V1\n[\s\S]*?^END TR-01 EVALUATOR INTERFACE V1\n/mg;
const matches = [...source.matchAll(marker)];
if (matches.length !== 1) throw new Error('INTERFACE_CONTRACT: exactly one versioned block is required');
export const interfaceContractText = matches[0][0];
export const interfaceContractSha256 = createHash('sha256').update(interfaceContractText).digest('hex');
export const RATIFIED_TR01_INTERFACE_SHA256 = '0faed7563e5e0b6df307f714b4e526fcd38ef719a4933d19d3f7ae5f967286e9';
