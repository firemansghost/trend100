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
- **Stooq pilot:** When `EOD_STOOQ_DECKS` includes `METALS_MINING` and/or `PLUMBING`, those deck symbols use Stooq-first with Marketstack fallback; all other decks use Marketstack. PLUMBING deck (deck ID PLUMBING; UI label "War Lie Detector") has 6 tickers: BNO, USO, GLD, SPY, TIP, UUP. Run locally without Marketstack quota for pilot decks when Stooq succeeds.

### Stooq EOD pilot verification (PowerShell)

```powershell
# Typecheck
pnpm -s tsc --noEmit

# Pilot refresh for METALS_MINING + PLUMBING (deck ID PLUMBING; UI label "War Lie Detector")
$env:EOD_STOOQ_DECKS="METALS_MINING,PLUMBING"
$env:EOD_STOOQ_FORCE_FALLBACK="BNO"
# optional: $env:EOD_STOOQ_SYMBOL_OVERRIDES="BRK_B=brk.b.us"
pnpm -s update:snapshots
pnpm -s update:plumbing-war-lie-detector
pnpm -s verify:artifacts
# Expected log: "Stooq-first (fallback to Marketstack) for N symbols (decks: METALS_MINING, PLUMBING)"
# Expected log: "Stooq forced fallback: BNO" when EOD_STOOQ_FORCE_FALLBACK includes BNO
# Expected log: "Stooq override: TICKER -> symbolUsed" when override used
# Expected log: "Stooq OK: N | Stooq failed → Marketstack fallback: M (tickers)" (BNO in fallback when forced)
# Expected log: "Marketstack direct: K" for non-Stooq deck symbols

# Manual UI check: pnpm dev, open /?deck=PLUMBING, confirm War Lie Detector panel loads

# Fallback test (optional): temporarily break one Stooq symbol (e.g. override in stooq-eod.ts)
# to verify run still succeeds via Marketstack fallback. Remove sabotage before commit.

# Ensure no cache/artifacts staged
git status
# Should NOT show public/*.json or data/marketstack/eod/*.json staged
```

### CI pipeline checks
- **Artifact validation:** CI must pass `pnpm artifacts:refresh` before deploy (vercel-prebuilt-prod.yml on push; daily-artifacts-deploy.yml on schedule)
- **Stooq routing in CI:** Workflows read `EOD_STOOQ_DECKS`, `EOD_STOOQ_FORCE_FALLBACK`, `EOD_STOOQ_SYMBOL_OVERRIDES` from GitHub Actions Variables (Settings → Secrets and variables → Actions → Variables). Set e.g. `EOD_STOOQ_DECKS=METALS_MINING,PLUMBING` and `EOD_STOOQ_FORCE_FALLBACK=BNO` to enable Stooq-first for pilot decks. Expected log from update:snapshots: `Provider routing: Stooq-first (fallback to Marketstack) for N symbols (decks: METALS_MINING, PLUMBING)`
- **Turbulence gates:** Fetched from Stooq (SPX + VIX EOD); no API key required
- **Daily deploy:** `daily-artifacts-deploy.yml` runs Mon–Fri 22:15 UTC; must pass update:snapshots + verify:artifacts before deploying
- **Production smoke checks:** After deploy, key artifact endpoints should return 200:
  - https://trend100.vercel.app/snapshot.MACRO.json
  - https://trend100.vercel.app/health-history.MACRO.json
  - https://trend100.vercel.app/turbulence.gates.json
  - https://trend100.vercel.app/turbulence.shock.json
  - https://trend100.vercel.app/turbulence.greenbar.json

### PLUMBING smoke checks (PowerShell)

PLUMBING deck (deck ID PLUMBING; UI label "War Lie Detector"). After deploy, run these to verify PLUMBING endpoints:

```powershell
# plumbing.war_lie_detector.json (asOf, label, score)
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$r=Invoke-WebRequest -Uri "https://trend100.vercel.app/plumbing.war_lie_detector.json?v=$ts" -Headers @{ "Cache-Control"="no-store" } -UseBasicParsing
$j=$r.Content | ConvertFrom-Json
"plumbing.war_lie_detector: asOf=$($j.asOf) label=$($j.label) score=$($j.score)"

# snapshot.PLUMBING.json (universeSize, asOfDate, runDate)
$r=Invoke-WebRequest -Uri "https://trend100.vercel.app/snapshot.PLUMBING.json?v=$ts" -Headers @{ "Cache-Control"="no-store" } -UseBasicParsing
$j=$r.Content | ConvertFrom-Json
"snapshot.PLUMBING: universeSize=$($j.universeSize) asOfDate=$($j.asOfDate) runDate=$($j.runDate)"

# health-history.PLUMBING.json (points, first, last)
$r=Invoke-WebRequest -Uri "https://trend100.vercel.app/health-history.PLUMBING.json?v=$ts" -Headers @{ "Cache-Control"="no-store" } -UseBasicParsing
$j=$r.Content | ConvertFrom-Json
"health-history.PLUMBING: points=$($j.Count) first=$($j[0].date) last=$($j[-1].date)"
```

### Local cleanup (if you ran artifacts locally)

If you ran `pnpm artifacts:refresh` or similar locally and want to discard generated artifacts before committing:

```bash
git restore public data/marketstack/eod
git clean -fd public data/marketstack/eod
```

### verify:artifacts checks
- **Turbulence gates:** Validates `public/turbulence.gates.json`:
  - File exists, is an array, ≥250 points
  - Sorted ascending by date
  - Last point date within 7 calendar days (fails if stale to prevent stale deploys)
  - Null rules: if `spx` or `spx50dma` is null, `spxAbove50dma` must be null; if `vix` is null, `vixBelow25` must be null
  - At least one non-null `spx50dma` (ensures compute is not broken)
- **Turbulence shock:** Validates `public/turbulence.shock.json`:
  - File exists, is an array, ≥100 points (prefer ≥250)
  - Sorted ascending by date
  - Last point date within 7 calendar days (fails if stale)
  - Required keys: date, nAssets, nPairs, shockRaw, shockZ
  - nPairs = nAssets*(nAssets-1)/2 when shockRaw is non-null
  - At least one non-null shockRaw; at least one non-null shockZ (if enough history)
  - Warns on high nulls (minAssets/windows)
- **Plumbing War Lie Detector:** Validates `public/plumbing.war_lie_detector.json`:
  - File exists, valid JSON
  - `asOf` within 10 calendar days (weekends/holidays can delay updates)
  - `label` in ["THEATER","WATCH","REAL_RISK"]
  - `score` finite number in [0, 3]
  - `latest.spread`, `latest.spread_z30`, `latest.spread_roc3` are finite numbers
  - `history` is array, sorted ascending by date, length >= 60
  - `labelHistory` (if present): non-empty, sorted ascending by date
  - Run locally: `pnpm -s update:plumbing-war-lie-detector`
  - Verify: `pnpm -s verify:artifacts`
  - Common failures: missing ticker (BNO not cached — run `pnpm -s update:snapshots` first), insufficient history (< 60 bars — extend EOD cache)
- **Snapshot PLUMBING** (deck ID PLUMBING; UI label "War Lie Detector"): Validates `public/snapshot.PLUMBING.json`:
  - File exists, valid JSON
  - `universeSize` === 6
  - `asOfDate` within 10 calendar days
- **Health history PLUMBING** (deck ID PLUMBING; UI label "War Lie Detector"): Validates `public/health-history.PLUMBING.json`:
  - File exists, valid JSON
  - Points >= 200 (Market Health Over Time chart)
  - Last date within 10 calendar days
- **Turbulence green bar:** Validates `public/turbulence.greenbar.json`:
  - File exists, is an array, ≥250 rows
  - Sorted ascending by date
  - Last date within 7 calendar days (fails if stale)
  - Last row must have non-null shockRaw and shockZ
  - When gate fields (spxAbove50dma or vixBelow25) are null, isGreenBar must be null (PENDING state)
  - When both gates are non-null, isGreenBar must be boolean
  - At least one row with shockZ and gates non-null
  - Reports count of rows with pending gates (isGreenBar null)
- EOD cache spans align with retention target (`MARKETSTACK_CACHE_DAYS`, default: 2300 calendar days)
- Inception-limited tickers show `"ℹ️ (limited history: inception)"` instead of `"⚠️ (needs extension)"`
- Health-history spans remain consistent (no unexpected shrinkage)
- Shows cache depth, point counts, and date ranges per deck (includes all decks via `getAllDeckIds()`)
- **Health history validation:** Fails if weekend points (Saturday/Sunday) or partial-schema points (missing required fields) are found
- **New deck artifacts:** After adding a deck, verify `public/snapshot.<DECK_ID>.json` and `public/health-history.<DECK_ID>.json` are generated by `pnpm update:snapshots`
- **Grouped decks:** If a deck has grouped tickers (e.g., METALS_MINING), `verify:artifacts` also requires and validates:
  - `public/health-history.<DECK>.metals.json`
  - `public/health-history.<DECK>.miners.json`
- **Non-grouped multi-section decks:** If a deck has no groups but has ≥2 sections (e.g., US_FACTORS, FIXED_INCOME, MACRO), `verify:artifacts` also requires and validates:
  - `public/health-history.<DECK>.<sectionKey>.json` for each section (sectionKey from `toSectionKey(section.id)`, e.g. `quality-lowvol`, `global-ex-us`, `loans-bdc`, `em-debt`). Weekend and partial-schema rules apply to all section files.

## Troubleshooting

### "MARKETSTACK_API_KEY environment variable is not set"
- **Fix:** Create `.env.local` in repo root with `MARKETSTACK_API_KEY=your_key_here`
- **Verify:** Scripts import `'./load-env'` as first import (check `scripts/*.ts` files)

### "Missing or insufficient EOD cache for: BNO, ..." (plumbing)
- **Fix:** Run `pnpm -s update:snapshots` first to populate BNO (added to MACRO deck). The plumbing script (PLUMBING deck; deck ID PLUMBING, UI label "War Lie Detector") requires BNO, USO, GLD, SPY, TIP, UUP with ≥60 bars each.
- **Insufficient aligned bars:** Extend EOD cache; ensure all 6 symbols have overlapping history.

### "Stooq returned no data" / "Stooq VIX: all symbols failed"
- **Fix:** Set `TURBULENCE_STOOQ_VIX_SYMBOL` in `.env.local` or CI env. CI pins `vi.c` (S&P 500 VIX Cash). Fallback list: vi.c, ^vix, ^VIX, vi.f. For SPX, set `TURBULENCE_STOOQ_SPX_SYMBOL` (default ^spx; try ^gspc if needed).
- **Use case:** `update:turbulence-gates` fetches from Stooq CSV; symbol availability varies. Script logs which VIX symbol succeeded.

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

### "Pills change heatmap but not chart"
- **Symptom:** Selecting a section pill (e.g., Quality/LowVol) filters the ticker list but the chart still shows the full-deck series.
- **Cause:** Section-variant health-history files are missing or URL `section=` does not match the file naming (sectionKey).
- **Fix:**
  - Run `MARKETSTACK_OFFLINE=1 pnpm update:health-history -- --backfill-days 30` (or `pnpm update:snapshots`) so that `public/health-history.<DECK>.<sectionKey>.json` are generated for each section.
  - Run `pnpm verify:artifacts` to confirm all required section files exist and pass validation.
  - Section key must match `toSectionKey(section.id)` (e.g. `Quality/LowVol` → `quality-lowvol`). If you added a new section, ensure deck `sections` use the same `id` as ticker `section` and that writers use `toSectionKey` from `@/modules/trend100/data/sectionKey`.

### "Missing symbols in new deck"
- **Symptom:** New deck (e.g., METALS_MINING) shows fewer tickers than expected in UI or verify:artifacts reports missing EOD cache.
- **Fix:** 
  - Check `data/marketstack/eod/<SYMBOL>.json` exists for all tickers in deck universe
  - Run `pnpm update:snapshots` to backfill missing EOD cache and generate snapshots
  - Verify: `pnpm verify:artifacts` should show all decks including new one
  - For METALS_MINING: ensure GLTR, GLDM, SLV, PPLT, PALL, GDX, GDXJ, SIL, SILJ, XME, PICK have EOD cache

### "Workflow canceled: higher priority waiting request for trend100-cache-writer"
- **Symptom:** Scheduled "Update Snapshots" workflow gets canceled with message about concurrency group.
- **Fix:** This should no longer happen after consolidating scheduled writers. Only "Update Snapshots" is scheduled; other writer workflows (Update Health History, Backfill Health History, Extend EOD Cache) are manual-only. Writer workflows now queue (`cancel-in-progress: false`) instead of canceling each other.
- **Expected behavior:** If multiple writer workflows trigger (e.g., scheduled Update Snapshots + manual dispatch), they queue and run sequentially, not cancel.

### "Backfill workflow failing verify:artifacts due to partial-schema UNKNOWN points"
- **Symptom:** Backfill Health History workflow fails with "Found N partial-schema point(s)" error, typically for new decks or early history periods with insufficient data.
- **Root cause:** UNKNOWN points (insufficient history/warm-up) were previously written with null percentages or missing diffusion fields, which fails the strict schema validator.
- **Fix:** All UNKNOWN points now use `makeUnknownPoint()` helper which ensures:
  - `greenPct: 0, yellowPct: 0, redPct: 0` (not null)
  - `diffusionPct: 0, diffusionCount: 0, diffusionTotalCompared: totalTickers` (all finite numbers)
- **Verification:** After backfill, run `pnpm verify:artifacts` - should report 0 partial-schema points for all decks.
- **Note:** UNKNOWN points are still included in history files (for timeline continuity) but use 0/0/0 percentages and won't be plotted in charts.

### "Chart doesn't change when toggling Metals/Miners"
- **Expected behavior:** For grouped decks, the chart should change by loading a different health-history file.
- **Verify files exist:**
  - `public/health-history.METALS_MINING.json`
  - `public/health-history.METALS_MINING.metals.json`
  - `public/health-history.METALS_MINING.miners.json`
- **Fix:** Regenerate histories:
  - Backfill (offline): `MARKETSTACK_OFFLINE=1 pnpm -s update:health-history -- --backfill-days 2300`
  - Daily writer: `pnpm -s update:snapshots`
  - Then: `pnpm -s verify:artifacts`

### "100% green flatline (chart looks useless)"
- **Cause:** It can be legitimate for every ticker to stay GREEN for long periods, pinning GREEN% at 100.
- **Fix:** Switch chart metric using the metric selector (or URL):
  - `?metric=heat` (Heat score 0–100)
  - `?metric=upper` (% Above Upper Band)
  - `?metric=stretch` (Stretch vs 200D median %)
- **Verify data:** `pnpm -s verify:artifacts` enforces the extra fields exist and are finite numbers on every point.

## Known Failure Modes
- Off-by-one MA windows and "lookahead" bugs
- Weekly resample picking wrong day (Thu vs Fri) around holidays
- NaN propagation / missing-bar edge cases
- UI re-implementing classification logic (engine drift)
- "As-of date" confusion (timezone/date parsing)
- Cache extension budget exhausted on inception-limited symbols (now handled via metadata)
