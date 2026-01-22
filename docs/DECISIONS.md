# DECISIONS — Trend100

## Decision Types
Use one of: **Architecture / Product / Data / UI / Naming / Ops**

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
