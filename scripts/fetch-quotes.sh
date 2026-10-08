#!/usr/bin/env bash
# Re-fetch the provider pages the priced sheet was built from, and check each body hashes to the
# sha256 recorded in fetched.json.
#
#   bash scripts/fetch-quotes.sh [--raw-dir docs/eval/quotes.raw] [--only runpod]
#
# Why this exists: we do not redistribute other people's pricing pages, so the bodies are gitignored.
# fetched.json is committed and records the URL, retrieval time, byte count and sha256 of each page;
# this script re-fetches them and tells you whether the page still matches what the sheet priced.
# A mismatch is not an error in our file - it means the provider changed the page, so the sheet needs
# re-fetching and re-verification before its numbers are used again.
set -u

RAW_DIR="docs/eval/quotes.raw"
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --raw-dir) RAW_DIR="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$RAW_DIR/fetched.json" ]; then
  echo "fetch-quotes: no $RAW_DIR/fetched.json - nothing to re-fetch" >&2
  exit 1
fi

UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
mismatch=0
status=0

while IFS=$'\t' read -r file url expect; do
  if [ -n "$ONLY" ] && [ "${file%%-*}" != "$ONLY" ] && [ "${file%%.*}" != "$ONLY" ]; then
    continue
  fi
  tmp="$(mktemp)"
  code="$(curl -sS -L --max-time 40 -A "$UA" -o "$tmp" -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
  got="$(sha256sum "$tmp" | cut -d' ' -f1)"
  bytes="$(wc -c <"$tmp" | tr -d ' ')"
  if [ "$code" != "200" ]; then
    echo "fetch-quotes: $file HTTP $code (page unavailable, not a hash mismatch)"
    status=1
  elif [ "$got" = "$expect" ]; then
    echo "fetch-quotes: $file unchanged ($bytes bytes, $code)"
  else
    echo "fetch-quotes: $file CHANGED - expected $expect, got $got ($bytes bytes)"
    mismatch=1
  fi
  if [ -s "$tmp" ]; then cp "$tmp" "$RAW_DIR/$file"; fi
  rm -f "$tmp"
done < <(node -e '
  const fs = require("node:fs");
  const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const [file, meta] of Object.entries(rows)) console.log([file, meta.url, meta.sha256].join("\t"));
' "$RAW_DIR/fetched.json")

if [ "$mismatch" = "1" ]; then
  echo "fetch-quotes: at least one page changed. Re-run: node scripts/extract-quotes.mjs && node scripts/verify-quotes.mjs" >&2
  exit 1
fi
if [ "$status" = "1" ]; then
  echo "fetch-quotes: some pages could not be fetched; the committed sheet is unchanged" >&2
  exit 1
fi
echo "fetch-quotes: every page still matches the committed hashes"
