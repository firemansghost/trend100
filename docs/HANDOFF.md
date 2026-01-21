# HANDOFF — Trend100

## Last Session Summary
Multi-deck architecture completed and deployed. Trend100 now supports 6 curated decks (Leadership 100, US Sectors, US Factors, Global Equities, Fixed Income, Macro) with deck selector dropdown in TopBar. URL search param `?deck=<DECK_ID>` enables shareable deck links (Leadership default hides param). Per-deck health history persistence working (`public/health-history.<DECK_ID>.json`). GitHub Actions workflow updated to 12:15 UTC and commits all per-deck files. Fixed Vercel build error (removed useSearchParams). All decks functional with independent universes, snapshots, and history.

## State of Work
Multi-deck command center architecture complete. All 6 decks defined with their universes. Per-deck health history persistence working. Deck selector integrated with URL navigation. Dashboard UI fully functional for all decks. Mock data layer supports deck-specific variation. Ready for real data provider integration per deck.

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
