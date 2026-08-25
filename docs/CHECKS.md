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
- **Recent vs stale cache (Marketstack batch):** `ensureHistoryBatch` classifies existing caches with the same ≤3 trading-day threshold as single-symbol `ensureHistory`. **Recent** caches use `fetchEodLatestBatch()` only (one newest bar merge). **Stale** caches (more than 3 trading days behind) are **not** included in that latest batch; they get a historical `fetchEodSeries` range from ~5 calendar days before `lastCachedDate` through UTC today, merged into the existing file. Pages of 1000 bars are walked backward if needed; truncation is logged and is not treated as a complete fill. A stale symbol uses historical units **instead of** latest-batch units, not both.
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
# optional: $env:EOD_STOOQ_SYMBOL_OVERRIDES="BRK_B=brk.b.us,TTF=tg.f"
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

### Tests workflow (non-deploy)
- **Unit tests / typecheck / build:** `.github/workflows/tests.yml` runs `pnpm test`, `pnpm typecheck`, `pnpm typecheck:scripts`, and `pnpm build` on pull requests, pushes to `main`, and `workflow_dispatch`. App typecheck covers `src/`; scripts typecheck uses [`tsconfig.scripts.json`](../tsconfig.scripts.json) for ETL/CI scripts under `scripts/`. No deploy, no secrets, no `artifacts:refresh`.
- **Turbulence bootstrap seed staleness:** Same workflow job `turbulence-bootstrap-check` runs `pnpm check:turbulence-bootstrap` (read-only). The committed seed [`ci/bootstrap/turbulence.gates.json`](../ci/bootstrap/turbulence.gates.json) backs cold CI when cache and live prefetch fail; deploy workflows allow **120** calendar days of staleness (`TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS`). The check warns when the seed is within **30** days of that window (~90 days stale) and **fails** within **14** days (~106 days stale) so daily deploy breakage is visible early. Refresh the seed from real Marketstack `GSPC.INDX` + `VIX.INDX` gates (see runbook below). Do not synthesize market data; do not rely on this check to mutate files.

### Turbulence gates bootstrap refresh runbook

Cold-start CI copies [`ci/bootstrap/turbulence.gates.json`](../ci/bootstrap/turbulence.gates.json) when cache restore and live prefetch do not produce a valid gates file. **Primary gates source is Marketstack**, not Stooq. Do not wait for Stooq CSV to unblock.

#### Symbols and generation

- **SPX:** `GSPC.INDX` (override: `TURBULENCE_MARKETSTACK_SPX_SYMBOL`)
- **VIX:** `VIX.INDX` (override: `TURBULENCE_MARKETSTACK_VIX_SYMBOL`)
- Reuses existing `MARKETSTACK_API_KEY`. Never print the key.
- Gate rows use **common trading dates** only (both series have a valid close). **SPX 50-DMA uses the full SPX trading-date series** (VIX gaps do not drop SPX sessions from the window). Semantics unchanged: `spxAbove50dma = SPX > 50-DMA`, `vixBelow25 = VIX < 25`.
- Generated `public/turbulence.gates.json` is **CI/local output — never commit it**.

```bash
pnpm -s update:turbulence-gates
```

Optional: `TURBULENCE_GATES_START=2019-10-01`. Do **not** run `pnpm artifacts:refresh` just to refresh bootstrap.

#### Validate generated gates / bootstrap freshness

```bash
pnpm check:turbulence-bootstrap
```

Generated `public/turbulence.gates.json` must be a sorted JSON array, ≥250 points, schema `{date,spx,spx50dma,spxAbove50dma,vix,vixBelow25}`, non-null `spx50dma` after 50-day warm-up, `last_date` near the latest common Marketstack EOD.

#### Future bootstrap refresh

1. If `public/turbulence.gates.json` exists locally, copy it aside (outside the repo).
2. Run **only** `pnpm -s update:turbulence-gates`.
3. Copy the **last 280** real common-date rows into `ci/bootstrap/turbulence.gates.json`.
4. Restore or discard `public/` so it is not committed.
5. Never synthesize rows. Never copy stale production/local residue. Do not extend staleness windows as the first option.

#### Provider failure / LKG

If Marketstack refresh fails, `update-turbulence-gates` may keep an existing `public/turbulence.gates.json` **only while it is inside** `TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS` (script default 60; CI 120). Expired files are rejected. A failed fetch is logged as a warning, not a successful refresh.

### CI pipeline checks
- **Artifact validation:** CI must pass `pnpm artifacts:refresh` before deploy (vercel-prebuilt-prod.yml on push; daily-artifacts-deploy.yml on schedule)
- **CI cache: Marketstack EOD (rolling):** `daily-artifacts-deploy.yml` uses `actions/cache/restore@v5` and `actions/cache/save@v5` (pnpm store uses `actions/cache@v5`). Restore uses prefix `marketstack-eod-v2-` (restore-keys); save uses per-run key `${{ runner.os }}-marketstack-eod-v2-${{ github.run_id }}`. Each run saves a new cache; the next run restores the most recent match. To invalidate (e.g. cache format change), bump `v2`→`v3` in both restore-keys and save key. Diagnostics log file count and size after restore and after artifacts. Save runs with `if: always()` so partial improvements persist even on failure. This does not commit `data/marketstack/eod` to git.
- **CI cache: turbulence gates LKG (rolling):** Both `daily-artifacts-deploy.yml` and `vercel-prebuilt-prod.yml` restore `public/turbulence.gates.json`, then run **`ci/gha-turbulence-gates-prep.sh`**: if the file is still missing, copy committed **`ci/bootstrap/turbulence.gates.json`** into `public/`; then **safe prefetch** (curl to temp; promote only valid **non-empty** JSON **array**). Order preserves restored/seeded data when live fetch fails. Logs include `cache_exact_hit`, `gates_file_after_cache_restore`, `seed_bootstrap_applied`, curl/temp lines, `final_last_date`, `final_days_stale`, `fallback_max_staleness_days`, `verify_max_staleness_days`, and `staleness_vs_fallback` (report-only) before `artifacts:refresh`. Save after artifacts uses the same `turbulence-gates-lkg-v1` key pattern as EOD. Bump `lkg-v1`→`lkg-v2` if the cache entry must be invalidated. Periodically refresh the bootstrap file if its `last_date` could exceed `TURBULENCE_GATES_VERIFY_MAX_STALENESS_DAYS` (**120** in CI; cold-only runs).
- **Daily Artifacts Deploy (PR41):** Node 24 via `actions/setup-node@v6`; workflow `env` includes `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`. The artifacts step logs non-secret diagnostics before `pnpm artifacts:refresh`.
- **Stooq routing in CI:** Workflows read `EOD_STOOQ_DECKS`, `EOD_STOOQ_FORCE_FALLBACK`, `EOD_STOOQ_SYMBOL_OVERRIDES` from GitHub Actions Variables. Recommended: `EOD_STOOQ_DECKS=METALS_MINING,PLUMBING,US_SECTORS,US_FACTORS,GLOBAL_EQUITIES`, `EOD_STOOQ_FORCE_FALLBACK=BNO,FBTC,FETH,SRUUF`, and `EOD_STOOQ_SYMBOL_OVERRIDES=TTF=tg.f` (for War Lie Detector TTF gas). Expected log: `Provider routing: Stooq-first for N symbols (decks: ...), Marketstack direct: K` and `Stooq OK: X | Forced fallback: Y | Stooq failed → Marketstack fallback: Z`
- **Strict asOfDate in CI:** Workflows pass `SNAPSHOT_STRICT_ASOF_DECKS` from GitHub Actions Variables. When set (e.g. `US_SECTORS,US_FACTORS,GLOBAL_EQUITIES,METALS_MINING,PLUMBING`), those decks use min(lastDate) as asOfDate so snapshots don't appear fresher than the stalest ticker.
- **Turbulence gates:** Fetched from Marketstack EOD (`GSPC.INDX` + `VIX.INDX`) using existing `MARKETSTACK_API_KEY`. `update-turbulence-gates` chunks history so the series is not truncated at 1000 bars. If Marketstack fails, a structurally valid last-known-good `public/turbulence.gates.json` may be kept only while within `TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS` (script default 60). CI sets that and `TURBULENCE_GATES_VERIFY_MAX_STALENESS_DAYS` to **120**. Failed refreshes log warnings and are not claimed as successful. Do not extend those windows without an explicit DECISIONS entry.
- **Daily deploy:** `daily-artifacts-deploy.yml` runs **once per US trading session** at **01:15 UTC Tuesday–Saturday** (`cron: "15 1 * * 2-6"`). Mapping (UTC weekday, do not change casually): Tuesday = Monday session, Wednesday = Tuesday, Thursday = Wednesday, Friday = Thursday, Saturday = Friday. This is the former top-off window, kept because EOD is more likely complete than at 22:15 UTC. `workflow_dispatch` remains. Push-to-main Vercel Prebuilt Prod is unchanged. Each run must pass `artifacts:refresh` (including verify) before deploying.
- **Manual Turbulence shock cache repair (not scheduled):** On **Actions → Daily Artifacts Deploy → Run workflow**, set `repair_turbulence_shock_cache` to **true**. The job restores the EOD cache, then runs `pnpm repair:turbulence-shock-cache` (exactly 12 US_SECTORS / shock symbols, default range **2023-01-01 → UTC today**, real Marketstack EOD, merge-only). Fetch/validate all 12 **in memory first**; cache files are written only if every fetch succeeds (no truncated/empty/error). A failed repair exits non-zero and does **not** mutate `data/marketstack/eod`. Then `artifacts:refresh` as usual. Cron and a dispatch with the flag **false** skip the repair step. Expected repair quota ≈ **12 ticker units** if each symbol fits one ≤1000-bar request (logs print `Marketstack EOD series requests (ticker-units)`). **Run 32860124487 already repaired the 12 caches** (12/12, 910 all-12 dates, latest 2026-08-24, latest-60 SPY missing cells = 0). Do **not** enable this flag on the next scheduled/normal dispatch. After a normal deploy, verify production `turbulence.shock.json`: last date near the latest qualified session (expect ~2026-08-24 after the calendar fix), no large trailing-null trim, `nAssets` in the current window. **Do not** enforce `MIN_ASSETS_TARGET=8` on shockRaw until a post-calendar report-only audit.
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
  - Last point date within `TURBULENCE_GATES_VERIFY_MAX_STALENESS_DAYS` calendar days of UTC today (default **10**; CI sets **120**). Fails if older to block unintentionally stale deploys under the chosen threshold.
  - Null rules: if `spx` or `spx50dma` is null, `spxAbove50dma` must be null; if `vix` is null, `vixBelow25` must be null
  - At least one non-null `spx50dma` (ensures compute is not broken)
- **Turbulence shock:** Validates `public/turbulence.shock.json`:
  - File exists, is an array, ≥100 points (prefer ≥250)
  - Sorted ascending by date
  - Last point date within `TURBULENCE_SHOCK_VERIFY_MAX_STALENESS_DAYS` calendar days of UTC today (default **7**; CI sets **45** to allow expected model lag). Shock trims trailing null rows to last computed date (~20+ trading-day windows); last date may trail snapshots. Fails if older than threshold (pipeline stall).
  - Required keys: date, nAssets, nPairs, shockRaw, shockZ
  - nPairs = nAssets*(nAssets-1)/2 when shockRaw is non-null
  - At least one non-null shockRaw; at least one non-null shockZ (if enough history)
  - Warns on high nulls (minAssets/windows)
  - `update:turbulence-shock` logs: union vs qualified calendar counts, discarded dates since 2023 (date, nCloses, spyClose), latest shock row (`date`, `nAssets`, `nPairs`, `shockRaw`, `shockZ`). Calendar = SPY close + ≥8 recent-universe closes **with finite close > 0**. shockRaw uses a **hard `MIN_ASSETS_TARGET` (8)** on the 20/60-eligible set: 5/6/7 valid assets → `shockRaw` null; 8+ → eligible. No floor-6 fallback. Temporary eligibility diagnostics remain. **Post-deploy (after hard-8 + prior close/calendar repairs):** expect latest shock date near **2026-08-24** (or a later session if EOD has advanced); latest `nAssets=12`, `nPairs=66`, non-null `shockRaw` and current `shockZ`; no unexpected target-8 trailing nulls; latest Green Bar still **2026-02-04** unless market data has genuinely advanced; `verify:artifacts` should pass. Do not treat exact shockRaw/z floats as a permanent invariant. Cache logs may show `[cache] <SYM>: ignored N invalid EOD bar(s): 2026-06-04`.
- **Gas/Coal/TTF confirms (War Lie Detector):** Optional `energyComplex` in `plumbing.war_lie_detector.json` adds Substitution bucket signals: Gas Stress (UNG), Coal Bid (COAL), TTF Gas Stress (Dutch TTF front-month). Coal uses COAL (Range Global Coal Index ETF), not KOL. TTF uses Stooq TG.F; requires `EOD_STOOQ_SYMBOL_OVERRIDES=TTF=tg.f`. As of PR25, substitution (gas OR coal OR ttf active) can push regime to REAL_RISK when plumbing is strong (z30≥2). Gas ON = nat gas proxy stressed (z30≥1 or roc3≥5%); Coal ON = coal proxy bid (z30≥1 or roc3≥3%); TTF ON = European gas stress (z30≥1 or roc3≥5%). Stooq spot check: UNG https://stooq.com/q/d/l/?s=ung.us&i=d, COAL https://stooq.com/q/d/l/?s=coal.us&i=d, TTF https://stooq.com/q/d/?s=tg.f.
- **Energy Breadth (War Lie Detector):** Optional `energyBreadth` answers "How widespread is stress across the energy complex?" — **NARROW** = oil-only; **BROADENING** = oil + gas/coal/TTF active; **FULL_STRESS** = oil + gas/coal/TTF + gold confirm. Trajectory (ESCALATING/HOLDING/EASING) owns direction; Energy Breadth owns breadth.
- **Plumbing War Lie Detector:** Validates `public/plumbing.war_lie_detector.json`. Regime is bucket-based (PR25): plumbing low → THEATER; plumbing strong + (substitution OR gold) → REAL_RISK; else WATCH. PR27: product stress (UGA/USO) can upgrade watch→strong when active; optional `productStress` in artifact. PR28: labelHistory includes per-day product stress when UGA available; chart bands align with current model. PR29: panel simplified to one headline, "Why this read" (≤3 bullets), "What would change this read" (≤3 bullets); technical details collapsed. PR30: main chart displays stress-up (inverted spread); raw spread in technical details. PR32: context-aware transition note near chart (Latest REAL_RISK began / upgrade to WATCH / downgrade to CONTAINED). PR33: signal cards use relevance-based styling (active vs inactive); Coal N/A compact chip. PR34: product stress (UGA/USO) optional chip in bucket row when data present. PR35: chart timeframe chooser (1M/3M/6M/Max) from existing history. PR36: TTF gas stress (Dutch TTF) as substitution signal; optional `energyComplex.ttf`; requires `EOD_STOOQ_SYMBOL_OVERRIDES=TTF=tg.f`. PR37: supporting signals (product stress, Nat Gas, Coal, TTF) get active-state emphasis via chipSupportingActive/cardSupportingActive; Oil/Gold remain primary. UGA fetched via Stooq then Marketstack cache; add to EOD_STOOQ_FORCE_FALLBACK if Stooq fails. UI (PR26) displays CONTAINED; bucket chips shown when `bucketState` present or derived.
  - File exists, valid JSON
  - `asOf` within 10 calendar days (weekends/holidays can delay updates)
  - `label` in ["THEATER","WATCH","REAL_RISK"]
  - `score` finite number in [0, 3]
  - `latest.spread`, `latest.spread_z30`, `latest.spread_roc3` are finite numbers
  - `history` is array, sorted ascending by date, length >= 60
  - `labelHistory` (if present): non-empty, sorted ascending by date. PR28: reflects per-day product stress when UGA data available. PR38: may reflect historical TTF when Stooq TTF data is available. PR39: may reflect historical Nat Gas and Coal when Stooq/Marketstack data is available; historical substitution includes UNG and COAL where data exists; otherwise plumbing+macro only. PR40: optional `historicalInputsUsed` in artifact; if present, technical details shows "Historical inputs used: ...".
  - `inputsLast` (if present): keys BNO, USO, GLD, SPY, TIP, UUP with YYYY-MM-DD values
  - `dataFreshness` (if present): lagTradingDays finite >= 0, laggingTickers string[]
  - `energyComplex` (if present): natGas/coal/ttf objects with ticker (UNG/COAL/TTF), asOf YYYY-MM-DD, roc3/z30 finite numbers, active boolean
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
  - Last date within `TURBULENCE_GREENBAR_VERIFY_MAX_STALENESS_DAYS` calendar days of UTC today (default **7**; CI sets **45**, aligned with shock lag). Greenbar follows last computed shock date; gates may lag further under Stooq fallback (**120**-day policy).
  - Last row must have non-null shockRaw and shockZ
  - When gate fields (spxAbove50dma or vixBelow25) are null, isGreenBar must be null (PENDING state)
  - When both gates are non-null, isGreenBar must be boolean
  - At least one row with shockZ and gates non-null
  - Reports count of rows with pending gates (isGreenBar null)
- EOD cache spans align with retention target (`MARKETSTACK_CACHE_DAYS`, default: 2300 calendar days)
- Inception-limited tickers show `"ℹ️ (limited history: inception)"` instead of `"⚠️ (needs extension)"`
- Health-history spans remain consistent (no unexpected shrinkage)
- Shows cache depth, point counts, and date ranges per deck (includes all decks via `getAllDeckIds()`)
- **Health-history LKG (Actions continuity):** Production restores `public/health-history*.json` from `${{ runner.os }}-health-history-lkg-v1-` **before** `artifacts:refresh`. Logs: exact cache hit, matched key, file count after restore. After generation: file count and last dates for `health-history.MACRO.json`, `health-history.MACRO.fx.json`, `health-history.US_FACTORS.json`. LKG is saved only if generation/verify **succeeded**. Cache miss does not delete files (repo copies remain); optional production HTTPS prefetch is per-file and leaves the local file on failure. **Current-date continuity:** after LKG is working, consecutive production runs should show yesterday’s last dates as the starting series, then one new `asOfDate` — not a jump from ~2026-02-17 to today.
- **Repair EOD Internal Gaps (manual):** Restores production EOD LKG (`marketstack-eod-v2`), fails closed on cache miss, requires SPY last date within 10 UTC days, then runs `audit-marketstack-eod-gaps` against the **SPY usable-session calendar** from `start_date` (default 2026-02-18) through latest SPY. Long gap = ≥5 consecutive missing SPY sessions (isolated single misses including 2026-06-04 are reported, not auto-repaired, not fabricated). **Audit-only:** leave `repair` unchecked; leave `confirm_repair` blank; leave `max_ticker_units` at `0`. Zero Marketstack/Stooq. **Repair UI procedure:** (1) Actions → **Repair EOD Internal Gaps** → Run workflow. (2) Check **`repair`**. (3) Set **`confirm_repair`** to exactly `REPAIR` (case-sensitive). (4) Set **`max_ticker_units`** to a positive integer **≥** the audit’s `projectedRepairSymbols` / `candidateCount` (example after run **32882593515**: `147`). (5) Keep `start_date` `2026-02-18` unless intentionally changing the window. (6) Run. If `repair` is checked but confirmation is blank, or candidates exceed the cap, the job fails **before** Marketstack. Repair prints quota (`candidateCount`, `maxTickerUnits`, `projectedTickerUnits`, symbols, range) then `actualTickerUnits` after fetch. Run **32882593515** consumed **147** ticker-units (one bounded request per candidate); Phase 1’s every-SPY-session check rejected 65 symbols (often only 2026-06-04); Phase 2 never ran; **no files written; no new LKG**. Now Phase A simulates post-merge continuity (`longestMissingRun < 5` is resolvable). Phase B merges only resolvable. **Save improved EOD LKG if ≥1 candidate merged safely**, even if unresolved symbols remain; then completeness `--fail-on-long-gap` may still exit 1. Does not deploy. Does not rebuild health-history. **Do not run Backfill Health History integrity repair until a provider-free EOD audit reports `symbolsWithLongGap = 0`.** Partial EOD LKG is not a green light for health-history repair.
- **Health-history CLI:** `pnpm update:health-history -- --start …` must parse (standalone `--` ignored, same as `verify:artifacts`). Unknown real flags still fail. Run **32877318875** rejected `--` and did no repair / did not replace LKG.
- **Backfill Health History (manual, provider-free):** Restores production EOD (`marketstack-eod-v2`) and health-history LKG. **Fails closed** if `cache-matched-key` is empty (no repo EOD fallback) or if SPY last date is >10 UTC calendar days old. **No** `MARKETSTACK_API_KEY`, **no** Stooq. `MARKETSTACK_OFFLINE=1`. `repair_health_history_integrity=true` first runs provider-free `audit-marketstack-eod-gaps --fail-on-long-gap` (refuses Pass A/B if `symbolsWithLongGap > 0`, even when a partial EOD repair LKG exists). Then Pass A (2026-02-18→today, all decks) then Pass B (MACRO variants only, 2019-10-01→today), then `report-health-history-integrity --fail-on-suspicious` (exit 1 if suspicious stale UNKNOWN > 0 → LKG not saved). Ordinary backfill reports only (non-strict). Verify with `pnpm verify:artifacts -- --health-history-only` (does **not** check Turbulence/Green Bar/snapshot.PLUMBING/War Lie Detector). Production `pnpm verify:artifacts` remains full-strength. Does **not** deploy. After repair, logs per MACRO section (FX/Metals/Commodities/Energy/Uranium/Crypto/Dollar): total/valid/UNKNOWN, first, first valid, last, longest gap after 2026-02-18, `suspiciousStaleUnknown` count (UNKNOWN with eligible≥min(10,n) and known/eligible≥0.7). Expect **0** suspicious rows after Pass B; FX/Metals/Commodities first-valid near 2020-09/10; Dollar/Energy later; Uranium after 2021 inception; Crypto keeps substantial legitimate UNKNOWN. Do not treat exact first-valid dates as permanent invariants. Wait for the next automatic Vercel Prebuilt Prod run after merge **before** dispatching repair, so EOD LKG and an initial health-history LKG exist. Do not dispatch Daily Artifacts solely to publish the repair unless explicitly needed.

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

### "TTF: N/A" in War Lie Detector
- **Symptom:** TTF Gas Stress shows N/A chip instead of ON/OFF card.
- **Cause:** TTF (Dutch TTF front-month) is fetched from Stooq; default symbol `ttf.us` does not exist.
- **Fix:** Add `EOD_STOOQ_SYMBOL_OVERRIDES=TTF=tg.f` to `.env.local` or CI GitHub Actions Variables. Stooq TG.F = Dutch TTF Gas (ICE). Verify: https://stooq.com/q/d/?s=tg.f
- **Note:** If Stooq fetch fails, script continues without TTF (graceful degradation).

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
