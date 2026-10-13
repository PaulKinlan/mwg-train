#!/usr/bin/env node
/**
 * CLI for capturing a third-party site into quarantine arm A5_black_box_reproduction.
 *
 * Usage:
 *   node scripts/capture-site.mjs --url <url> --rights-ref <ref> [--pages /a,/b] [--out <dir>] [--allow-private]
 *
 * Without --allow-private the capture refuses a destination that resolves to loopback, a private range, a link-local
 * or metadata address, or a name this host cannot resolve: the URL is resolved here and the browser is sent through a
 * local proxy that connects to the address that was checked, so a redirect or a subresource cannot reach one either.
 */

import process from 'node:process';
import { captureSite } from '../src/capture/site.mjs';

function parseArgs(argv) {
  const options = {
    url: null,
    rightsRef: null,
    pages: null,
    out: null,
    allowPrivate: false,
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
    } else if (arg === '--allow-private') {
      // Explicit, because it turns the destination policy off: used for capturing servers this project started
      // itself, never for a URL that arrived from outside (mwg-train-ypgu).
      options.allowPrivate = true;
    }
  }

  return options;
}

const args = parseArgs(process.argv.slice(2));

if (!args.rightsRef || typeof args.rightsRef !== 'string' || args.rightsRef.trim() === '') {
  console.error('Error: --rights-ref is required as a provenance ledger reference');
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
    allowPrivate: args.allowPrivate,
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
