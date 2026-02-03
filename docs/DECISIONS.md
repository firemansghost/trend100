# DECISIONS — Trend100

## Decision Types
Use one of: **Architecture / Product / Data / UI / Naming / Ops**

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
