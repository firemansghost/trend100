# HANDOFF — Trend100

## Last Session Summary
Fixed deck switching bug by implementing client-side deck resolution via ClientDeckPage component. Deck selection now works reliably - URL param changes immediately update UI. History loads client-side from public JSON files with mock fallback. Debug panel available when ?debug=1 for testing. All 6 decks functional with independent universes, snapshots, and history. Multi-deck architecture complete and working.

## State of Work
Multi-deck command center architecture complete and working. Client-side deck resolution ensures reliable URL param reactivity. All 6 decks defined with their universes. Per-deck health history persistence working (files updated daily via GitHub Actions). Deck selector integrated with URL navigation. History loads client-side from public JSON files. Dashboard UI fully functional for all decks. Mock data layer supports deck-specific variation. Ready for real data provider integration per deck.

## Priority for Next Session
1) UX polish for deck selector (add descriptions/tooltips, improve visual hierarchy)
2) Add chart visualization to TrendModal (Visser View) - placeholder exists, needs real chart
3) Evaluate real data provider options and integration plan (per-deck providerTicker mapping)

## Open Questions
- Crypto proxy tickers: Use IBIT/ETHA ETFs for Bitcoin/Ethereum, or keep as symbols with providerTicker mapping?
- Naming: Keep "Trend100" brand or shift to "Trend Command Center" to reflect multi-deck nature?
- Custom domain now vs later (trend100.com or subdomain?)
- Chart library choice: TradingView Lightweight Charts vs Recharts (for modal chart)
- Test runner choice (vitest vs jest)
- Regime label thresholds (what % green = Risk-On/Transition/Risk-Off)

Last updated: 2026-01-21
