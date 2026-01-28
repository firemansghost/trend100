# CHECKS — Trend100

## Verification Steps (V1 MVP)

### Engine correctness
- Unit tests for SMA and EMA on deterministic sequences
- Weekly resample:
  - Derived from daily bars
  - Weekly close uses Friday close (handle market holidays consistently)
- Classification:
  - Green/Yellow/Red matches rules for known scenarios
  - Insufficient history returns **UNKNOWN** (or equivalent) consistently

### UI behavior
- Heatmap renders **exactly 100 tiles** from snapshot
- Search filters by ticker instantly
- Tag filters apply correctly (document AND/OR behavior when implemented)
- Modal:
  - Opens via click
  - Closes via Esc + click-outside
  - Mobile-friendly layout

### Data layer architecture
- UI consumes `getLatestSnapshot()` only (no hidden direct API calls)
- Swapping mock → real provider touches **data layer only**

### Shareability
- Metadata/OG tags show correct title/description on social previews

## Environment & Local Development

### .env.local loading
- Scripts automatically load `.env.local` (then `.env` as fallback) via side-effect import
- All scripts import `'./load-env'` as the first import (ESM import order requirement)
- CI env vars take precedence (override: false) — local .env.local doesn't override CI secrets

### update:snapshots behavior
- Extends EOD cache up to configured budget (`MARKETSTACK_EXTEND_MAX_SYMBOLS`, default: 10)
- Skips wasting budget on inception-limited symbols (uses metadata in `data/marketstack/eod/.meta/`)
- Fetches "latest" for symbols with recent cache (batched updates)
- Logs clear messages for inception-limited symbols: `"ℹ️ <SYMBOL> cannot extend earlier than <date> (provider limit/inception)"`

### verify:artifacts checks
- EOD cache spans align with retention target (`MARKETSTACK_CACHE_DAYS`, default: 2300 calendar days)
- Inception-limited tickers show `"ℹ️ (limited history: inception)"` instead of `"⚠️ (needs extension)"`
- Health-history spans remain consistent (no unexpected shrinkage)
- Shows cache depth, point counts, and date ranges per deck
- **Health history validation:** Fails if weekend points (Saturday/Sunday) or partial-schema points (missing required fields) are found

## Troubleshooting

### "MARKETSTACK_API_KEY environment variable is not set"
- **Fix:** Create `.env.local` in repo root with `MARKETSTACK_API_KEY=your_key_here`
- **Verify:** Scripts import `'./load-env'` as first import (check `scripts/*.ts` files)

### "Needs extension but budget exhausted"
- **Fix:** Increase `MARKETSTACK_EXTEND_MAX_SYMBOLS` (default: 10) or run multiple times
- **Note:** Inception-limited symbols are automatically excluded from extension attempts

### "Force retry inception-limited symbol"
- **Fix:** Set `MARKETSTACK_FORCE_EXTEND=1` to override inception-limited metadata check
- **Use case:** When you suspect metadata is stale or want to retry after provider adds history

### "Mystery weekend dip in chart"
- **Fix:** Health history sanitization automatically removes weekend points. If you see this:
  - Run `pnpm verify:artifacts` to check for weekend/partial points
  - If found, regenerate health history: `pnpm update:snapshots` (sanitization runs on load)
  - Verify: `grep -E '"date": "202[0-9]-[0-9]{2}-(0[6]|1[0-9]|2[0-9]|3[01])"' public/health-history.*.json` should return nothing (no Sat/Sun dates)

## Known Failure Modes
- Off-by-one MA windows and "lookahead" bugs
- Weekly resample picking wrong day (Thu vs Fri) around holidays
- NaN propagation / missing-bar edge cases
- UI re-implementing classification logic (engine drift)
- "As-of date" confusion (timezone/date parsing)
- Cache extension budget exhausted on inception-limited symbols (now handled via metadata)
