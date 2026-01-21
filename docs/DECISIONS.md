# DECISIONS — Trend100

## Decision Types
Use one of: **Architecture / Product / Data / UI / Naming / Ops**

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
