import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Paul's 2026-10-18 Option A decision ratified the exact tr-01 V1 block. The document
// retains its candidate filename as the immutable source reviewed before ratification.
const source = readFileSync(new URL('../../docs/eval/interface-contract.tr-01.candidate.md', import.meta.url), 'utf8');
const marker = /^BEGIN TR-01 EVALUATOR INTERFACE V1\n[\s\S]*?^END TR-01 EVALUATOR INTERFACE V1\n/mg;
const matches = [...source.matchAll(marker)];
if (matches.length !== 1) throw new Error('INTERFACE_CONTRACT: exactly one versioned block is required');
export const interfaceContractText = matches[0][0];
export const interfaceContractSha256 = createHash('sha256').update(interfaceContractText).digest('hex');
export const RATIFIED_TR01_INTERFACE_SHA256 = '0faed7563e5e0b6df307f714b4e526fcd38ef719a4933d19d3f7ae5f967286e9';
