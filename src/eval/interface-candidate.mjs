import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildGenerationPrompt } from './generator.mjs';

// Candidate-only. The paid generator does not import this module; approval of the exact block
// and its §14 deviation must precede integration into the live prompt template.
const source = readFileSync(new URL('../../docs/eval/interface-contract.tr-01.candidate.md', import.meta.url), 'utf8');
const marker = /^BEGIN TR-01 EVALUATOR INTERFACE V1\n[\s\S]*?^END TR-01 EVALUATOR INTERFACE V1\n/mg;
const matches = [...source.matchAll(marker)];
if (matches.length !== 1) throw new Error('CANDIDATE_INTERFACE: exactly one versioned block is required');
export const candidateInterfaceText = matches[0][0];
export const candidateInterfaceSha256 = createHash('sha256').update(candidateInterfaceText).digest('hex');

export function buildOfflineCandidatePrompt({ plan, design, arm = 'default', guidance = '' }) {
  const base = buildGenerationPrompt({ plan, design, arm, guidance });
  return `${base.trimEnd()}\n\nEvaluator interface contract (identical for every arm):\n${candidateInterfaceText}`;
}
