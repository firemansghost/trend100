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
- Skips wasting budget on inception-limited symbols (uses `data/marketstack/eod/.meta/` and `data/marketstack/meta/earliest.json`)
- **Earliest floor metadata:** `data/marketstack/meta/earliest.json` stores provider earliest-available date per symbol (e.g. `{"SNOW":"2020-09-16","FBTC":"2024-01-11"}`). When Marketstack returns 0 bars for an extension request, we record the floor and skip future attempts. Before extending, we check this file; if we would request dates before the known floor, we skip and log `ℹ️ SKIP extend <SYMBOL>: known floor <date>`. To reset (e.g. provider adds history): delete `data/marketstack/meta/earliest.json`.
- Fetches "latest" for symbols with recent cache (batched updates)
- Logs: `ℹ️ SKIP extend X: known floor Y` (skipped), `ℹ️ X cannot extend earlier than Y (provider limit/inception)` (API returned 0 bars), `📊 Extend phase: N skipped (known floor), M floor(s) updated`
- **Stooq pilot:** When `EOD_STOOQ_DECKS` includes pilot decks (METALS_MINING, PLUMBING, US_SECTORS, US_FACTORS, GLOBAL_EQUITIES), those symbols use Stooq-first with Marketstack fallback. `EOD_STOOQ_FORCE_FALLBACK` (e.g. BNO,FBTC,FETH,SRUUF) skips Stooq for tickers not reliably on Stooq. All other decks use Marketstack.
- **Stooq daily freshness:** Stooq always refreshes last N days (default 20 via `EOD_STOOQ_LOOKBACK_DAYS`) for cached symbols—no "stale ≤3 days" skip. Ensures pilot decks advance daily. Logs: `🔄 [Stooq] Refreshing X (last: YYYY-MM-DD, lookback: 20d)...`, `📊 Stooq freshness: minLast=... maxLast=... symbols=N`, and `⚠️ Stooq lag: N trading days between min/max. Lagging: ...` when symbols lag.
- **Strict asOfDate (optional):** When `SNAPSHOT_STRICT_ASOF_DECKS` includes deck IDs (e.g. `US_SECTORS,US_FACTORS,GLOBAL_EQUITIES,METALS_MINING,PLUMBING`), snapshot asOfDate = min(lastDate) across that deck's tickers. Prevents decks from appearing fresher than reality when one ticker is stale. Log: `🧭 Snapshot asOf: <DECK> mode=STRICT_MIN min=... max=... lagTd=0 aligned` (when aligned) or `lagTd=Nd lagging=...` (when lag). Snapshot JSON may include optional `asOfDateMode` and `dataFreshness`. `dataFreshness.laggingTickers` is empty when aligned; when lag: STRICT_MIN = tickers at minLastDate (holding deck back), DEFAULT = tickers behind maxLastDate. `dataFreshness.lagTradingDays` = trading-day gap (0 when aligned).

### Stooq EOD pilot verification (PowerShell)

```powershell
# Typecheck
pnpm -s tsc --noEmit

# Pilot refresh (METALS_MINING, PLUMBING, US_SECTORS, US_FACTORS, GLOBAL_EQUITIES)
$env:EOD_STOOQ_DECKS="METALS_MINING,PLUMBING,US_SECTORS,US_FACTORS,GLOBAL_EQUITIES"
$env:EOD_STOOQ_FORCE_FALLBACK="BNO,FBTC,FETH,SRUUF"
# optional: $env:EOD_STOOQ_SYMBOL_OVERRIDES="BRK_B=brk.b.us"
pnpm -s update:snapshots
pnpm -s update:plumbing-war-lie-detector
pnpm -s verify:artifacts
# Expected log: "Provider routing: Stooq-first for N symbols (decks: ...), Marketstack direct: K"
# Expected log: "Stooq OK: X | Forced fallback: Y | Stooq failed → Marketstack fallback: Z (tickers...)"
# Expected log: "Stooq freshness: minLast=... maxLast=... symbols=N"
# update:plumbing-war-lie-detector logs: "PLUMBING inputs last: BNO=... USO=... GLD=... SPY=... TIP=... UUP=..."
# Forced fallback tickers (BNO, FBTC, FETH, SRUUF) skip Stooq; list truncated to first 10 + "+N more" if >10

# Manual UI check: pnpm dev, open /?deck=PLUMBING, confirm War Lie Detector panel loads

# Fallback test (optional): temporarily break one Stooq symbol (e.g. override in stooq-eod.ts)
# to verify run still succeeds via Marketstack fallback. Remove sabotage before commit.

# Strict asOfDate check (optional)
$env:SNAPSHOT_STRICT_ASOF_DECKS="US_SECTORS"
pnpm -s update:snapshots
# Confirm snapshot.US_SECTORS.json asOfDate equals minLastDate across its tickers
# Log should show: "🧭 Snapshot asOf: US_SECTORS mode=STRICT_MIN min=... max=... lagTd=0 aligned" (when aligned)
# When aligned: dataFreshness.laggingTickers=[], lagTradingDays=0

# Ensure no cache/artifacts staged
git status
# Should NOT show public/*.json or data/marketstack/eod/*.json staged
```

### CI pipeline checks
- **Artifact validation:** CI must pass `pnpm artifacts:refresh` before deploy (vercel-prebuilt-prod.yml on push; daily-artifacts-deploy.yml on schedule)
- **CI cache: Marketstack EOD (rolling):** CI uses `actions/cache/restore@v4` and `actions/cache/save@v4` so the cache evolves run-to-run. Restore uses prefix `marketstack-eod-v2-` (restore-keys); save uses per-run key `${{ runner.os }}-marketstack-eod-v2-${{ github.run_id }}`. Each run saves a new cache; the next run restores the most recent match. To invalidate (e.g. cache format change), bump `v2`→`v3` in both restore-keys and save key. Diagnostics log file count and size after restore and after artifacts. Save runs with `if: always()` so partial improvements persist even on failure. This does not commit `data/marketstack/eod` to git.
- **Stooq routing in CI:** Workflows read `EOD_STOOQ_DECKS`, `EOD_STOOQ_FORCE_FALLBACK`, `EOD_STOOQ_SYMBOL_OVERRIDES` from GitHub Actions Variables. Recommended: `EOD_STOOQ_DECKS=METALS_MINING,PLUMBING,US_SECTORS,US_FACTORS,GLOBAL_EQUITIES` and `EOD_STOOQ_FORCE_FALLBACK=BNO,FBTC,FETH,SRUUF`. Expected log: `Provider routing: Stooq-first for N symbols (decks: ...), Marketstack direct: K` and `Stooq OK: X | Forced fallback: Y | Stooq failed → Marketstack fallback: Z`
- **Strict asOfDate in CI:** Workflows pass `SNAPSHOT_STRICT_ASOF_DECKS` from GitHub Actions Variables. When set (e.g. `US_SECTORS,US_FACTORS,GLOBAL_EQUITIES,METALS_MINING,PLUMBING`), those decks use min(lastDate) as asOfDate so snapshots don't appear fresher than the stalest ticker.
- **Turbulence gates:** Fetched from Stooq (SPX + VIX EOD); no API key required
- **Daily deploy:** `daily-artifacts-deploy.yml` runs twice on weekdays: 22:15 UTC (primary) and 01:15 UTC (top-off). The top-off pass catches lagging EOD inputs (e.g. BNO in War Lie Detector) that may not have printed the latest close by the first run. Both runs must pass update:snapshots + verify:artifacts before deploying.
- **Production smoke checks:** After deploy, key artifact endpoints should return 200:
  - https://trend100.vercel.app/snapshot.MACRO.json
  - https://trend100.vercel.app/health-history.MACRO.json
  - https://trend100.vercel.app/turbulence.gates.json
  - https://trend100.vercel.app/turbulence.shock.json
  - https://trend100.vercel.app/turbulence.greenbar.json

### PLUMBING smoke checks (PowerShell)

PLUMBING deck (deck ID PLUMBING; UI label "War Lie Detector"). Conceptual model (v2 3-bucket framework, THEATER→CONTAINED) is documented in [WAR_LIE_DETECTOR_V2.md](WAR_LIE_DETECTOR_V2.md). After deploy, run these to verify PLUMBING endpoints:

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
- **Gas/Coal confirms (War Lie Detector):** Optional `energyComplex` in `plumbing.war_lie_detector.json` adds Substitution bucket signals: Gas Stress (UNG) and Coal Bid (COAL). Coal uses COAL (Range Global Coal Index ETF), not KOL. As of PR25, substitution (gas OR coal active) can push regime to REAL_RISK when plumbing is strong (z30≥2). Gas ON = nat gas proxy stressed (z30≥1 or roc3≥5%); Coal ON = coal proxy bid (z30≥1 or roc3≥3%). Stooq spot check: UNG https://stooq.com/q/d/l/?s=ung.us&i=d, COAL https://stooq.com/q/d/l/?s=coal.us&i=d.
- **Energy Breadth (War Lie Detector):** Optional `energyBreadth` answers "How widespread is stress across the energy complex?" — **NARROW** = oil-only; **BROADENING** = oil + gas/coal active; **FULL_STRESS** = oil + gas/coal + gold confirm. Trajectory (ESCALATING/HOLDING/EASING) owns direction; Energy Breadth owns breadth.
- **Plumbing War Lie Detector:** Validates `public/plumbing.war_lie_detector.json`. Regime is bucket-based (PR25): plumbing low → THEATER; plumbing strong + (substitution OR gold) → REAL_RISK; else WATCH. PR27: product stress (UGA/USO) can upgrade watch→strong when active; optional `productStress` in artifact. PR28: labelHistory includes per-day product stress when UGA available; chart bands align with current model. PR29: panel simplified to one headline, "Why this read" (≤3 bullets), "What would change this read" (≤3 bullets); technical details collapsed. PR30: main chart displays stress-up (inverted spread); raw spread in technical details. UGA fetched via Stooq then Marketstack cache; add to EOD_STOOQ_FORCE_FALLBACK if Stooq fails. UI (PR26) displays CONTAINED; bucket chips shown when `bucketState` present or derived.
  - File exists, valid JSON
  - `asOf` within 10 calendar days (weekends/holidays can delay updates)
  - `label` in ["THEATER","WATCH","REAL_RISK"]
  - `score` finite number in [0, 3]
  - `latest.spread`, `latest.spread_z30`, `latest.spread_roc3` are finite numbers
  - `history` is array, sorted ascending by date, length >= 60
  - `labelHistory` (if present): non-empty, sorted ascending by date. PR28: reflects per-day product stress when UGA data available; otherwise plumbing+macro only.
  - `inputsLast` (if present): keys BNO, USO, GLD, SPY, TIP, UUP with YYYY-MM-DD values
  - `dataFreshness` (if present): lagTradingDays finite >= 0, laggingTickers string[]
  - `energyComplex` (if present): natGas/coal objects with ticker (UNG/COAL), asOf YYYY-MM-DD, roc3/z30 finite numbers, active boolean
  - `energyBreadth` (if present): state in [NARROW,BROADENING,FULL_STRESS], reason non-empty string
  - **Data freshness:** UI shows per-ticker last dates, min/max, lagging tickers. If a ticker lags (e.g. BNO stuck at older date), run `pnpm -s update:snapshots` first; BNO may need Marketstack fallback (EOD_STOOQ_FORCE_FALLBACK).
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

### "Reset earliest floor metadata (provider added history)"
- **Fix:** Delete `data/marketstack/meta/earliest.json` to clear known floors
- **Use case:** When Marketstack adds earlier history for a symbol and you want to retry extension

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
