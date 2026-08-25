#!/usr/bin/env bash
# Restore overlay is done by actions/cache. This script logs continuity and,
# on a true cache miss, safely prefetches currently deployed health-history JSON.
set -u
mkdir -p public
echo "=== Health-history LKG ==="
echo "Health-history cache restored exact hit: ${CACHE_RESTORE_EXACT_HIT:-unknown}"
echo "Health-history cache matched key: ${CACHE_MATCHED_KEY:-}"
n=$(ls -1 public/health-history*.json 2>/dev/null | wc -l | tr -d ' ')
echo "Health-history files after restore: ${n}"

if [[ -n "${CACHE_MATCHED_KEY:-}" ]]; then
  echo "Health-history production prefetch: skipped (Actions cache restored a key)"
  exit 0
fi

echo "Health-history LKG cache miss: prefetching deployed files (HTTPS GET, per-file, leave local on failure)"
ts=$(date +%s)
shopt -s nullglob
for f in public/health-history*.json; do
  base=$(basename "$f")
  tmp="${RUNNER_TEMP:-/tmp}/${base}.prefetch"
  rm -f "$tmp"
  if curl -sf -o "$tmp" \
    "https://trend100.vercel.app/${base}?v=${ts}" \
    --max-time 30 \
    --retry 2 \
    --retry-delay 2; then
    if node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const dest = process.argv[2];
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        if (!Array.isArray(j) || j.length === 0) process.exit(2);
        fs.copyFileSync(p, dest);
        process.exit(0);
      } catch {
        process.exit(3);
      }
    ' "$tmp" "$f"; then
      echo "prefetch ok: ${base}"
    else
      echo "prefetch rejected (invalid JSON array): ${base} (local file unchanged)"
    fi
  else
    echo "prefetch failed: ${base} (local file unchanged)"
  fi
done
exit 0
