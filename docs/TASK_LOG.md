# TASK LOG — Trend100

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
