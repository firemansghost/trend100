#!/usr/bin/env bash
set -u
echo "Health-history files: $(ls -1 public/health-history*.json 2>/dev/null | wc -l | tr -d ' ')"
node <<'NODE'
const fs = require('fs');
const samples = [
  'public/health-history.MACRO.json',
  'public/health-history.MACRO.fx.json',
  'public/health-history.US_FACTORS.json',
];
for (const f of samples) {
  if (!fs.existsSync(f)) {
    console.log(`${f}: MISSING`);
    continue;
  }
  try {
    const a = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(a) || a.length === 0) {
      console.log(`${f}: EMPTY`);
      continue;
    }
    console.log(`${f}: n=${a.length} last=${a[a.length - 1].date}`);
  } catch (e) {
    console.log(`${f}: PARSE_ERROR`);
  }
}
NODE
