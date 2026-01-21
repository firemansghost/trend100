# CHECKS — Trend100

## Verification Steps (V1 MVP)

### Engine correctness
- Unit tests for SMA and EMA on deterministic sequences
- Weekly resample:
  - Derived from daily bars
  - Weekly close uses Friday close (handle market holidays consistently)
- Classification:
  - Green/Yellow/Red matches rules for known scenarios
  - Insufficient history returns **UNKNOWN** (or equivalent) consistently

### UI behavior
- Heatmap renders **exactly 100 tiles** from snapshot
- Search filters by ticker instantly
- Tag filters apply correctly (document AND/OR behavior when implemented)
- Modal:
  - Opens via click
  - Closes via Esc + click-outside
  - Mobile-friendly layout

### Data layer architecture
- UI consumes `getLatestSnapshot()` only (no hidden direct API calls)
- Swapping mock → real provider touches **data layer only**

### Shareability
- Metadata/OG tags show correct title/description on social previews

## Known Failure Modes
- Off-by-one MA windows and “lookahead” bugs
- Weekly resample picking wrong day (Thu vs Fri) around holidays
- NaN propagation / missing-bar edge cases
- UI re-implementing classification logic (engine drift)
- “As-of date” confusion (timezone/date parsing)
