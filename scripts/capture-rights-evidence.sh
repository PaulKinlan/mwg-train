#!/usr/bin/env bash
# Capture primary-source rights evidence (licences, terms, model cards) for
# docs/provenance. Deterministic and re-runnable: every capture records the URL,
# final URL, HTTP status, content type, byte count, sha256 and UTC fetch time in
# docs/provenance/evidence/manifest.jsonl.
#
# Raw bytes and their text extractions are written under
# docs/provenance/evidence/raw/ and docs/provenance/evidence/text/, both of
# which are gitignored: the manifest hashes are what is committed, so a reviewer
# can re-fetch the same URL and confirm the review was done against the same
# bytes without this repository redistributing other people's terms pages.
#
# Usage: scripts/capture-rights-evidence.sh [slug ...]
#   with no arguments it captures every source in SOURCES below.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EV="$ROOT/docs/provenance/evidence"
RAW="$EV/raw"
TEXT="$EV/text"
mkdir -p "$RAW" "$TEXT"

UA="mwg-train-provenance/1.0 (+https://github.com/PaulKinlan/mwg-train)"

# slug|url  -- keep sorted by slug; one source per line.
SOURCES='
mwg-npm-metadata|https://registry.npmjs.org/modern-web-guidance
mwg-public-repo-license|https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/LICENSE
mwg-src-contributing|https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance-src/main/CONTRIBUTING.md
mwg-src-license|https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance-src/main/LICENSE
mwg-src-readme|https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance-src/main/README.md
web-features-license|https://raw.githubusercontent.com/web-platform-dx/web-features/main/LICENSE.txt
mdn-attrib-license|https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license
cc-by-4.0-legalcode|https://creativecommons.org/licenses/by/4.0/legalcode.txt
bcd-license|https://raw.githubusercontent.com/mdn/browser-compat-data/main/LICENSE
us-copyright-faq|https://www.copyright.gov/help/faq/faq-protect.html
rfc9309-robots|https://www.rfc-editor.org/rfc/rfc9309.txt
gemma-terms|https://ai.google.dev/gemma/terms
deepseek-terms-of-use|https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html
deepseek-platform-tos|https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html
anthropic-consumer-terms|https://www.anthropic.com/legal/consumer-terms
anthropic-commercial-terms|https://www.anthropic.com/legal/commercial-terms
anthropic-usage-policy|https://www.anthropic.com/legal/aup
openai-terms-of-use|https://openai.com/policies/terms-of-use/
openai-business-terms|https://openai.com/policies/business-terms/
openai-terms-of-use-rjina|https://r.jina.ai/https://openai.com/policies/terms-of-use/
openai-business-terms-rjina|https://r.jina.ai/https://openai.com/policies/business-terms/
openai-service-terms-rjina|https://r.jina.ai/https://openai.com/policies/service-terms/
openai-data-use-rjina|https://r.jina.ai/https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/
google-terms|https://policies.google.com/terms
google-genai-terms|https://policies.google.com/terms/generative-ai
gemini-api-terms|https://ai.google.dev/gemini-api/terms
google-cloud-service-terms|https://cloud.google.com/terms/service-terms
zai-terms|https://docs.z.ai/legal/terms-of-service
zai-public-terms|https://z.ai/terms
zai-terms-of-use|https://docs.z.ai/legal-agreement/terms-of-use.md
zai-privacy-policy|https://docs.z.ai/legal-agreement/privacy-policy.md
hf-qwen25-coder-7b|https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/README.md
hf-license-qwen25-coder-7b|https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/LICENSE
hf-api-qwen25-coder-7b|https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-7B-Instruct
hf-api-qwen25-coder-32b|https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-32B-Instruct
hf-api-qwen3-8b|https://huggingface.co/api/models/Qwen/Qwen3-8B
hf-api-gemma-3-12b-it|https://huggingface.co/api/models/google/gemma-3-12b-it
hf-api-deepseek-v4-flash|https://huggingface.co/api/models/deepseek-ai/DeepSeek-V4-Flash
hf-api-glm-5.3-flash|https://huggingface.co/api/models/zai-org/GLM-5.3-Flash
gemma-prohibited-use|https://ai.google.dev/gemma/prohibited_use_policy
hf-qwen3-8b|https://huggingface.co/Qwen/Qwen3-8B/raw/main/README.md
hf-gemma-3-12b-it|https://huggingface.co/google/gemma-3-12b-it/raw/main/README.md
hf-glm-4.5|https://huggingface.co/zai-org/GLM-4.5/raw/main/README.md
hf-deepseek-v3|https://huggingface.co/deepseek-ai/DeepSeek-V3/raw/main/README.md
'

only=("$@")
[ "${#only[@]}" -eq 0 ] && : > "$EV/manifest.jsonl"
selected() {
  local slug="$1"
  [ "${#only[@]}" -eq 0 ] && return 0
  local s
  for s in "${only[@]}"; do [ "$s" = "$slug" ] && return 0; done
  return 1
}

pass=0
fail=0
while IFS='|' read -r slug url; do
  [ -z "${slug:-}" ] && continue
  selected "$slug" || continue
  raw="$RAW/$slug"
  hdr="$RAW/$slug.headers"
  body="$(mktemp)"
  fetched_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # -L follow redirects, -sS silent but show errors, --max-time bounded so one
  # slow host cannot stall the whole capture run, --compressed for gzip pages.
  meta="$(curl -sSL --compressed --max-time 45 --retry 2 --retry-delay 2 \
      -A "$UA" -D "$hdr" -o "$body" -w '%{http_code}|%{url_effective}' "$url" \
      2>/dev/null || echo '000|')"
  code="${meta%%|*}"
  final_url="${meta#*|}"
  [ -n "$final_url" ] || final_url="$url"
  ctype="$(grep -i '^content-type:' "$hdr" 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r' || true)"
  bytes="$(wc -c < "$body" | tr -d ' ')"
  sha="$(sha256sum "$body" | cut -d' ' -f1)"
  last_modified="$(grep -i '^last-modified:' "$hdr" 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r' || true)"

  if [ "$code" = "200" ] && [ "$bytes" -gt 0 ]; then
    mv "$body" "$raw"
    pass=$((pass + 1))
    case "$ctype" in
      *json*) cp "$raw" "$TEXT/$slug.txt" ;;
      *) python3 "$ROOT/scripts/html-to-text.py" "$raw" > "$TEXT/$slug.txt" 2>/dev/null \
           || cp "$raw" "$TEXT/$slug.txt" ;;
    esac
    verdict="ok"
  else
    # Keep the failed body for diagnosis (often a challenge page), never as evidence.
    mv "$body" "$raw.failed"
    fail=$((fail + 1))
    verdict="failed"
  fi

  jq -cn \
    --arg slug "$slug" --arg url "$url" --arg final_url "$final_url" \
    --arg code "$code" --arg ctype "$ctype" --argjson bytes "$bytes" \
    --arg sha256 "$sha" --arg fetched_at "$fetched_at" \
    --arg last_modified "$last_modified" --arg verdict "$verdict" \
    --arg raw_path "docs/provenance/evidence/raw/$slug" \
    --arg text_path "docs/provenance/evidence/text/$slug.txt" \
    '{slug:$slug,url:$url,final_url:$final_url,http_status:($code|tonumber? // 0),
      content_type:$ctype,bytes:$bytes,sha256:$sha256,fetched_at:$fetched_at,
      last_modified:$last_modified,verdict:$verdict,raw_path:$raw_path,text_path:$text_path}' \
    > "$EV/manifest.row"
  # Exactly one row per slug, sorted: re-running a single slug replaces its row.
  { [ -f "$EV/manifest.jsonl" ] && jq -c --arg slug "$slug" 'select(.slug != $slug)' "$EV/manifest.jsonl"; cat "$EV/manifest.row"; } \
    | jq -cs 'sort_by(.slug)' | jq -c '.[]' > "$EV/manifest.jsonl.new" \
    && mv "$EV/manifest.jsonl.new" "$EV/manifest.jsonl"
  rm -f "$EV/manifest.row"
  printf '%-30s %-4s %8s  %s\n' "$slug" "$code" "$bytes" "$verdict"
done <<< "$SOURCES"

echo "--- captured=$pass failed=$fail manifest=$EV/manifest.jsonl"
[ "$fail" -eq 0 ]
