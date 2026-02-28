# DECISIONS — Trend100

## Decision Types
Use one of: **Architecture / Product / Data / UI / Naming / Ops**

---

### 2026-02 — (Data/Ops) Plumbing War Lie Detector artifact (geopolitical plumbing)
**Choice:** Added `public/plumbing.war_lie_detector.json` artifact that answers whether physical markets support the political narrative (real shipping/war risk) or are mostly "theater." Uses proxy tickers: BNO (Brent), USO (WTI), GLD (gold), SPY (risk), TIP (TIPS), UUP (dollar). Core metric for z-score and ROC: BNO/USO ratio (more stable than level spread); spread (BNO−USO) kept for display. Label logic: THEATER (z30 < 1 and !goldConfirm), WATCH (z30 ≥ 1 or goldConfirm), REAL_RISK (z30 ≥ 2 and goldConfirm). Score: +2 if z30 ≥ 2, +1 if z30 ≥ 1, +1 if goldConfirm (max 3). Artifacts are generated in CI (workflows/build); never committed. Run `pnpm -s update:plumbing-war-lie-detector` locally; verify with `pnpm -s verify:artifacts`.

**Why:** Geopolitical narrative often diverges from physical market signals. BNO/USO spread widening (Brent premium) can indicate real supply risk; gold confirmation (GLD/SPY and GLD/TIP ROC > 0) supports flight-to-quality. Ratio-based z-score is more stable than level spread for regime detection.

---

### 2026-02 — (Data/Ops) Pilot Stooq EOD provider for deck cache (EOD_STOOQ_DECKS)
**Choice:** Added optional Stooq EOD provider for deck cache generation. When `EOD_STOOQ_DECKS` is set (comma-separated, case-insensitive deck IDs, e.g. `METALS_MINING`, `PLUMBING`), symbols belonging to those decks use Stooq-first with Marketstack fallback: try Stooq for each symbol; on failure (timeout/no data/parse), fall back to Marketstack for that symbol. Same cache format and path (`data/marketstack/eod/*.json`); no workflow changes. Pilot decks: METALS_MINING (11 tickers), PLUMBING (deck ID; UI label "War Lie Detector", 6 tickers: BNO, USO, GLD, SPY, TIP, UUP). Not switching everything yet—Marketstack remains default for all other decks.

**Why:** Reduces Marketstack API usage when hitting monthly limits. Stooq has no API key; fallback ensures update:snapshots completes even if Stooq has uptime or symbol quirks.

---

### 2026-02 — (Data/Ops) Turbulence gates from Stooq instead of FRED (PR26)
**Choice:** Switched `update-turbulence-gates.ts` from FRED (SP500 + VIXCLS) to Stooq CSV for SPX and VIX EOD closes. Eliminates 0–1 day FRED lag so gates align with ShockZ timing. No API key required. Env: `TURBULENCE_GATES_START`, `TURBULENCE_STOOQ_SPX_SYMBOL` (default ^spx), `TURBULENCE_STOOQ_VIX_SYMBOL` (default vi.c = S&P 500 VIX Cash). Output schema unchanged.

**Why:** FRED can lag ShockZ by 0–1 days, causing "Gates pending" mismatches. Stooq EOD aligns with same-day close timing.

---

### 2026-02 — (Data/Ops) VIX symbol fallback + CI env pinning
**Choice:** Stooq returns "no data" for ^vix. Switched default VIX symbol to `vi.c` (S&P 500 VIX Cash, spot index). Added fallback: try `TURBULENCE_STOOQ_VIX_SYMBOL` first if set, else try [vi.c, ^vix, ^VIX, vi.f] in order. Log which symbol succeeded. CI workflows explicitly set `TURBULENCE_STOOQ_VIX_SYMBOL: "vi.c"` so artifacts are stable.

**Why:** ^vix fails in CI; vi.c is Stooq's spot VIX and returns data. Env pinning prevents future regressions if defaults change.

---

### 2026-02-19 — (Data/UI) Turbulence Green Bar null-aware PENDING state when gates lag
**Choice:** When gates (turbulence.gates.json) lag shock (turbulence.shock.json) by a day—e.g., gates last date 2026-02-17 vs shock 2026-02-18—greenbar uses an explicit PENDING state instead of treating missing gates as false. For dates with shock but no gates: `spxAbove50dma`, `vixBelow25`, and `isGreenBar` are set to `null`. UI shows "Turbulence: PENDING" with subtext explaining. Chart overlays render only when `isGreenBar === true` (never for null). verify-artifacts enforces: if gate fields are null, isGreenBar must be null; if gates present, isGreenBar must be boolean.

**Why:** When gates are missing (e.g., market holiday or data timing), treating them as false would mislead users. PENDING state is honest and avoids false negatives.

---

### 2026-02-19 — (Data/UI) Turbulence Green Bar synthesis (Jordi Visser model)
**Choice:** Added derived artifact `public/turbulence.greenbar.json` that joins turbulence.gates.json and turbulence.shock.json by date. Green Bar is active when all three conditions hold: (1) shockZ >= threshold (default 2.0, configurable via TURBULENCE_SHOCK_Z_THRESHOLD), (2) spxAbove50dma === true, (3) vixBelow25 === true. Output: `{ date, shockZ, shockRaw, spxAbove50dma, vixBelow25, isGreenBar }`. Gates and isGreenBar may be null when FRED gates lag shock (see PENDING state decision). Generated after gates and shock in CI; no new secrets. UI shows Turbulence status line (NORMAL | ELEVATED | GREEN BAR ACTIVE | PENDING) and subtle green overlay on Health History chart for Green Bar dates.

**Why:** Aligns with Jordi Visser's Turbulence Model: the Green Bar signals regime confirmation when correlation shock occurs in a supportive environment (SPX above trend, low fear). Derived artifact keeps logic in CI; UI loads from /public like other artifacts.

---

### 2026-02-19 — (Ops) Proxy covariance shock artifact (correlation regime shift)
**Choice:** Added `public/turbulence.shock.json` artifact that measures a "correlation structure shock" using a proxy ETF universe (US_SECTORS deck: SPY + 11 sector SPDRs). Uses EOD cache data; writes daily `shockRaw` (Frobenius norm of Corr_short − Corr_long over off-diagonal pairs) and `shockZ` (z-score over trailing 252-day window). Windows: short=20, long=60, trailingZ=252 trading days; minAssets=8. Outputs `{ date, nAssets, nPairs, shockRaw, shockZ }`. No new secrets; uses Marketstack EOD cache already fed by update:snapshots. Stepping stone to future SPX constituent upgrade.

**Why:** PR9 implements the third prerequisite for Jordi Visser's Turbulence Model: a covariance/correlation shock metric. Proxy universe avoids needing SPX constituents; aligns with Trend100 deck definitions.

---

### 2026-02-19 — (Ops) CI-generated turbulence gates artifact (now Stooq; see PR26)
**Choice:** `public/turbulence.gates.json` artifact built from Stooq EOD (SPX + VIX). The script `update-turbulence-gates.ts` fetches both series, computes SPX 50-day moving average, and outputs daily gate booleans (`spxAbove50dma`, `vixBelow25`) for Turbulence Model alignment (Jordi Visser). Artifacts are generated in CI before build; no runtime fetch. No API key required.

**Why:** Green Bar requires SPX above 50-day MA and VIX below 25. Precomputing in CI keeps the app statically deployable. Stooq aligns gates with ShockZ timing (no FRED lag).

---

### 2026-02-18 — (Ops) Scheduled daily artifacts refresh and deploy
**Choice:** Added `daily-artifacts-deploy.yml` workflow that runs Mon–Fri at 22:15 UTC (after US market close). It generates artifacts, verifies them, and deploys prebuilt to Vercel. The live site gets fresh daily prices without requiring a git push. Legacy artifact workflows (update-snapshots, update-health-history, backfill-health-history, extend-eod-cache) are now manual-only utility workflows and do not commit artifacts.

**Why:** Ensures production data stays current on weekdays even when no code changes are pushed. Manual-only legacy workflows remain available for debugging, backfills, or cache extension without conflicting with the authoritative deploy pipelines.

---

### 2026-02-18 — (Ops) Artifacts generated in CI, deployed via Vercel prebuilt
**Choice:** JSON artifacts (`public/snapshot.*.json`, `public/health-history.*.json`, `public/turbulence.gates.json`, `public/turbulence.shock.json`, `public/turbulence.greenbar.json`) are no longer committed to git. Instead:
- Artifacts are generated in CI on every push to `main` (vercel-prebuilt-prod.yml) and daily via schedule (daily-artifacts-deploy.yml)
- The pipeline runs `pnpm artifacts:refresh` (update:snapshots → update:turbulence-gates → update:turbulence-shock → update:turbulence-greenbar → verify:artifacts) before build
- Deployment uses `vercel build --prod` followed by `vercel deploy --prebuilt --prod` so the freshly generated `/public` artifacts are included in the deployment

**Why:** Keeps the repo focused on source code; avoids large generated JSON diffs and merge conflicts; ensures production always gets artifacts built from the latest data.

---

### 2026-01-29 — (Data/UI) Grouped decks generate group-specific health-history series (used by chart)
**Choice:** For decks whose universe items include `group` (e.g., METALS_MINING), the pipeline generates multiple health-history artifacts:
- `public/health-history.<DECK>.json` (ALL)
- `public/health-history.<DECK>.<group>.json` (e.g., `.metals`, `.miners`)

The UI chart loads the group-specific file when the user selects a group, with fallback to ALL if the group file is missing.

**Why:** The group toggle must change the chart without splitting the deck into multiple decks. Precomputing group series keeps the UI simple and keeps computation in the existing offline/CI pipeline.

---

### 2026-01-29 — (Data/UI) Section-specific health-history for non-grouped multi-section decks
**Choice:** For decks that do **not** have `group` but have **≥2 sections** (e.g., US_FACTORS, GLOBAL_EQUITIES, FIXED_INCOME, MACRO), the pipeline generates section-variant health-history files:
- `public/health-history.<DECK>.json` (ALL)
- `public/health-history.<DECK>.<sectionKey>.json` per section

**Section key naming (single source of truth: `toSectionKey(label)`):** lower-case, trim, `&` → `and`, `/` and whitespace → `-`, strip non-`[a-z0-9-]`, collapse `-`. Examples: `Quality/LowVol` → `quality-lowvol`, `Global ex-US` → `global-ex-us`, `Loans/BDC` → `loans-bdc`, `EM Debt` → `em-debt`.

The UI persists section selection in `?section=<sectionKey>` and fetches `health-history.<DECK>.<sectionKey>.json` (fallback to base on 404), so the chart swaps history when a section pill is selected. Pills row is hidden when unique section count ≤ 1 (LEADERSHIP, US_SECTORS). Label is "Group:" for grouped decks, "Section:" for non-grouped.

**Why:** Section pills previously only filtered the heatmap; the chart stayed on "All". Section variants make the chart reflect the selected section. Same pattern as group variants, without changing data schemas.

**Troubleshooting:** "Pills change heatmap but not chart" → missing section history files or sectionKey mismatch. Run `pnpm verify:artifacts` to ensure all `health-history.<DECK>.<sectionKey>.json` files exist; ensure URL uses the same `toSectionKey` (e.g. `?section=quality-lowvol`).

---

### 2026-01-29 — (Data/UI) Add overextension metrics to mitigate 100% GREEN flatlines
**Choice:** Keep the existing GREEN% health metric unchanged, and add three additional per-day metrics to every health-history point:
- `pctAboveUpperBand`: breadth above the upper band (0–100)
- `stretch200MedianPct`: median distance vs 200D trend (%)
- `heatScore`: 0–100 composite of breadth + stretch

The UI chart can switch between Health/Heat/%AboveUpper/Stretch using `?metric=health|heat|upper|stretch`.

**Why:** Some decks can sit at 100% GREEN for long periods, which hides “overextension / peak risk”. These extra metrics expose saturation even when GREEN% is pinned.

---

### 2026-01-23 — (Data) Backfill UNKNOWN points must include full health-history schema to pass validation
**Choice:** All health-history points (VALID or UNKNOWN) must include the complete required schema with all fields as finite numbers. UNKNOWN points use 0/0/0 for greenPct/yellowPct/redPct (not null) and 0/0/totalTickers for diffusion fields. Introduced `makeUnknownPoint()` helper function to ensure consistent schema compliance.  
**Why:** The `verify:artifacts` validator enforces `hasFullHealthSchema()` which requires all percentage and diffusion fields to be finite numbers. UNKNOWN points with null percentages or missing diffusion fields fail validation, causing backfill workflows to fail.  
**Alternatives considered:** Allow null percentages for UNKNOWN points (breaks validator contract), make validator less strict (defeats purpose of validation), filter out UNKNOWN points (loses timeline continuity).

---

### 2026-01-23 — (Product) METALS_MINING deck with group filtering
**Choice:** Added new deck "Metals & Mining" (METALS_MINING) with 11 tickers split into two groups: METALS (physical/basket ETFs: GLTR, GLDM, SLV, PPLT, PALL) and MINERS (equity ETFs: GDX, GDXJ, SIL, SILJ, XME, PICK). Added optional `group` field to `TrendUniverseItem` and `TrendTickerSnapshot` types. UI shows toggle (All / Metals / Miners) when deck has grouped tickers. Group filter preserved in URL query param (`?group=metals|miners|all`).  
**Why:** Users want to compare physical metals performance vs mining equity performance. Grouping allows filtering without separate decks. URL param enables shareable filtered views.  
**Alternatives considered:** Separate decks for metals vs miners (more duplication), tag-based filtering only (less discoverable), no filtering (doesn't meet requirement).

---

### 2026-01-23 — (Ops) Consolidate scheduled writer workflows to avoid concurrency cancellations
**Choice:** Removed schedule from "Update Health History" workflow (now manual-only via `workflow_dispatch`). Changed all writer workflows' concurrency from `cancel-in-progress: true` to `cancel-in-progress: false` so they queue instead of canceling each other. Only "Update Snapshots" remains scheduled (weekdays 12:15 UTC).  
**Why:** Both "Update Snapshots" and "Update Health History" were scheduled at the same time (12:15 UTC) and shared the same concurrency group with `cancel-in-progress: true`, causing one to cancel the other. Since "Update Snapshots" already updates health history as part of its run, having a separate scheduled health history workflow was redundant and caused cancellations.  
**Alternatives considered:** Different concurrency groups (defeats serialization), different schedule times (still risk overlap), keeping both scheduled with queueing (redundant since Update Snapshots already handles health history).

---

### 2026-01-23 — (Data) Health history sanitization: remove weekend and partial-schema points
**Choice:** Added sanitization step to health history loading that removes weekend dates (Saturday/Sunday) and partial-schema points (missing required fields). Added guards to prevent weekend points from being appended. Added verification checks that fail loudly if weekend or partial points are found.  
**Why:** Weekend dates have no market data and corrupt charts (e.g., 2026-01-24 Saturday point caused massive dip). Partial-schema points (missing knownCount/unknownCount/totalTickers/diffusion fields) indicate incomplete computation and should not be persisted.  
**Alternatives considered:** Filtering in UI only (data corruption remains), manual cleanup (error-prone), accepting weekend points (chart corruption).

---

### 2026-01-23 — (Ops) Inception-limited metadata persistence for cache extension budget protection
**Choice:** Added metadata sidecar files in `data/marketstack/eod/.meta/` to track symbols that cannot extend earlier than their oldest cached date (inception-limited). When extension attempts return 0 older bars, we mark the symbol as inception-limited and skip future extension attempts to preserve budget.  
**Why:** Some symbols (ARM, PLTR, SNOW, etc.) legitimately cannot extend back to 2019 because Marketstack has no historical data. Without metadata, the script would waste extension budget on these symbols every run.  
**Alternatives considered:** Heuristic-based detection only (unreliable), hardcoded allowlist (not scalable), accepting wasted budget (inefficient).

---

### 2026-01-23 — (Data) Increase Marketstack cache retention to 2300 calendar days
**Choice:** Increased `MARKETSTACK_CACHE_DAYS` from 1600 to 2300 calendar days across all workflows and scripts. This provides sufficient lookback for indicator warm-up (SMA200 + 50-week MAs) while keeping health-history retention at 365 days for the chart window.  
**Why:** Indicator warm-up requires more history than the chart displays. With 2300-day cache, the full 1-year health-history window has meaningful values (not flat/zero for early dates).  
**Alternatives considered:** Keep 1600 days (insufficient for full-year meaningful history), unlimited cache (repo size concerns), separate indicator cache (complexity).

---

### 2026-01-23 — (Ops) dotenv + .env.local loading via side-effect import pattern
**Choice:** Implemented local environment variable loading using `dotenv` package with side-effect import pattern (`import './load-env'`). Scripts load `.env.local` first, then `.env` as fallback. Uses `override: false` to ensure CI env vars take precedence.  
**Why:** ESM import order requires env vars to be loaded during import phase, before other modules evaluate. Side-effect import ensures `loadEnv()` runs immediately when the module is imported.  
**Alternatives considered:** Manual `loadEnv()` calls (unreliable in ESM), runtime-only loading (misses import-time reads), hardcoded CI-only approach (poor local dev experience).

---

### 2026-01-22 — (Ops) Workflow: concurrency + rebase/retry to avoid non-fast-forward push failures
**Choice:** Added concurrency group with `cancel-in-progress: true` to prevent overlapping workflow runs. Implemented rebase-before-commit and retry loop (3 attempts) in push step to handle race conditions when main advances during job execution.  
**Why:** Workflow was failing with "cannot lock ref" errors due to concurrent runs or main advancing between commit and push. Concurrency prevents overlaps; rebase+retry handles remaining race conditions without force-push.  
**Alternatives considered:** Force-push (rejected - dangerous), locking mechanism (overkill), accepting failures (unreliable).

---

### 2026-01-21 — (Architecture) Client-side deck switching to avoid server caching issues
**Choice:** Implement deck selection and resolution in a client component (ClientDeckPage) that reads `useSearchParams()` directly. Compute snapshot and fetch history client-side.  
**Why:** Server-side rendering with Next.js had caching/static generation issues where URL param changes didn't trigger re-renders. Client-side approach ensures URL changes always update UI immediately.  
**Alternatives considered:** Server-side with router.refresh() (unreliable), dynamic route segments (more complex), forcing dynamic rendering (still had caching issues).

---

### 2026-01-21 — (Architecture) Multi-deck architecture with URL selector and per-deck persistence
**Choice:** Implement Trend100 as a command center with multiple curated Decks (universes). Use URL search param `?deck=<DECK_ID>` for selection (Leadership default hides param for clean URLs). Persist health history per deck in `public/health-history.<DECK_ID>.json` files.  
**Why:** Separate regimes by universe; keep shareable links; avoid database for now. File-based persistence is simple, version-controlled, and sufficient for daily updates.  
**Alternatives considered:** One giant universe (loses signal clarity), routes per deck (more complex routing), database (Supabase) now (overkill for V1, can add later).

---

### 2026-01-21 — (UI) Sort control added with green-first status ordering
**Choice:** Added Sort toggle with default UNIVERSE (preserves original order). STATUS sort orders GREEN → YELLOW → RED → UNKNOWN (green-first).  
**Why:** Users need to reorder tiles for analysis. Green-first aligns with "leadership tells the truth" philosophy. UNIVERSE default preserves curated order.  
**Alternatives considered:** Red-first status ordering (may add as option later), no default sort (chose UNIVERSE for consistency).

---

### 2026-01-21 — (Ops) Trend100 deployed to Vercel
**Choice:** Trend100 is live on Vercel at https://trend100.vercel.app/  
**Why:** Live URL enables rapid iteration, shareability, and continuous deployment from main  
**Alternatives considered:** Waiting until UI is polished, self-hosting, delaying deployment

---

### 2026-01-19 — (Ops) Trend100 is its own repo
**Choice:** Create Trend100 as a standalone repository (standalone deploy).  
**Why:** Cleanest public shipping path; avoids coupling to Ghost Allocator while preserving future module embedding.  
**Alternatives considered:** Sub-app/package inside an existing repo (faster future embed, more coupling now).

---

### 2026-01-19 — (Architecture) Hybrid module strategy
**Choice:** Build as a standalone-feeling app, but organize internals as a self-contained module: `engine/`, `data/`, `ui/`, `types`.  
**Why:** Ships V1 fast while preserving future integration into Ghost Allocator/GhostRegime with minimal rework.  
**Alternatives considered:** Build directly inside Ghost Allocator (slower public shipping; harder to keep clean boundaries).

---

### 2026-01-19 — (Product) Trend classification rules
**Choice:** Green/Yellow/Red classification using 200d SMA + 50w SMA/EMA support band.  
**Why:** Simple, explainable, testable, and aligned with “leadership tells the truth.”  
**Alternatives considered:** Multi-factor regime models (more nuance; more drift; harder to explain).

---

### 2026-01-19 — (Data) Snapshot-first loading
**Choice:** UI reads latest precomputed snapshot (mock first; real provider later via server-side job).  
**Why:** Fast loads, fewer rate-limit headaches, consistent shareable state.  
**Alternatives considered:** Client-side live fetching (fragile; slower; rate limits; inconsistent “as-of” state).
