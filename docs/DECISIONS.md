# DECISIONS — Trend100

## Decision Types
Use one of: **Architecture / Product / Data / UI / Naming / Ops**

---

### 2026-08 — (Data/Ops) Marketstack EOD internal-gap audit and bounded repair
**Choice:** Last-date freshness does not prove internal continuity. A provider-free audit compares each deck provider-symbol against **usable SPY session dates** in a window (default **2026-02-18** → latest SPY bar). Invalid ≤0/non-finite closes are not “present.” A **long gap** is ≥**5 consecutive** SPY sessions missing after the symbol’s first cached date (limited-start / inception is reported, not fabricated). Isolated missing SPY dates (including **2026-06-04**) are reported but are **not** auto-repair candidates and are **not** fabricated. SPY is the reference calendar for suspicious continuity; a symbol does **not** need a bar on every SPY date to be healthy.

Manual workflow **Repair EOD Internal Gaps** restores production `marketstack-eod-v2`, fails closed on cache miss, checks SPY freshness, then audits with **zero** Marketstack/Stooq. Accidental `repair=true` on run **32882593515** restored `Linux-marketstack-eod-v2-32882080469` (SPY last **2026-08-24**, ageDays=1), found **160** audited / **2** complete / **158** with missing sessions / **147** long-gap (max run **105**, dominant **2026-02-18 → 2026-07-27**), then fetched all **147** candidates (**147 Marketstack ticker-units**, not zero). Phase 1 rejected **65** (often solely `fetched bars do not cover missing sessions: 2026-06-04`). Phase 2 never ran; **no EOD files written**; Actions EOD LKG save skipped; old LKG remains authoritative. The old validator required every missing SPY session; the repair objective is **longest consecutive missing SPY sessions < 5**.

`repair=true` now requires `confirm_repair=REPAIR` exactly and a positive integer `max_ticker_units` with `candidateCount <= max_ticker_units` **before any Marketstack call**. Audit-only needs neither field. Fetch still uses one bounded `fetchEodSeriesRange` per long-gap candidate. Phase A classifies **resolvable** vs **unresolved** via **simulated post-merge** audit (no writes). Phase B merges **only** resolvable real provider bars through existing cache normalization. Unresolved files are untouched. If ≥1 candidate is safely merged and merged files pass post-validation, the improved EOD LKG is **saved even if some provider-limited symbols remain**. The completeness gate then fails the job when `symbolsWithLongGap > 0` (red run can still have persisted incremental repair). Health-history integrity repair is blocked until a provider-free EOD audit reports **`symbolsWithLongGap = 0`** (a partial EOD repair cache is not enough). No Vercel deploy and no health-history rebuild in the EOD repair workflow. Do **not** use Extend EOD Cache for this.

**Why:** Backfill Health History **32879333727** restored a current SPY tip (`2026-08-24`) and 160 EOD files, but Pass A found only ~20 trading days for US_FACTORS / GLOBAL / FIXED_INCOME / most MACRO subsections / METALS_MINING versus ~126–128 for LEADERSHIP / US_SECTORS / MACRO.energy / PLUMBING. MACRO subsection longest gap after 2026-02-18 was **160d (2026-02-18 → 2026-07-28)** except Energy (~4d). Pass B cleared most stale UNKNOWN policy rows but **27** suspicious Uranium/Crypto/Dollar rows remained, so LKG was correctly not saved. Same internal-hole class as the earlier Turbulence sector caches. Health-history `--fail-on-suspicious` stays strict; retry health-history repair only after EOD audit reports zero long gaps.

---

### 2026-08 — (Ops) Health-history CLI accepts pnpm `--` separator
**Choice:** `parseHealthHistoryCli()` skips a standalone `--` the same way `parseVerifyArtifactsCli()` does. Real flags (`--start`, `--end`, `--deck`, `--variants-only`, `--backfill-days`) stay strict; unknown flags still throw.

**Why:** Backfill Health History run **32877318875** invoked `pnpm update:health-history -- --start …`. The parser treated `--` as unknown, so Pass A/B never ran, LKG was not saved, and no provider quota was used. Repair did not occur.

---

### 2026-08 — (Ops/Data) Health-history last-known-good cache and offline integrity repair
**Choice:** `public/health-history*.json` are generated artifacts and need **cross-run continuity**, like Marketstack EOD and Turbulence gates. Production workflows (`vercel-prebuilt-prod.yml`, `daily-artifacts-deploy.yml`) restore/save an Actions cache key family `${{ runner.os }}-health-history-lkg-v1-`. Restore happens **before** snapshot/history generation (overlaying tracked repo copies). Save happens **only after** successful artifact generation/verification (`if: success()`, never `if: always()`). A failed run must not replace LKG. Cache miss leaves tracked files in place; optional HTTPS prefetch from `https://trend100.vercel.app/` overwrites a file only when the response is a non-empty JSON array.

**Why:** Production previously **did not** persist health-history between runs. Each deploy started from git-tracked histories, **upserted only the current `asOfDate`**, deployed, and discarded the rest. That produced (1) a dense repo-era tail through ~**2026-02-17** then a jump to the latest deploy date, and (2) MACRO section UNKNOWN rows from the first section backfill under **uncapped `minEligible=10`** (fixed 2026-02-15 in `584bac0`) that daily upsert never recomputed. Commit `92557e9` regenerated MACRO sections after that fix, but without an LKG cache the repair was not durable.

**Repair path:** Manual **Backfill Health History** restores the **same** production EOD cache (`marketstack-eod-v2`) and health-history LKG, runs **offline** (`MARKETSTACK_OFFLINE=1`, no API keys, no Stooq). It **fails closed** if no EOD Actions cache key matches (never uses stale repo EOD) and if restored **SPY** last date is more than **10 UTC calendar days** old. Input `repair_health_history_integrity` runs Pass A (`2026-02-18`→UTC today, all decks) then Pass B (`2019-10-01`→today, `--deck MACRO --variants-only`). After Pass B, `--fail-on-suspicious` exits non-zero if any MACRO variant row is UNKNOWN while already meeting current eligible/knownPct rules; LKG is saved only on `success()`. Verification is `pnpm verify:artifacts -- --health-history-only` (health-history files only). Production `pnpm verify:artifacts` remains the full suite. The backfill job **does not deploy**. The next normal Prebuilt/Daily run restores the repaired LKG, refreshes current EOD, verifies, deploys, and saves the next LKG.

---

### 2026-08 — (Data) Enforce Turbulence shockRaw minimum 8 eligible assets
**Choice:** `MIN_ASSETS_TARGET` (8) now gates **both** shock calendar participation (SPY usable close + ≥8 recent-universe usable closes) **and** shockRaw (eligible 20/60 correlation universe `validSymbols.length >= 8`). 5/6/7 eligible names yield `shockRaw=null`. There is **no** floor-6 fallback and **no** `minAssetsEffective` dynamic threshold. `MIN_ASSETS_FLOOR` (6) remains only for deck/cache availability sanity. Requiring all 12 names was rejected as unnecessarily brittle.

**Why:** After PR #84, production shock (workflow **32868888109**) had **1493/1493** published rows at `nAssets=12` (2020-09-02 → 2026-08-24). A report-only replay of floor-6 vs target-8 on that series (recomputing shockZ on the target-8 raw history) showed **0** rows with nAssets 6–11, **0** shockRaw removals, **0** shockZ date changes, max |Δz| **0**, and identical Green Bars (86 all-time / 20 last 365d, latest **2026-02-04**). Pre-repair 6/7-asset periods were data/calendar corruption, not a clean-history pattern. If `recentUniverse` falls below 8, Turbulence should be unavailable rather than silently accepting 6 names.

---

### 2026-08 — (Data) Reject non-positive Marketstack EOD closes
**Choice:** A usable EOD price is **finite and > 0**. Prefer a positive finite `adjusted_close`; if that is missing or invalid, fall back to a positive finite raw `close`. If neither is usable, omit the bar. `fetchEodSeries` drops unusable bars; `fetchEodLatestBatch` treats an unusable latest row as unavailable (`null`). Cache load ignores non-positive/non-finite `close` values (concise `[cache] SYMBOL: ignored N invalid EOD bar(s): dates`) and **immediately rewrites** the sanitized file (retention rules, no provider call) so Actions `cache/save` archives the clean JSON even when latest EOD is unchanged. Cache save never persists invalid rows. Shock calendar participation and `logReturnsOnQualifiedDates` independently require the same positive-finite closes, and `Math.log` must be finite (no ±Infinity in returns). Correlation/eligibility counts use `Number.isFinite`. Windows 20/60/252, Green Bar, gates, and verify staleness were unchanged in that PR; shockRaw min-assets later moved from floor-6 to hard 8 (see decision above).

**Why:** PR #83 diagnostics on Vercel Prebuilt Prod run **32865444485** showed all 12 names had 61/61 final qualified dates and 0 incomplete dates in that window, but ten sector ETFs had **cached close = 0** on **2026-06-04** (SPY and XLB did not). Returns on 2026-06-05 used previous close 0, so those ten had long=59/60, only 2 names stayed eligible, and shock trimmed 52 trailing nulls (last computed 2026-06-04, nAssets=10, shockRaw=0 — not a trustworthy reading; log(0/prev) is −Infinity). The adapter previously accepted zero adjusted/raw closes. Next normal cache save purges invalid rows; do **not** re-run the 2023→current 12-symbol repair. Restoring a real June-4 print, if desired, is a separate bounded refetch.

---

### 2026-08 — (Data) Turbulence shock qualified trading calendar
**Choice:** Shock sessions are no longer the raw union of US_SECTORS cache dates. A date is a shock calendar day only if **SPY has a close** and **at least `MIN_ASSETS_TARGET` (8)** recent-universe symbols have closes. Returns are log ratios vs the **previous qualified date**, so discarded sparse/provider-only dates are not return-adjacent. A later PR now also requires ≥8 **eligible** names for shockRaw (see “Enforce Turbulence shockRaw minimum 8 eligible assets”). The calendar PR itself did not yet change shockRaw acceptance.

**Why:** Manual repair on Daily Artifacts Deploy run **32860124487** (2026-08-25) fetched 12/12 sector histories (2023-01-01 → 2026-08-25, 12 ticker-units). 910 dates present on all 12; latest all-12 date 2026-08-24; latest 60 SPY dates had **0** missing cells; ~107–109 dates added per sector cache. `update:turbulence-shock` still trimmed 53 trailing null rows and last computed **2026-06-04** (verify failed, 82 days stale). Root cause: union calendar + return vs previous global date. One odd ETF-only print nulls other names for ~60 sessions. Calendar semantics, not missing cache, after that repair. Do not re-run the 12-symbol repair on the next deploy.

---
**Choice:** `ensureHistoryBatch()` no longer sends caches that are more than **3 trading days** behind through `fetchEodLatestBatch()`. Those symbols use historical `fetchEodSeries` from slightly before `lastCachedDate` through UTC today, merged into the existing file (retention unchanged; never delete a cache because a gap exists). Recent caches keep batched latest-only updates. Pagination walks backward when a page hits the 1000-bar provider limit; truncation is not claimed as a full repair. A manual-only command `pnpm repair:turbulence-shock-cache` merges real Marketstack EOD for the **US_SECTORS / shock 12** from **2023-01-01** (override `TURBULENCE_SHOCK_CACHE_REPAIR_START`) through today. **Fetch/validate is transactional:** all 12 provider responses must succeed in memory before any `data/marketstack/eod` write; a failed symbol leaves caches untouched so Actions `cache-save` cannot persist a mixed universe. Daily Artifacts Deploy `workflow_dispatch` input `repair_turbulence_shock_cache` (default false) runs that command after EOD cache restore and before `artifacts:refresh`. **Scheduled cron never runs it.** Shock windows, min-asset floor/target, union calendar, Frobenius, shockZ, Green Bar, and gates are **unchanged** until a post-repair audit.

**Why:** After prolonged downtime, latest-only batch updates produced caches with a fresh `last_date` and a multi-month internal hole (old history + latest bar). That hole collapsed Turbulence shock `nAssets` to 6 despite a 12-name universe. Future refreshes must gap-fill stale last_dates; the existing Actions cache already looks “fresh” at the tip, so a bounded manual 12-symbol repair is required once. Do not refetch all 160 Trend100 names for this.

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

### 2026-04 — (Data/Ops) Stooq auth/captcha block + last-known-good gates fallback
**Choice:** Stooq sometimes returns a plain-text/HTML "get API key" or captcha page with HTTP 200 instead of CSV. `update-turbulence-gates.ts` detects likely auth/block bodies (`get_apikey`, "get your api", `captcha`, leading `<html`) and treats them as fetch failure (`STOOQ_AUTH_BLOCKED`). If `public/turbulence.gates.json` already exists, has enough points (≥200), passes light shape checks, and last date is within `TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS` (default 60), the script logs explicit warnings that gates were **not** refreshed and exits 0 without overwriting the file. `verify-artifacts` uses `TURBULENCE_GATES_VERIFY_MAX_STALENESS_DAYS` (default 10); CI workflows set both gate env vars to **120** (was 60) so a fallback run still passes verification during prolonged Stooq blocks.

**Why:** Avoids hard-failing scheduled/CI artifact generation when Stooq rate-limits or gates anonymous CSV; keeps output honest (warnings, no fake "fresh" log line) while allowing a conservative stale continuation. Gates may be materially stale relative to market while Stooq remains blocked; the workflow does not claim a successful Stooq refresh.

---

### 2026-04 — (Data/Ops) CI cache for turbulence gates LKG + post-prefetch diagnostics
**Choice:** `daily-artifacts-deploy.yml` and `vercel-prebuilt-prod.yml` restore `public/turbulence.gates.json` from a GitHub Actions cache (`turbulence-gates-lkg-v1`, rolling key per run with prefix restore) **before** the live-site curl prefetch. Both workflows then run `ci/gha-turbulence-gates-prep.sh`: if the file is still missing, **copy** the committed bootstrap `ci/bootstrap/turbulence.gates.json` (≥250 weekday rows, same schema as production; not under `public/`). **Safe** prefetch (temp file → non-empty JSON array → copy) may replace `public/` only on success. Logs include `cache_exact_hit`, `gates_file_after_cache_restore`, `seed_bootstrap_applied`, curl/temp/final stats. After `pnpm artifacts:refresh`, if the file still exists, the workflow saves it back to the same cache namespace (skip save if missing).

**Why:** Repo does not commit `public/turbulence.gates.json`; cold CI had no file when cache missed and live curl failed. Bootstrap gives Stooq’s `update-turbulence-gates` a valid on-disk fallback without relying on Vercel. **Ops:** If the bootstrap’s `last_date` ages beyond `TURBULENCE_GATES_VERIFY_MAX_STALENESS_DAYS` (e.g. **120** in CI), refresh `ci/bootstrap/turbulence.gates.json` in-repo (regenerate synthetic series) so verify stays green on long-lived cold starts. Prep logs `final_days_stale`, configured max staleness env values, and `staleness_vs_fallback` (report-only).

---

### 2026-06 — (Data/Ops) CI turbulence gates fallback window 120 days
**Choice:** Raised `TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS` and `TURBULENCE_GATES_VERIFY_MAX_STALENESS_DAYS` from 60 to **120** in both CI workflows (prep and artifacts steps). Stooq continued returning auth/block pages; committed bootstrap `last_date` (~2026-04-10) exceeded the 60-day window by mid-2026, causing `update-turbulence-gates` to reject fallback even though cache/seed/bootstrap prep succeeded.

**Why:** Unblock Daily Artifacts Deploy without changing turbulence model logic or adding a new data provider. Deploys may ship stale gates during extended Stooq outages; `update-turbulence-gates` warnings and prep diagnostics remain the honest signal that refresh did not occur.

---

### 2026-06 — (Data/Ops) Early bootstrap seed staleness check in Tests workflow
**Choice:** Added read-only `scripts/check-turbulence-bootstrap-seed.ts` and Tests job `turbulence-bootstrap-check` (`pnpm check:turbulence-bootstrap`). Uses UTC calendar-day math on `ci/bootstrap/turbulence.gates.json` `last_date` vs `TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS` (default **120**). Warns within **30** days of expiration (exit 0); fails within **14** days (exit 1). Does not fetch Stooq, mutate files, or change daily deploy behavior.

**Why:** Daily deploy only fails once the seed is already too stale on cold cache misses. Non-deploying CI gives advance notice to refresh the committed bootstrap before `update-turbulence-gates` / `verify:artifacts` reject fallback again.

---

### 2026-07 — (Data/Ops) CI shock/greenbar verify staleness 45 days
**Choice:** Added `TURBULENCE_SHOCK_VERIFY_MAX_STALENESS_DAYS` and `TURBULENCE_GREENBAR_VERIFY_MAX_STALENESS_DAYS` to `verify-artifacts.ts` (local default **7** each). CI deploy workflows set both to **45**. Turbulence gates retain **120**-day fallback/verify under Stooq block; shock/greenbar last dates may validly trail snapshots because shock trims trailing null rows after correlation windows (short=20, long=60, z=252 trading days).

**Why:** Daily Artifacts Deploy failed when shock `last_date` was ~33 calendar days behind UTC today while a hardcoded 7-day verify rejected valid model-lagged output. **45** days accommodates expected shock lag plus weekends/holidays; ages beyond that indicate a real pipeline stall.

---

### 2026-07 — (Ops) Turbulence gates bootstrap runbook; defer seed replacement (PR10)
**Choice:** Document bootstrap refresh and contingency in [`docs/CHECKS.md`](CHECKS.md) (runbook section). **Do not** replace `ci/bootstrap/turbulence.gates.json` in PR10. Seed `last_date` remains **2026-04-10**; warning ~2026-07-09, Tests check failure ~2026-07-25, 120-day cold-start risk ~2026-08-08. Approved refresh when Stooq CSV works: `pnpm update:turbulence-gates` only, validate, copy last 280 weekdays to bootstrap, restore `public/` before commit. Contingency after ~2026-07-20 if still blocked: real alternate provider (e.g. FRED bootstrap-only) or staleness extension as last resort with explicit decision entry.

**Why:** 2026-07-07 audit found live production gates byte-identical to bootstrap, local `public/` older, and Stooq still returning HTML/JS challenge pages — no fresher valid source. Synthetic data rejected; copying production/local would not help. Runbook gives operators deadlines and approved paths without changing the seed prematurely.

---

### 2026-08 — (Data/Ops) Turbulence gates from Marketstack GSPC.INDX + VIX.INDX
**Choice:** Replace Stooq as the turbulence gates primary provider. `update-turbulence-gates.ts` now fetches cash S&P 500 (`GSPC.INDX`) and CBOE VIX (`VIX.INDX`) via existing `fetchEodSeries()` / `MARKETSTACK_API_KEY`. History from `TURBULENCE_GATES_START` (default 2019-10-01) is retrieved in 12-month chunks so the 1000-bar provider default does not truncate the series. Gate rows use **intersection dates** only (both closes present) so a newer VIX print cannot advance `last_date` without SPX. **SPX 50-DMA is computed on the full ordered SPX close series**; VIX gaps do not remove SPX sessions from the moving-average window. Semantics: SPX > 50-DMA, VIX < 25. Bootstrap `ci/bootstrap/turbulence.gates.json` is the last 280 real common-date rows from that series. Last-known-good keep-on-failure remains, still bounded by existing staleness env (CI **120**); **no threshold increase**. Failed Marketstack fetches are not logged as successful refreshes. No new secret or provider.

**Why:** Daily Artifacts Deploy generated core decks (LEADERSHIP asOf 2026-08-24) then died in Stooq-only gates (`last_date` 2026-04-10, 137 days stale). PR 11 audit confirmed Marketstack index EOD for both symbols. Stooq remains unused for gates; deck `EOD_STOOQ_DECKS` routing is unchanged in this PR.

---

### 2026-08 — (Ops) One Daily Artifacts Deploy per US session
**Choice:** `daily-artifacts-deploy.yml` schedule is a single cron `15 1 * * 2-6` (01:15 UTC Tuesday–Saturday). Monday–Friday US sessions map to those UTC weekdays because 01:15 is after midnight UTC. The 22:15 UTC Mon–Fri primary run is removed. `workflow_dispatch` remains. Push-to-main Vercel Prebuilt Prod is unchanged. No decks removed. Marketstack quota is **per ticker** (a batch of N symbols counts as N requests); two full weekday runs were doubling ~160 deck symbols plus ~14 gates index calls (~174 units/run).

**Why:** Two scheduled artifact refreshes per weekday consumed unnecessary Marketstack quota (~7,300 calls/month from the schedule alone). The later 01:15 UTC slot was already the top-off intended to catch delayed EOD publication, so it is the single remaining scheduled run.

---

### 2026-04 — (Data/Ops) vercel-prebuilt-prod: Node 24 parity + safe turbulence prefetch
**Choice:** `vercel-prebuilt-prod.yml` matches the daily workflow baseline: `actions/checkout@v6`, `actions/setup-node@v6` with Node **24**, `actions/cache` and `actions/cache/{restore,save}` **v5**, and workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`. Turbulence prep is shared with daily via `ci/gha-turbulence-gates-prep.sh` (see prior decision: cache → bootstrap → safe prefetch). Failed curl or invalid live JSON leaves restored or seeded `public/turbulence.gates.json` unchanged.

**Why:** Direct curl to `public/` could wipe a good cache or committed bootstrap on failure; shared script keeps both workflows aligned.

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

### 2026-01-23 — (Ops) Earliest-available floor metadata (`data/marketstack/meta/earliest.json`)
**Choice:** Added committed `data/marketstack/meta/earliest.json` mapping symbol → earliest-available date. When Marketstack returns 0 bars for an extension request, we record the floor and skip future extension attempts that would request dates before it. Before each extension attempt, we check this file; if the request would go earlier than the known floor, we skip and log `SKIP extend X: known floor Y` (no API call). Writes are atomic (temp file then rename).
**Why:** CI repeatedly attempted extend for symbols like SNOW, FBTC—wasting Marketstack calls. The `.meta/` per-symbol files are in the cache (which may not persist across runs); `.meta/` is gitignored. A committed `earliest.json` lets CI learn over time and avoid repeated attempts.
**Alternatives considered:** Rely only on `.meta/` (not committed, cache-dependent), hardcoded allowlist (not scalable), accepting wasted budget (inefficient).

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
**Why:** Workflow was failing with "cannot lock ref" errors due to concurrent runs or main advancing between job execution. Concurrency prevents overlaps; rebase+retry handles remaining race conditions without force-push.
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
