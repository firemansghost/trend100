# Trend100 Momentum Dashboard — Project Brain

## One-liner
A public, high-signal market leadership dashboard that classifies 100 curated, high-liquidity tickers into **Bull / Caution / Bear** using a dual-timeframe trend filter, and summarizes market regime via a **Market Health Score**.

## Core philosophy
**Price action is the only truth.** Track what the market’s “generals” are doing. The narratives can file a complaint with HR.

## V1 MVP scope
**V1 = ship the command center, not Bloomberg.** “Nice-to-haves” automatically go to V2 unless Bobby explicitly approves them.

- 100-tile heatmap (desktop grid + mobile stacked)
- Market Health Score (% green) + regime label (Risk-On / Transition / Risk-Off)
- Search + tag filters
- Tile click opens “Visser View” modal:
  - price chart + 200d SMA + 50w SMA + 50w EMA
  - distance-to-200d (%)
  - distance-to-band (% optional)
- Trend engine is correct + unit-tested
- Snapshot-first data layer (mock first; easy swap later)
- SEO/OG metadata for clean sharing
- Portable module architecture for future embedding into Ghost Allocator/GhostRegime

## Trend rules (locked unless changed via DECISIONS.md)
- Use **adjusted close** once real data is wired.
- Daily anchor: **200-day SMA** (daily close)
- Weekly support band: **50-week SMA** and **50-week EMA** (weekly close derived from daily bars; Friday close)
- Define band:
  - `upper = max(50w SMA, 50w EMA)`
  - `lower = min(50w SMA, 50w EMA)`
- Classify:
  - **Green (Bullish):** price > 200d SMA **AND** price > `upper`
  - **Yellow (Caution):** price > 200d SMA **AND** price <= `upper`
  - **Red (Bearish):** price < 200d SMA

## Stakeholders
- **Bobby** (owner/operator)
- Public readers (TWIMM audience)
- Future internal users (if embedded into Ghost Allocator/GhostRegime)

## Operating preferences (merged “SKILLS”)
### Tone
Direct, command-center vibe. Explainable to non-technical readers. Minimal fluff.

### Code style
- TypeScript, Next.js App Router, Tailwind
- Keep the module boundary strict: `engine/`, `data/`, `ui/`, `types`
- Engine functions must be pure (no React, no DOM, no network)
- Prefer small, testable units over cleverness
- Avoid re-implementing trend logic in UI (engine is source of truth)

### Defaults when unsure
- Snapshot-first always
- V1 dumb-but-solid > V1 fancy-but-fragile
- Log decisions immediately in DECISIONS.md
- Ask Bobby before locking irreversible defaults (data provider, chart library, ticker universe rules, hosting quirks)

## Start session prompt
Read these files first: docs/PROJECT.md, docs/STATUS.md, docs/DECISIONS.md, docs/TASK_LOG.md, docs/HANDOFF.md, docs/CHECKS.md

Before acting:
1) Summarize current state (5 bullets max).
2) Confirm the priority for this session (from HANDOFF.md).
3) Propose a plan (max 3 steps).
4) Wait for Bobby’s approval before proceeding.

Risk posture: **moderate** (engine correctness > UI polish)  
Hard rule: **Do not expand scope beyond the approved 3-step plan.**

## End session prompt
Session ending. Complete these steps:

**COMPACTION**
- Summarize in 3–5 sentences: what was done, what changed, what’s unresolved.

**UPDATE FILES**
- Update STATUS.md (state + blockers + next actions)
- Add entry to TASK_LOG.md
- Add any decisions to DECISIONS.md
- Update HANDOFF.md for next session

**HANDOFF SUMMARY**
- Write a briefing that a fresh instance could use immediately.

Last updated: 2026-01-19
