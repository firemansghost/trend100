# DECISIONS — Trend100

## Decision Types
Use one of: **Architecture / Product / Data / UI / Naming / Ops**

---

### 2026-04 — (Ops) Daily Artifacts Deploy workflow Node 24 and diagnostics (PR41)
**Choice:** `daily-artifacts-deploy.yml` uses `actions/checkout@v6`, `actions/setup-node@v6` with `node-version: "24"`, `actions/cache@v5` and `actions/cache/restore@v5` / `actions/cache/save@v5`. Workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` opts JS actions to Node 24 during GitHub’s Node 20 deprecation phase. The artifacts step prints non-secret diagnostics (node/pnpm versions, whether key env vars are set or non-empty) before `pnpm artifacts:refresh`; a `if: failure()` step adds a short hint. Schedule and EOD cache keys unchanged.

**Why:** Node 20 for Actions is deprecated; align with Node 24–ready action versions and make artifact failures easier to debug without exposing secrets.

---

### 2026-03 — (Product/Architecture) War Lie Detector v2 conceptual model (PR24)
**Choice:** Lock War Lie Detector v2 conceptual model: 3-bucket framework (Physical Plumbing → Substitution → Macro Confirmation), THEATER→CONTAINED rename justification, signal mapping. See [WAR_LIE_DETECTOR_V2.md](WAR_LIE_DETECTOR_V2.md).

**Why:** The current model leans too heavily on broad confirmation; v2 prioritizes physical plumbing stress first. Documentation locks the mental model before engine changes. No engine rewrite, threshold tuning, or provider changes in this PR.

---

### 2026-03 — (Product/Data) War Lie Detector bucket-based regime logic (PR25)
**Choice:** Regime now derives from bucket state (Physical Plumbing → Substitution → Macro Confirmation) instead of a flat confirm count. Plumbing low (z30 < 1) → THEATER; plumbing strong (z30 ≥ 2) AND (substitution OR gold) → REAL_RISK; otherwise → WATCH. Gold is no longer a primary gate for REAL_RISK without strong plumbing. Substitution (nat gas, coal) can now push to REAL_RISK when plumbing is strong. Artifact exposes optional `bucketState` for future PR26 bucket chips. Score remains legacy (oil + gold); labelHistory uses plumbing+macro-only for historical days (no energyComplex per day).

**Why:** PR24 v2 spec requires plumbing-first, substitution for spread, macro supportive. Engine now matches the conceptual model.

---

### 2026-03 — (UI) War Lie Detector v2 bucket alignment (PR26)
**Choice:** UI now displays CONTAINED instead of THEATER (artifact label unchanged). Bucket chips (Plumbing / Substitution / Macro) shown from `artifact.bucketState` when present, else derived from z30/energyComplex/goldConfirm. Confirms X/3 moved to technical details as "Legacy score: X/3 (oil + gold; regime is bucket-based)". Chart legend and all copy use bucket framing (plumbing-first, substitution, macro).

**Why:** Align UI with v2 bucket model; avoid confusing users with THEATER vs CONTAINED; surface bucket state for transparency.

---

### 2026-03 — (Product/Data) War Lie Detector product stress proxy (PR27)
**Choice:** Added UGA/USO (gasoline vs crude) as secondary physical plumbing proxy. Physical Plumbing = strong when BNO/USO z30 ≥ 2, or when z30 1–2 AND product stress active. Product stress active when UGA/USO ratio z30 ≥ 1 or roc3 ≥ 4%. UGA fetched via Stooq then Marketstack cache (same pattern as UNG/COAL). Product stress optional in artifact; if fetch fails, continue without. labelHistory unchanged (plumbing+macro only).

**Why:** Reduces dependence on single Brent-vs-WTI anchor; refined product stress can confirm physical tightness. UGA tracks RBOB gasoline; ratio captures crack-spread widening.

---

### 2026-03 — (Product/Data) War Lie Detector history alignment (PR28)
**Choice:** Historical labelHistory now includes per-day UGA/USO product stress when UGA data is available. Chart bands align with current plumbing model. Same thresholds as PR27 (z30 ≥ 1 or roc3 ≥ 4% for product stress; watch + product stress → strong). If UGA fetch fails, history falls back to plumbing+macro only. No per-day substitution (UNG/COAL) in history.

**Why:** Chart bands and "Latest REAL_RISK began" previously reflected plumbing+macro-only logic; history now matches current-state regime model.

---

### 2026-03 — (UI) War Lie Detector panel simplify (PR29)
**Choice:** Panel simplified to one headline (acute market stress framing), one "Why this read" box (max 3 bullets), and one "What would change this read" box (max 3 bullets). Redundant verdict/trajectory/energy lines and duplicate Explain/notLines removed. Duplicate Data freshness block removed (freshness remains in chip row). Copy reframed toward acute market stress (e.g. "Acute market stress is contained for now" instead of "Conditions are contained"). No model or data changes.

**Why:** Reduce repetition and semantic overclaim; page should read as one clean briefing, not a stack of overlapping explanations.

---

### 2026-03 — (UI) War Lie Detector stress chart (PR30)
**Choice:** Main plumbing chart now displays inverted spread (BNO−USO) so higher = more stress. Title changed to "Plumbing stress"; helper text "Derived from Brent−WTI spread; higher = more stress." Raw spread remains in technical details. Regime bands unchanged. No model or artifact changes.

**Why:** Raw spread often moves down during stress; inverting for display makes the chart read as a stress-up gauge without mental algebra.

---

### 2026-03 — (UI) War Lie Detector cleanup (PR31)
**Choice:** Removed dead code (getVerdict, gasCoalPhrase, getExplainBullets, inputsLast). Copy polish in getWhatToWatchNext: "Escalation is broadening" → "Stress is broadening"; "flips on" → "turns on"; "rises above Watch" → "rises to Watch". When Nat Gas data is N/A, show compact chip instead of full card. File header updated to reflect current structure.

**Why:** Reduce clutter; align wording with acute stress framing; optional DECISIONS entry for product-facing wording change.

---

### 2026-03 — (UI) War Lie Detector transitions (PR32)
**Choice:** Added context-aware transition note derived from labelHistory, displayed near the plumbing chart. When regime is REAL_RISK: "Latest REAL_RISK began: YYYY-MM-DD". When WATCH: "Latest upgrade to WATCH: YYYY-MM-DD". When CONTAINED: "Latest downgrade to CONTAINED: YYYY-MM-DD". No artifact or model changes.

**Why:** Help users see when the latest meaningful regime change occurred without adding hardcoded event markers.

---

### 2026-03 — (UI) War Lie Detector card cleanup (PR33)
**Choice:** Signal cards now use relevance-based styling: active/decision-relevant cards (Oil Watch or Active, Gold Yes, Nat Gas ON, Coal ON) use stronger treatment; inactive cards use softer border and background. Coal N/A shows compact chip (like Nat Gas N/A). No model or artifact changes.

**Why:** Improve scan efficiency; active signals stand out; inactive and N/A states are quieter and consistent.

---

### 2026-03 — (UI) War Lie Detector product stress visibility (PR34)
**Choice:** Product stress (UGA/USO) surfaced as optional chip in bucket row when data present: "Refined product stress: active" or "Refined product stress: quiet". Chip only shown when artifact has productStress; no chip when UGA fetch failed. Tooltip explains UGA/USO as gasoline vs crude supporting physical plumbing read. No model or artifact changes.

**Why:** Make supporting physical signal visible at a glance without adding a new section or full card; Brent-vs-WTI remains anchor.

---

### 2026-03 — (UI) War Lie Detector chart timeframe (PR35)
**Choice:** Chart timeframe chooser (1M / 3M / 6M / Max) above plumbing chart. Only options valid for actual history span are shown (e.g. with ~90-day history: 1M, 3M, Max; 6M when span >= 6 months). Filtering is client-side over existing history and labelHistory; regime bands and both charts use the same filtered date range. Control hidden when only Max is valid. No artifact or script changes.

**Why:** Let users zoom to recent window or view full history without adding fetches or model logic.

---

### 2026-03 — (Product/Data) War Lie Detector TTF gas substitution (PR36)
**Choice:** Added Dutch TTF (Title Transfer Facility) European natural gas stress as a new substitution/broadening signal. TTF is a standalone price series (Stooq TG.F), not a spread. Thresholds mirror UNG (z30 ≥ 1 or roc3 ≥ 5%). substitutionActive = natGas OR coal OR ttf; energyBreadth and trajectory include ttf. TTF surfaced as signal card (or compact chip when N/A). Historical labelHistory does not include per-day TTF; current-state integration only. Requires `EOD_STOOQ_SYMBOL_OVERRIDES=TTF=tg.f`.

**Why:** Captures whether energy stress is broadening into European/LNG/gas markets, not just oil plumbing. TTF is substitution/broadening, not plumbing anchor.

---

### 2026-03 — (UI) War Lie Detector supporting signal emphasis (PR37)
**Choice:** Supporting signals (product stress chip, Nat Gas, Coal, TTF) get modest active-state emphasis via `chipSupportingActive` and `cardSupportingActive`. Product stress chip uses stronger chip styling when active, muted when quiet. Substitution cards use `cardSupportingActive` when ON (distinct from primary `cardActive`). Oil Stress and Gold Confirm remain primary with `cardActive`. Display-only; no model or artifact changes.

**Why:** Make active supporting signals easier to notice when reinforcing the read, while keeping plumbing/oil visually primary and inactive signals understated.

---

### 2026-03 — (Product/Data) War Lie Detector historical TTF alignment (PR38)
**Choice:** Historical labelHistory now includes per-day TTF when Stooq TTF data is available. Historical substitution = TTF active that day (same logic as current: z30 ≥ 1 or roc3 ≥ 5%); chart bands and transition notes reflect TTF broadening in the past. Same source (Stooq TG.F via fetchEnergyBars) and thresholds as PR36. PR39 adds per-day UNG/COAL.

**Why:** Chart bands and "Latest REAL_RISK began" previously ignored historical TTF; history now aligns with current-state regime model when TTF data exists.

---

### 2026-03 — (Product/Data) War Lie Detector historical Nat Gas and Coal substitution (PR39)
**Choice:** Historical labelHistory now includes per-day UNG (Nat Gas) and COAL when data is available. Historical substitution = TTF OR Nat Gas OR Coal active that day; chart bands and transition notes reflect full substitution. Same sources (Stooq ung.us, coal.us via fetchEnergyBars) and thresholds as current (UNG: z30 ≥ 1 or roc3 ≥ 5%; COAL: z30 ≥ 1 or roc3 ≥ 3%). If UNG or COAL fetch fails, script continues without that signal for that run.

**Why:** Chart bands and transition notes previously understated historical substitution when Nat Gas or Coal mattered; history now aligns with current-state substitution model when data exists.

---

### 2026-03 — (Product/Data) War Lie Detector historical inputs visibility (PR40)
**Choice:** Added optional `historicalInputsUsed` to plumbing artifact (productStress, ttf, natGas, coal booleans). Technical details shows one compact line indicating which historical optional inputs were used when building labelHistory for the run. Display-only; no model changes. Improves trust/debuggability for power users.

**Why:** Power users could not quickly tell which historical components (product stress, TTF, Nat Gas, Coal) were available and used for the current run; visibility was implicit in logs/docs only.

---

### 2026-02 — (Data/Ops) Plumbing War Lie Detector artifact (geopolitical plumbing)
**Choice:** Added `public/plumbing.war_lie_detector.json` artifact that answers whether physical markets support the political narrative (real shipping/war risk) or are mostly "theater." Uses proxy tickers: BNO (Brent), USO (WTI), GLD (gold), SPY (risk), TIP (TIPS), UUP (dollar). Core metric for z-score and ROC: BNO/USO ratio (more stable than level spread); spread (BNO−USO) kept for display. Label logic: THEATER (z30 < 1 and !goldConfirm), WATCH (z30 ≥ 1 or goldConfirm), REAL_RISK (z30 ≥ 2 and goldConfirm). Score: +2 if z30 ≥ 2, +1 if z30 ≥ 1, +1 if goldConfirm (max 3). Artifacts are generated in CI (workflows/build); never committed. Run `pnpm -s update:plumbing-war-lie-detector` locally; verify with `pnpm -s verify:artifacts`.

**Why:** Geopolitical narrative often diverges from physical market signals. BNO/USO spread widening (Brent premium) can indicate real supply risk; gold confirmation (GLD/SPY and GLD/TIP ROC > 0) supports flight-to-quality. Ratio-based z-score is more stable than level spread for regime detection.

---

### 2026-02 — (Data/Ops) Pilot Stooq EOD provider for deck cache (EOD_STOOQ_DECKS)
**Choice:** Added optional Stooq EOD provider for deck cache generation. When `EOD_STOOQ_DECKS` is set (comma-separated, case-insensitive deck IDs), symbols belonging to those decks use Stooq-first with Marketstack fallback: try Stooq for each symbol; on failure (timeout/no data/parse), fall back to Marketstack for that symbol. Same cache format and path (`data/marketstack/eod/*.json`). Pilot decks: METALS_MINING (11), PLUMBING (6; deck ID PLUMBING, UI "War Lie Detector"), US_SECTORS (12), US_FACTORS (10), GLOBAL_EQUITIES (11). `EOD_STOOQ_FORCE_FALLBACK` skips Stooq for tickers not reliably on Stooq (e.g. BNO, FBTC, FETH, SRUUF—commodity/crypto/trust). Not switching everything yet—Marketstack remains default for LEADERSHIP, FIXED_INCOME, MACRO.

**Why:** Reduces Marketstack API usage when hitting monthly limits. Stooq has no API key; forced fallback avoids wasted attempts on known non-Stooq tickers.

---

### 2026-02 — (Data/Ops) Stooq symbol overrides + forced Marketstack fallback
**Choice:** Added two env vars to improve Stooq pilot reliability. Stooq coverage is inconsistent (e.g. BNO returns 0 bars via default `bno.us`). (1) **EOD_STOOQ_SYMBOL_OVERRIDES** — mapping string, e.g. `BNO=bno.us,BRK_B=brk.b.us` or multi-candidate `BNO=bno.us|bno|bno.uk` (tries in order until one returns bars). (2) **EOD_STOOQ_FORCE_FALLBACK** — comma-separated tickers that skip Stooq entirely and go straight to Marketstack (e.g. `BNO,FBTC`). Logs: `Stooq override: TICKER -> symbolUsed`, `Stooq forced fallback: TICKER`.

**Why:** Some tickers have no usable Stooq data; forcing fallback avoids wasted Stooq attempts. Overrides let us pin weird tickers to the right Stooq symbol or try alternatives.

---

### 2026-02 — (Data/Ops) CI Stooq routing from GitHub Actions Variables
**Choice:** CI workflows (vercel-prebuilt-prod.yml, daily-artifacts-deploy.yml) now read Stooq routing config from GitHub Actions Variables: `EOD_STOOQ_DECKS`, `EOD_STOOQ_FORCE_FALLBACK`, `EOD_STOOQ_SYMBOL_OVERRIDES`. Set in repo Settings → Secrets and variables → Actions → Variables. Empty/unset preserves default (all Marketstack). Enables Stooq-first for pilot decks in CI without editing workflow YAML.

**Why:** Scheduled/CI runs were burning Marketstack unnecessarily. Variables let us toggle Stooq routing centrally; no code changes needed to adjust which decks use Stooq.

---

### 2026-02 — (Data/Ops) Optional strict asOfDate for snapshots (SNAPSHOT_STRICT_ASOF_DECKS)
**Choice:** Added optional `SNAPSHOT_STRICT_ASOF_DECKS` env var (comma-separated deck IDs). When a deck is in the list, snapshot asOfDate = min(lastDate) across that deck's tickers (STRICT_MIN mode). Otherwise asOfDate = max(lastDate) (DEFAULT). Snapshot computation uses `computeTickerSnapshotForDate` in strict mode to clamp bars to ≤ deckAsOfDate (no lookahead). Snapshot JSON may include optional `asOfDateMode` and `dataFreshness` (minLastDate, maxLastDate, laggingTickers) for debugging. CI workflows pass the var from GitHub Actions Variables.

**Why:** Snapshots could appear fresher than reality when one ticker was stale (e.g. 10 tickers at 2026-03-03, 1 at 2026-02-27, but asOfDate showed 2026-03-03). Strict mode ensures the deck reflects the stalest component. Default behavior unchanged when var is unset.

---

### 2026-02 — (Data/Ops) Turbulence gates from Stooq instead of FRED (PR26)
**Choice:** Switched `update-turbulence-gates.ts` from FRED (SP500 + VIXCLS) to Stooq CSV for SPX and VIX EOD closes. Eliminates 0–1 day FRED lag so gates align with ShockZ timing. No API key required. Env: `TURBULENCE_GATES_START`, `TURBULENCE_STOOQ_SPX_SYMBOL` (default ^spx), `TURBULENCE_STOOQ_VIX_SYMBOL` (default vi.c = S&P 500 VIX Cash). Output schema unchanged.

**Why:** FRED can lag ShockZ by 0–1 days, causing "Gates pending" mismatches. Stooq EOD aligns with same-day close timing.

---

### 2026-02 — (Data/Ops) VIX symbol fallback + CI env pinning
**Choice:** Stooq returns "no data" for ^vix. Switched default VIX symbol to `vi.c` (S&P 500 VIX Cash, spot index). Added fallback: try `TURBULENCE_STOOQ_VIX_SYMBOL` first if set, else try [vi.c, ^vix, ^VIX, vi.f] in order. Log which symbol succeeded. CI workflows explicitly set `TURBULENCE_STOOQ_VIX_SYMBOL: "vi.c"` so artifacts are stable.

**Why:** ^vix fails in CI; vi.c is Stooq's spot VIX and returns data. Env pinning prevents future regressions if defaults change.

---