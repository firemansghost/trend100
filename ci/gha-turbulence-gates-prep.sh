#!/usr/bin/env bash
# Used by GitHub Actions before pnpm artifacts:refresh.
# Order: restore cache (prior step) -> seed if missing -> safe live prefetch -> diagnostics.
set +e
mkdir -p public
TARGET="${TARGET:-public/turbulence.gates.json}"
BOOT="${BOOT:-ci/bootstrap/turbulence.gates.json}"
TMP="${PREFETCH_TMP:?PREFETCH_TMP must be set}"
export TARGET
export PREFETCH_TMP

echo "=== turbulence gates: cache + seed + safe prefetch ==="
echo "cache_exact_hit: ${CACHE_RESTORE_EXACT_HIT:-unknown}"
if [[ -f "$TARGET" ]]; then
  echo "gates_file_after_cache_restore: true"
else
  echo "gates_file_after_cache_restore: false"
fi

if [[ ! -f "$TARGET" ]]; then
  if [[ ! -f "$BOOT" ]]; then
    echo "seed_bootstrap_applied: false (missing $BOOT)"
  else
    cp "$BOOT" "$TARGET"
    echo "seed_bootstrap_applied: true (from $BOOT)"
  fi
else
  echo "seed_bootstrap_applied: false"
fi

if [[ -f "$TARGET" ]]; then
  echo "gates_file_before_live_prefetch: true"
else
  echo "gates_file_before_live_prefetch: false"
fi

ts=$(date +%s)
rm -f "$TMP"
curl -sf -o "$TMP" \
  "https://trend100.vercel.app/turbulence.gates.json?v=$ts" \
  --max-time 30 \
  --retry 2 \
  --retry-delay 2
CURL_EXIT=$?
export CURL_EXIT
if [[ "$CURL_EXIT" -eq 0 ]]; then
  echo "curl: success"
else
  echo "curl: failed (exit $CURL_EXIT)"
fi
if [[ -f "$TMP" ]]; then
  echo "temp_file_exists: true"
else
  echo "temp_file_exists: false"
fi

node <<'NODE'
const fs = require('fs');
const tmp = process.env.PREFETCH_TMP || '';
const target = process.env.TARGET || 'public/turbulence.gates.json';
const curlOk = process.env.CURL_EXIT === '0';
let tempParseOk = false;
let tempIsArray = false;
let tempNonEmptyArray = false;
if (fs.existsSync(tmp)) {
  try {
    const j = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    tempParseOk = true;
    tempIsArray = Array.isArray(j);
    tempNonEmptyArray = tempIsArray && j.length > 0;
    console.log('temp_json_parse: ok');
    console.log('temp_json_is_array:', tempIsArray);
    console.log('temp_json_non_empty_array:', tempNonEmptyArray);
  } catch (e) {
    console.log('temp_json_parse: fail');
    console.log('temp_json_error:', e instanceof Error ? e.message : String(e));
  }
} else {
  console.log('temp_json_parse: skipped (no temp file)');
}
if (curlOk && tempParseOk && tempNonEmptyArray) {
  fs.copyFileSync(tmp, target);
  console.log('prefetch: copied valid non-empty array JSON to public/turbulence.gates.json');
} else {
  console.log('prefetch: did not overwrite public/turbulence.gates.json (curl failed or JSON not a non-empty array)');
}
try {
  fs.unlinkSync(tmp);
} catch (_) {}
console.log('=== turbulence.gates.json (before artifacts:refresh) ===');
if (!fs.existsSync(target)) {
  console.log('final_exists: false');
  process.exit(0);
}
console.log('final_exists: true');
const st = fs.statSync(target);
console.log('final_size_bytes:', st.size);
try {
  const j = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!Array.isArray(j)) {
    console.log('final_json: not an array');
  } else {
    console.log('final_points:', j.length);
    const last = j[j.length - 1];
    const ld = last && typeof last.date === 'string' ? last.date : 'unknown';
    console.log('final_last_date:', ld);
  }
} catch (e) {
  console.log('final_json_parse: fail');
  console.log('final_json_error:', e instanceof Error ? e.message : String(e));
}
NODE

echo "=== end turbulence gates prep ==="
