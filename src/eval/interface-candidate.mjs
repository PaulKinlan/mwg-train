import { buildGenerationPrompt } from './generator.mjs';
import { interfaceContractText, interfaceContractSha256 } from './interface-contract.mjs';

// Historical candidate CLI remains an offline-only preview. These aliases preserve its
// pre-ratification artifact format; the live generator imports only the ratified static block.
export const candidateInterfaceText = interfaceContractText;
export const candidateInterfaceSha256 = interfaceContractSha256;

export function buildOfflineCandidatePrompt({ plan, design, arm = 'default', guidance = '' }) {
  return buildGenerationPrompt({ plan, design, arm, guidance, interfaceContract: candidateInterfaceText });
}
