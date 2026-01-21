# HANDOFF — Trend100

## Last Session Summary
Initialized project memory files. Locked standalone repo decision. V1 scope and trend rules are clearly defined.

## State of Work
No repo scaffold yet. Next work is repo scaffold + module structure + mock snapshot feeding the UI.

## Priority for Next Session
1) Scaffold Next.js App Router + Tailwind in a new Trend100 repo
2) Create module structure: `src/modules/trend100/{engine,data,ui}` + `types`
3) Add curated tickers + tags (v0 list) + mock snapshot loader + render heatmap UI

## Open Questions
- Chart library choice: TradingView Lightweight Charts vs Recharts (for modal chart)
- Test runner choice (vitest vs jest)
- Tag taxonomy + curated 100 ticker list source-of-truth file + update workflow
- Regime label thresholds (what % green = Risk-On/Transition/Risk-Off)

Last updated: 2026-01-19
