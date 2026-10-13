#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeSft } from '../src/train/serializer.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg, i, all) => i % 2 === 0 ? [arg, all[i + 1]] : null).filter(Boolean));
if (!args['--manifest'] || !args['--root'] || !args['--tokenizer-dir'] || !args['--output']) {
  console.error('usage: node scripts/serialize-sft.mjs --manifest <approved.jsonl> --root <root> --tokenizer-dir <pinned HF tokenizer files> --output <dataset.jsonl>');
  process.exitCode = 2;
} else {
  try {
    const tokenizer = {
      pinned: true,
      metadata: {
        checkpoint: 'deepseek-ai/DeepSeek-V4.1-Flash@2cba9e42aa026125f3ed06c6d98c1db82f7ca027',
        tokenizer_sha256: 'c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b',
        chat_template_sha256: 'd959d804d5101b79a49b6ff1bf3c54cd5affa9a5a78c503d925f3090040b31c3',
        transformers: '4.57.6', thinking_mode: 'thinking', reasoning_effort: 'high',
      },
      countBatch(messages) {
        return JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./count-deepseek-sft.py', import.meta.url)), resolve(args['--tokenizer-dir'])], {
          input: JSON.stringify(messages), encoding: 'utf8', timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024,
        }));
      },
    };
    const result = serializeSft({ manifestPath: args['--manifest'], root: args['--root'], outputPath: args['--output'], tokenizer });
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  } catch (error) { console.error(`SFT_REFUSED: ${error.message}`); process.exitCode = 1; }
}
