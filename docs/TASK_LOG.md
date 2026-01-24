# TASK LOG — Trend100

### 2026-01-22 — Add diffusion layer and omit insufficient-history points
**Completed:**
- Added diffusion computation: % of tickers that changed status vs previous trading day
- Added validity check (TREND100_MIN_KNOWN_PCT, default 0.9): marks points as UNKNOWN if <90% tickers have known status
- Updated TrendHealthHistoryPoint type to support null greenPct/yellowPct/redPct and diffusion fields
- Updated both update-health-history.ts and update-snapshots.ts to compute diffusion and handle UNKNOWN
- Updated UI: added diffusion toggle, chart handles nulls (connectNulls={false}), tooltip shows diffusion and UNKNOWN status
- Updated verification scripts to handle UNKNOWN points (ignore in warm-up checks, count valid vs UNKNOWN)

**Changed:**
- src/modules/trend100/types.ts: TrendHealthHistoryPoint now supports null values and diffusion fields
- scripts/update-health-history.ts: Added validity check, diffusion computation, UNKNOWN handling
- scripts/update-snapshots.ts: Added validity check, diffusion computation, UNKNOWN handling
- src/modules/trend100/ui/HealthHistoryChart.tsx: Added diffusion series, null handling, updated tooltip
- src/modules/trend100/ui/Trend100Dashboard.tsx: Added diffusion toggle, first valid point notice
- scripts/verify-artifacts.ts: Counts valid vs UNKNOWN, shows firstValidDate
- scripts/verify-history-retention.ts: Ignores UNKNOWN in warm-up checks
- scripts/analyze-health-plateaus.ts: Ignores UNKNOWN when detecting plateaus

**Root Cause:**
- Early warm-up periods showed fake "0%" lines because points were computed with insufficient lookback
- No visibility into status churn (diffusion) to understand why plateaus occur
- Discrete % rounding + slow-moving rules can create legitimate flatlines

**Solution:**
- Validity check: if <90% tickers have known status, mark point as UNKNOWN (omit from plot)
- Diffusion: compute % of tickers that flipped status vs previous day (helps explain plateaus)
- UI: show gaps for UNKNOWN points, optional diffusion overlay, tooltip shows both metrics

**How to Use:**
- Toggle "Diffusion" button to see status flip percentage over time
- UNKNOWN points are automatically omitted from chart (gaps shown)
- Tune TREND100_MIN_KNOWN_PCT (0-1) to adjust validity threshold

**Verification:**
- Run pnpm verify:artifacts - should show valid/UNKNOWN counts and firstValidDate
- Early history should show gaps instead of fake 0% lines
- Diffusion should show non-zero values on days with status changes

---

### 2026-01-22 — Add plateau analysis script to diagnose health history flatlines
**Completed:**
- Created scripts/analyze-health-plateaus.ts to detect and explain consecutive identical health points
- Added package.json script: analyze:plateaus
- Plateau detection: finds runs where greenPct/yellowPct/redPct/regimeLabel are all identical
- Explanation mode: recomputes ticker statuses for start/end dates using offline EOD cache
- EOD integrity check: validates bars exist for both dates, flags missing data
- Classification: legitimate (no churn), offsetting churn (net % same), or bug suspicion (missing bars)

**Changed:**
- scripts/analyze-health-plateaus.ts: New script for plateau analysis
- package.json: Added analyze:plateaus script

**Root Cause:**
- Health history can show "flatlines" (consecutive identical points) due to:
  - Legitimate: No status flips (rules are slow-moving, discrete % rounding)
  - Offset churn: Statuses change but net counts stay constant
  - Bug: Missing EOD bars causing carry-forward/last-known behavior

**Solution:**
- Plateau detection identifies suspicious runs
- Explanation mode recomputes statuses to validate legitimacy
- EOD integrity check flags missing data that could cause bugs

**How to Use:**
- Basic: `pnpm analyze:plateaus -- --deck US_SECTORS --min-run 5`
- With date range: `pnpm analyze:plateaus -- --deck US_SECTORS --start 2025-12-01 --end 2026-01-15 --min-run 5`
- With explanation: `pnpm analyze:plateaus -- --deck US_SECTORS --start 2025-12-01 --end 2026-01-15 --min-run 5 --explain`

**Interpretation:**
- "Likely legitimate": No status changes, rules are slow-moving (expected)
- "Offsetting churn": Statuses changed but net % same (expected)
- "BUG SUSPICION": Missing EOD bars detected (investigate cache/data pipeline)

---

### 2026-01-22 — Increase cache depth to 1600 days, fix weekend dip, ensure daily tooltip precision
**Completed:**
- Increased MARKETSTACK_CACHE_DAYS default from 800 to 1600 days everywhere
- Updated all workflows to set MARKETSTACK_CACHE_DAYS=1600
- Improved extend-eod-cache.yml with better input naming (max_symbols instead of extend_max_symbols)
- Added data-side guards: skip writing all-zero or UNKNOWN health points to prevent cliff-drops
- Added UI-side hardening: filter history to <= snapshot.asOfDate and drop trailing zeros
- Verified tooltip uses daily points (Recharts payload already provides actual data point)

**Changed:**
- scripts/marketstack-cache.ts: Default CACHE_DAYS changed from 800 to 1600
- scripts/update-snapshots.ts: Use snapshot.asOfDate (not "today"), skip all-zero/UNKNOWN points
- scripts/update-health-history.ts: Use snapshot.asOfDate, skip all-zero/UNKNOWN in incremental and backfill
- src/modules/trend100/ui/Trend100Dashboard.tsx: Filter to <= snapshot.asOfDate, drop trailing zeros, timeframe by date range
- src/modules/trend100/ui/HealthHistoryChart.tsx: Added minTickGap for better label spacing
- .github/workflows/*.yml: All set MARKETSTACK_CACHE_DAYS=1600
- .github/workflows/extend-eod-cache.yml: Updated defaults and input names
- scripts/verify-artifacts.ts: Updated default cache days to 1600
- scripts/verify-history-retention.ts: Updated EXPECTED_CACHE_DAYS to 1530

**Root Cause:**
- Cache depth was 800 days, limiting lookback for indicators
- Weekend/invalid dates were being appended as "today" causing right-edge cliff-drops
- All-zero or UNKNOWN points were being written, creating visual artifacts

**Solution:**
- Cache depth increased to 1600 days for better indicator lookback
- Data-side: Use snapshot.asOfDate (effective trading day) and skip invalid points
- UI-side: Filter to <= snapshot.asOfDate and drop trailing zeros (belt-and-suspenders)
- Tooltip already uses daily points via Recharts payload (no changes needed)

**How to Verify:**
- Run pnpm verify:artifacts - should show ~1600-day cache spans once extended
- Chart should not show cliff-drop on weekends
- Tooltip should show daily dates for all timeframes (3M, 1Y, ALL)

---

### 2026-01-22 — Fix guardrail blocking workflow: make warm-up check env-gated + ensure cache extension runs
**Completed:**
- Made warm-up zero-point check env-gated (TREND100_STRICT_WARMUP)
- Daily update-snapshots workflow: warm-up check is warning only (non-strict)
- Backfill-health-history workflow: warm-up check is strict (fails if >30% zeros)
- Added cache extension logic to ensureHistoryBatch (was only in ensureHistory)
- Added budget limit: MARKETSTACK_EXTEND_MAX_SYMBOLS (default 10 per daily run, 200 for manual)
- Enhanced verify-artifacts to show cache span for sample symbols (SPY, QQQ, TLT, GLDM, FBTC)
- Created optional extend-eod-cache.yml workflow for manual cache extension
 - Changed health-history retention to long-run by default (HEALTH_HISTORY_RETENTION_DAYS=0 = no trim)

**Changed:**
- scripts/verify-history-retention.ts: Warm-up check now env-gated, warns in non-strict mode
- scripts/marketstack-cache.ts: Added cache extension to ensureHistoryBatch with budget limit
- scripts/verify-artifacts.ts: Enhanced to show cache span and extension status
- .github/workflows/update-snapshots.yml: TREND100_STRICT_WARMUP=0, MARKETSTACK_EXTEND_MAX_SYMBOLS=10
- .github/workflows/backfill-health-history.yml: TREND100_STRICT_WARMUP=1
- .github/workflows/update-health-history.yml: TREND100_STRICT_WARMUP=0, MARKETSTACK_EXTEND_MAX_SYMBOLS=10
- .github/workflows/extend-eod-cache.yml: New manual workflow for cache extension

**Root Cause:**
- Daily workflow was failing because guardrail detected ~92.9% zero points (warm-up issue)
- Cache extension logic existed but wasn't running in ensureHistoryBatch (only in ensureHistory)
- ensureHistoryBatch only called ensureHistory for symbols needing backfill, not extension
- This blocked all future writes to main

**Solution:**
- Two-phase approach: extend cache first, then backfill health-history
- Daily workflow: non-strict warm-up check (warns but doesn't fail), extends 10 symbols per run
- Backfill workflow: strict warm-up check (fails if still mostly zeros after cache extension)
- Cache extension now runs in ensureHistoryBatch with budget limit to avoid API credit blowout
- Manual extend-eod-cache workflow allows extending all symbols at once (200 default)
 - Health-history is retained long-term (no trim by default) so UI “ALL” can show multi-year history as it accumulates
 - EOD cache remains windowed via MARKETSTACK_CACHE_DAYS (extend manually as needed)

**How to Use:**
1. Run extend-eod-cache workflow (or let daily runs extend 10 symbols/day) until caches reach 800 days
2. Run backfill-health-history workflow to regenerate health-history with proper lookback
3. Verify with pnpm verify:artifacts - should show cache spans ~800 days and earliest non-zero near start

**Discovered:**
- Cache extension wasn't running because ensureHistoryBatch didn't check for it
- Need budget limit to avoid API credit exhaustion on scheduled runs
- Warm-up zeros are expected until cache is extended, so daily workflow shouldn't fail on them

---

### 2026-01-22 — Fix chart warm-up issue: extend EOD cache for indicator lookback
**Completed:**
- Introduced MARKETSTACK_CACHE_DAYS (default 800) vs MARKETSTACK_HISTORY_DAYS (365)
- Updated EOD cache retention to use CACHE_DAYS (800) instead of 365
- Added cache extension logic: automatically extends existing cache backwards when span < CACHE_DAYS
- Updated provider to support date_from/date_to for fetching older slices
- Enhanced verification scripts to detect warm-up issues (zero health points)
- Added guardrail to fail if >30% zero points when CACHE_DAYS >= 730
- Updated all workflows to set MARKETSTACK_CACHE_DAYS=800

**Changed:**
- src/modules/trend100/data/providers/marketstack.ts: Added endDate support to FetchEodSeriesOptions
- scripts/marketstack-cache.ts: Use MARKETSTACK_CACHE_DAYS (800) for retention, added cache extension logic
- scripts/verify-artifacts.ts: Added warm-up detection (zero points, earliest non-zero date)
- scripts/verify-history-retention.ts: Added guardrail for warm-up issues (>30% zero points)
- .github/workflows/update-snapshots.yml: Set MARKETSTACK_CACHE_DAYS=800
- .github/workflows/backfill-health-history.yml: Set MARKETSTACK_CACHE_DAYS=800
- .github/workflows/update-health-history.yml: Set MARKETSTACK_CACHE_DAYS=800

**Root Cause:**
- Health-history charts were flat for most of the year because early dates lacked lookback history
- Model uses long lookbacks (SMA200 + 50-week SMA/EMA) requiring ~2 years of data
- EOD cache was trimmed to 365 days, same as chart window, leaving no lookback buffer
- Backfill computed points for early dates but indicators couldn't compute (insufficient prior bars)

**Solution:**
- Separate cache window (800 days) from chart window (365 days)
- Cache extension: one-time fetch of older data when cache span < CACHE_DAYS
- Provider supports date_from/date_to for fetching specific date ranges
- Verification detects warm-up issues and warns/fails appropriately

**How to Verify:**
- Run `pnpm verify:artifacts` - should show earliest non-zero date near start of 365-day window
- After cache extension + backfill, charts should show meaningful data across full year
- Guardrail will fail if >30% zero points when cache should be extended

**Discovered:**
- Indicator warm-up requires ~2 years of data (200d SMA + 50w MAs)
- Cache window must be longer than chart window to provide lookback buffer
- One-time cache extension is acceptable cost to fix warm-up issue

---

### 2026-01-22 — Add offline backfill for health history from EOD cache
**Completed:**
- Added CLI args to update-health-history.ts: --backfill-days <N> and --start/--end date range
- Implemented offline backfill mode that computes health history from local EOD cache files
- Added offline guard to Marketstack provider (prevents API calls when MARKETSTACK_OFFLINE=1)
- Created backfill logic that computes health for each trading day in range using existing snapshot computation
- Added package.json script: update:health-history:backfill
- Created optional workflow_dispatch workflow for manual backfill runs

**Changed:**
- scripts/update-health-history.ts: Added backfill mode with CLI args, offline EOD cache loading, date range computation
- src/modules/trend100/data/providers/marketstack.ts: Added offline guards to fetchEodSeries and fetchEodLatestBatch
- package.json: Added update:health-history:backfill script
- .github/workflows/backfill-health-history.yml: New workflow for manual backfill (workflow_dispatch only)

**Root Cause:**
- Health history only had 3 days but EOD cache had ~253 bars (~1 year)
- Needed one-time backfill to generate historical health points from existing EOD cache without hitting API

**Solution:**
- Backfill mode: Loads EOD cache files directly, computes health for each trading day in range
- Uses same snapshot computation logic as update-snapshots.ts but filters EOD bars to <= target date
- Offline guard: MARKETSTACK_OFFLINE=1 prevents accidental API calls (defaults to offline for backfill)
- Merges backfilled points with existing history, applies retention (365 days)

**How to Use:**
- Local: `pnpm update:health-history:backfill` (defaults to 365 days, offline)
- Custom range: `pnpm update:health-history --backfill-days 180` or `--start 2025-01-01 --end 2025-12-31`
- Workflow: Manual dispatch via GitHub Actions UI with optional backfill_days input

**Discovered:**
- EOD cache files use symbol with periods replaced by underscores (e.g., BRK.B → BRK_B.json)
- Trading days inferred from EOD cache availability (dates that have data for at least one ticker)
- Backfill can generate ~200-260 points per deck from existing EOD cache

---

### 2026-01-22 — Fix chart history truncation (add retention + guardrails)
**Completed:**
- Added retention logic to health history generation (keep last 365 calendar days)
- Added retention logic to EOD cache (keep last 365 calendar days, ~252 trading days)
- Created time series merge/trim utilities for consistent retention across artifacts
- Added guardrail check script to prevent silent history loss (>20% shrinkage or <30 points after running)
- Added verification command to print file stats (point counts, date ranges)
- Updated workflow to run guardrail check before committing

**Changed:**
- scripts/timeSeriesUtils.ts: New utility functions for merge and retention
- scripts/update-snapshots.ts: Added retention logic to health history updates
- scripts/update-health-history.ts: Added retention logic
- scripts/marketstack-cache.ts: Added retention trimming to EOD cache saves
- scripts/verify-history-retention.ts: New guardrail check script
- scripts/verify-artifacts.ts: New verification command
- .github/workflows/update-snapshots.yml: Added guardrail check before commit
- package.json: Added verify:artifacts and verify:history-retention scripts

**Root Cause:**
- Health history files were being overwritten/reset, losing historical data
- Scripts merged correctly but had no retention policy, and workflow resets could lose data
- No guardrails to detect silent data loss

**Solution:**
- Merge existing history with new points (dedupe by date), then trim to retention window
- Retention: 365 calendar days for health history, 365 calendar days (~252 trading days) for EOD cache
- Guardrail: Fail workflow if history shrinks >20% or drops below 30 points after running for a while
- Verification: Command to print file stats for debugging

**How to Verify:**
- Run `pnpm verify:artifacts` to see point counts and date ranges
- Check charts in production - should show ~1 year of history after running for a year
- Guardrail will fail workflow if history loss is detected

**Discovered:**
- Health history had only 3 days (Jan 21-23) while EOD cache had 252 points (1 year)
- Chart component doesn't slice data - it uses all data passed to it
- Retention logic prevents unbounded growth while preserving ~1 year of history

---

### 2026-01-22 — Fix workflow scheduled run failures (replace rebase with sync->generate->commit->push)
**Completed:**
- Replaced commit-then-rebase strategy with sync->generate->commit->push retry loop
- Moved generation step inside retry loop so each retry regenerates from latest origin/main
- Updated concurrency group to `trend100-cache-writer` (shared across all cache-writing workflows)
- Added same fix to both update-snapshots.yml and update-health-history.yml workflows

**Changed:**
- .github/workflows/update-snapshots.yml: Replaced rebase logic with sync->generate->commit->push loop
- .github/workflows/update-health-history.yml: Added concurrency group, fetch-depth: 0, and sync->generate->commit->push loop

**Root Cause:**
- Scheduled runs collide with other writes to main (overlapping workflow runs, manual dispatch, bot/user commits)
- When origin/main advances during run, push is rejected
- Rebasing commits that modify generated JSON causes conflicts because JSON changes in overlapping regions cannot auto-merge cleanly

**Solution:**
- On each retry: sync to latest origin/main (hard reset), regenerate artifacts from scratch, commit, push
- This avoids JSON merge conflicts entirely by never attempting to merge generated files
- Generation inside loop ensures retries are always based on latest origin/main, not stale state

**Discovered:**
- Previous rebase approach was brittle for generated JSON files
- Moving generation inside retry loop is critical - otherwise retries use stale artifacts and continue failing
- Shared concurrency group prevents multiple workflows from writing to main simultaneously

---

### 2026-01-22 — Fix update-snapshots workflow push race condition
**Completed:**
- Added concurrency group to prevent overlapping workflow runs
- Set fetch-depth: 0 for full git history
- Implemented rebase-before-commit in push step
- Added retry loop (3 attempts) with rebase on push failures
- Added check to exit early if no staged changes after rebase

**Changed:**
- .github/workflows/update-snapshots.yml: Added concurrency, fetch-depth: 0, rebase/retry logic in commit/push step

**Discovered:**
- Race conditions occur when main advances between checkout and push
- Concurrency prevents overlapping runs; rebase+retry handles remaining edge cases

---

### 2026-01-21 — Client-side deck switching fix implemented
**Completed:**
- Created ClientDeckPage component for client-side deck resolution
- Moved deck selection logic from server to client component
- Implemented client-side history fetching from public JSON files with mock fallback
- Added debug panel when ?debug=1 for live testing
- Simplified server page.tsx to minimal wrapper
- Fixed deck switching bug where URL changes didn't update UI

**Changed:**
- src/app/ClientDeckPage.tsx: New client component that reads useSearchParams() and handles deck resolution
- src/app/page.tsx: Simplified to server wrapper that only determines isDemoMode
- src/modules/trend100/data/mockHealthHistory.ts: Added seed parameter support
- src/modules/trend100/ui/TopBar.tsx: Removed router.refresh() calls (not needed with client-side)

**Discovered:**
- Client-side resolution avoids Next.js server caching/static generation issues
- useSearchParams() in client component provides immediate reactivity to URL changes
- Client-side fetch for history files works reliably with proper error handling

---

### 2026-01-21 — Multi-deck architecture completed and deployed
**Completed:**
- Deck registry created with 6 decks (Leadership 100, US Sectors, US Factors, Global Equities, Fixed Income, Macro)
- Deck selector dropdown added to TopBar with URL search param support (`?deck=<DECK_ID>`)
- Per-deck health history persistence implemented (`public/health-history.<DECK_ID>.json`)
- Updated `getLatestSnapshot(deckId)` and `getHealthHistory(deckId)` to be deck-aware
- Updated `update-health-history` script to update all decks in one run
- Updated GitHub Actions workflow cron to 12:15 UTC (early morning Chicago intent)
- Fixed Vercel build error (removed useSearchParams, use useRouter directly)
- All per-deck history files created and committed

**Changed:**
- src/modules/trend100/data/validateUniverse.ts: Removed 100-ticker requirement (supports variable deck sizes)
- src/modules/trend100/data/decks.ts: New deck registry with all 6 deck definitions
- src/modules/trend100/data/getLatestSnapshot.ts: Now accepts deckId parameter
- src/modules/trend100/data/getHealthHistory.ts: Now accepts deckId, loads per-deck files
- src/modules/trend100/data/mockSnapshot.ts: Seeds with deckId + date for daily variation
- scripts/update-health-history.ts: Loops through all decks, creates per-deck files
- .github/workflows/update-health-history.yml: Updated cron to 12:15 UTC, commits all per-deck files
- src/app/page.tsx: Reads `?deck=` search param, validates and passes to dashboard
- src/modules/trend100/ui/TopBar.tsx: Added deck selector with URL navigation (useRouter)
- src/modules/trend100/ui/Trend100Dashboard.tsx: Accepts and displays deck info

**Discovered:**
- Deck overlap is allowed (same ticker can appear in multiple decks)
- File-based persistence works well for daily updates without database overhead
- URL search param approach keeps single page while enabling shareable deck links
- Mock data seeding with deckId + date enables deck-specific variation while staying deterministic

---

### 2026-01-21 — Multi-deck architecture implemented
**Completed:**
- Added deck types and registry (6 decks: Leadership, US Sectors, US Factors, Global Equities, Fixed Income, Macro)
- Made getLatestSnapshot and getHealthHistory deck-aware
- Implemented per-deck health history persistence (public/health-history.<deckId>.json)
- Updated update-health-history script to update all decks in one run
- Added deck selector dropdown to TopBar with URL search param support (?deck=)
- Updated GitHub Actions workflow to commit all per-deck history files
- Renamed default universe UI label to "Leadership 100"

**Changed:**
- src/modules/trend100/types.ts: Added TrendDeckId, TrendDeck types, providerTicker field
- src/modules/trend100/data/decks.ts: New deck registry with all 6 deck definitions
- src/modules/trend100/data/getLatestSnapshot.ts: Now accepts deckId parameter
- src/modules/trend100/data/getHealthHistory.ts: Now accepts deckId, loads per-deck files
- src/modules/trend100/data/mockSnapshot.ts: Seeds with deckId + date for daily variation
- scripts/update-health-history.ts: Loops through all decks
- .github/workflows/update-health-history.yml: Updated cron to 12:15 UTC, commits all files
- src/app/page.tsx: Reads ?deck= search param, validates and passes to dashboard
- src/modules/trend100/ui/TopBar.tsx: Added deck selector with URL navigation
- src/modules/trend100/ui/Trend100Dashboard.tsx: Accepts and displays deck info

**Discovered:**
- URL search param approach keeps single page while enabling shareable deck links
- Per-deck history files allow independent tracking without database
- Mock data seeding with deckId + date enables deck-specific variation while staying deterministic

---

### 2026-01-21 — Sort toggle implemented
**Completed:**
- Implemented Sort toggle feature with four options: Universe, Status, Change, Ticker
- Created centralized sorting logic in `sortUtils.ts`
- Added sort control UI to TopBar (dropdown)
- Integrated sorting into dashboard (applies after filtering)

**Changed:**
- src/modules/trend100/ui/sortUtils.ts: New file with sortTickers() function
- src/modules/trend100/ui/Trend100Dashboard.tsx: Added sort state and sorting pipeline
- src/modules/trend100/ui/TopBar.tsx: Added sort dropdown control

**Discovered:**
- Sorting logic centralized for maintainability; default UNIVERSE preserves original order
- STATUS sort uses green-first ordering (GREEN → YELLOW → RED → UNKNOWN)

---

### 2026-01-21 — Vercel live milestone recorded
**Completed:**
- Updated project brain docs to record Vercel deployment milestone
- Added deployment decision entry to DECISIONS.md
- Updated STATUS.md to reflect live deployment state
- Updated HANDOFF.md with current priorities

**Changed:**
- docs/DECISIONS.md: Added Vercel deployment decision
- docs/STATUS.md: Updated current state and next actions
- docs/HANDOFF.md: Updated session summary and priorities

**Discovered:**
- Future work should proceed with mock snapshot + UI development now that deployment pipeline is established

---

### 2026-01-19 — Kickoff + project brain initialized
**Completed:**
- Captured kickoff brief, V1 scope, and trend rules
- Locked repo decision: Trend100 will be its own repo
- Created lightweight memory files (PROJECT/STATUS/DECISIONS/TASK_LOG/CHECKS/HANDOFF)

**Changed:**
- N/A (new project)

**Discovered:**
- First drift risks: ticker list/tags and tooling defaults (chart library, tests) must be recorded early.
