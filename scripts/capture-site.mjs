#!/usr/bin/env node
/**
 * CLI for capturing a third-party site into quarantine arm A5_black_box_reproduction.
 *
 * Usage:
 *   node scripts/capture-site.mjs --url <url> --rights-ref <ref> [--pages /a,/b] [--out <dir>]
 */

import process from 'node:process';
import { captureSite } from '../src/capture/site.mjs';

function parseArgs(argv) {
  const options = {
    url: null,
    rightsRef: null,
    pages: null,
    out: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') {
      options.url = argv[++i];
    } else if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
    } else if (arg === '--rights-ref') {
      options.rightsRef = argv[++i];
    } else if (arg.startsWith('--rights-ref=')) {
      options.rightsRef = arg.slice('--rights-ref='.length);
    } else if (arg === '--pages') {
      options.pages = argv[++i];
    } else if (arg.startsWith('--pages=')) {
      options.pages = arg.slice('--pages='.length);
    } else if (arg === '--out') {
      options.out = argv[++i];
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length);
    }
  }

  return options;
}

const args = parseArgs(process.argv.slice(2));

if (!args.rightsRef || typeof args.rightsRef !== 'string' || args.rightsRef.trim() === '') {
  console.error('Error: --rights-ref is required and must name the authorising rights record');
  process.exit(1);
}

if (!args.url || typeof args.url !== 'string' || !/^https?:\/\//.test(args.url) || args.url.includes(' ')) {
  console.error(`Error: --url must be an http(s) URL without spaces, got '${args.url ?? ''}'`);
  process.exit(1);
}

try {
  const pages = args.pages ? args.pages.split(',').map((p) => p.trim()).filter(Boolean) : undefined;
  const capture = await captureSite({
    url: args.url,
    rightsRef: args.rightsRef,
    outDir: args.out,
    pages,
    env: process.env,
  });

  console.log(`Successfully captured ${capture.source.url}`);
  if (capture.capturePath) {
    console.log(`Capture written to: ${capture.capturePath}`);
  }
  process.exit(0);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
