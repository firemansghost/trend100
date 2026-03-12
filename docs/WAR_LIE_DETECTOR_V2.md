# War Lie Detector v2 — Conceptual Model Spec

**Status:** Draft for PR24. Documentation-first. No engine rewrite in this PR.

---

## Purpose

War Lie Detector is a special Trend100 deck designed to answer one practical question in plain English:

**Is war-related energy stress real, broadening, or fading?**

This deck is not trying to predict geopolitics. It is trying to read whether market plumbing is showing evidence of a real-world energy disruption, and whether that stress is spreading beyond a narrow oil move.

---

## Why v2

The current War Lie Detector became much more readable and useful as a briefing tool, but its underlying logic still leans too heavily on a simple market-confirmation model.

That was acceptable when the main goal was to distinguish narrative panic from broad market confirmation.

It is less fit for purpose in an actual wartime chokepoint / shipping / insurance / physical-flow disruption environment, where:

- physical stress can emerge before cross-asset confirms fully broaden
- oil dislocation can matter more than a generic "risk-off" move
- substitution effects in nat gas / LNG / coal can matter more than before
- gold can confirm macro fear, but is not a clean physical-shipping signal

In short:

**The old model was good at broad confirmation.**  
**The new model needs to be better at physical plumbing stress first, broad confirmation second.**

---

## Core product shift

War Lie Detector v2 moves from a mostly flat "confirm stack" mental model to a **3-bucket framework**:

1. **Physical Plumbing**
2. **Substitution**
3. **Macro Confirmation**

This is a conceptual redesign first. Threshold tuning, engine changes, and new data proxies come later.

---

## Design principles

1. **Physical stress comes first** — The deck should first answer whether the energy plumbing itself is under stress.

2. **Breadth matters** — A narrow oil-only move should not automatically be treated as full-system stress.

3. **Macro confirms are supportive, not dominant** — Gold and similar macro signals can help confirm the tape is acknowledging stress, but should not define the headline by themselves.

4. **Explainability remains mandatory** — This deck is a public-facing briefing tool, not a black box. Users should be able to understand why the regime is what it is.

5. **Snapshot-first architecture remains unchanged** — This PR does not change artifact freshness rules, snapshot behavior, provider routing, or workflow cadence.

---

## 3-bucket framework

### Priority order

1. **Physical Plumbing**
2. **Substitution**
3. **Macro Confirmation**

This is the central change in v2. The headline should no longer behave like a mostly flat confirm count. Instead:

- physical plumbing is the first-class anchor
- substitution determines whether stress is spreading
- macro confirmation helps validate whether the broader tape is acknowledging the stress

---

### Bucket 1 — Physical Plumbing

**Primary purpose:** Detect localized or broad stress in physical oil plumbing.

**Current inputs:**
- Brent vs WTI dislocation / oil stress proxy (BNO/USO ratio)

**Interpretation:**
- This is the anchor signal.
- It is the best existing proxy for whether physical oil stress is showing up in the market.
- It should matter more than generic cross-asset fear signals.

---

### Bucket 2 — Substitution

**Primary purpose:** Detect whether stress is spreading beyond oil into the wider energy complex.

**Current inputs:**
- Nat gas stress (UNG)
- Coal stress (COAL)

**Interpretation:**
- Nat gas and coal represent spread / substitution pressure.
- Coal should no longer be treated as a mere footnote.
- Coal still should not drive the entire headline by itself, but it is a valid part of wider energy stress.

---

### Bucket 3 — Macro Confirmation

**Primary purpose:** Detect whether the broader macro tape is acknowledging the stress.

**Current inputs:**
- Gold confirm (GLD/SPY and GLD/TIP ROC > 0)

**Interpretation:**
- Gold is useful as a macro stress confirm.
- Gold is not a clean shipping, logistics, or physical-barrel signal.
- Gold should be demoted from near-headline driver to supportive confirmation.

---

## Headline outputs

War Lie Detector continues to produce three top-level outputs:

1. **Regime**
2. **Trajectory**
3. **Breadth**

These outputs answer different questions and remain conceptually separate.

---

### Regime

Regime answers: **What is the current overall state of war-related energy stress?**

**Labels:**
- **CONTAINED**
- **WATCH**
- **REAL_RISK**

#### Why rename THEATER → CONTAINED

The old label `THEATER` can sound like the deck is dismissing a real geopolitical event as fake or unserious. That is not the intended meaning.

The intended meaning is:

- disruption may exist
- volatility may be real
- but stress is still limited, localized, or not system-confirmed

`CONTAINED` communicates that much better.

---

### Trajectory

Trajectory answers: **Is the situation worsening, holding, or easing?**

**Labels:**
- **ESCALATING**
- **HOLDING**
- **EASING**

**Interpretation:**
- Trajectory is direction, not breadth.
- A regime can be CONTAINED but ESCALATING.
- A regime can be WATCH but EASING.
- Trajectory must not be overloaded to describe spread.

---

### Breadth

Breadth answers: **How widely is stress spreading across the energy complex?**

**Labels:**
- **NARROW**
- **BROADENING**
- **FULL_STRESS**

**Interpretation:**
- Breadth is spread, not direction.
- `EASING` must never be used as a breadth label.
- Narrow physical stress can still be important, but it is not the same thing as broad multi-input confirmation.

---

## Regime mental model

### CONTAINED

Use when:

- physical plumbing stress is low, localized, or fading
- substitution signals are weak or isolated
- macro confirms are quiet or absent

**Plain English:** Disruption may exist, but the market is not yet showing broad war-energy stress.

---

### WATCH

Use when:

- physical plumbing stress is active or re-accelerating
- and/or at least one substitution signal is turning on
- broad confirmation is incomplete but cannot be dismissed

**Plain English:** Stress is no longer comfortably localized; conditions deserve active monitoring.

---

### REAL_RISK

Use when:

- physical plumbing stress is strong
- and substitution signals show spread through the wider energy complex
- and/or macro confirmation is supporting the move

**Plain English:** This is no longer just a narrow oil dislocation; broader war-energy stress is showing up across the system.

---

## What stays the same

The following remain valid and are preserved:

- snapshot-first artifact model
- artifact freshness / lag transparency
- the current "briefing tool" orientation
- separate handling of Regime / Trajectory / Breadth
- Brent vs WTI dislocation as a core anchor input
- explainable text sections such as current read, what to watch, and explain

---

## What changes conceptually (future PRs)

The following should change in later PRs:

- gold should no longer function as a near-headline primary confirm
- nat gas and coal should be grouped more explicitly as substitution stress
- the headline regime should derive from bucket state, not a flat "Confirms X/3" framing
- public-facing language should stop implying that lack of broad confirmation means lack of real-world disruption

---

## Non-goals for PR24

PR24 does **not** do any of the following:

- no workflow changes
- no provider changes
- no threshold tuning
- no new daily data series
- no new shipping / insurance proxy yet
- no engine rewrite beyond tiny naming scaffolding if required
- no major UI rebuild
- does not affect other decks on the trend100 site

This PR is for **locking the mental model before touching the math.**

---

## Known limitations (after PR24)

Even after this spec is accepted, War Lie Detector will still have important limitations until later PRs:

- no first-class shipping or tanker proxy yet
- no direct war-risk insurance input yet
- no additional crude term-structure / physical tightness proxy yet
- EOD alignment can still understate intraday or overnight wartime shocks

These are expected follow-on items, not failures of PR24.

---

## Bottom line

War Lie Detector v2 should be interpreted like this:

**First ask whether physical energy plumbing is under stress.**  
**Then ask whether that stress is spreading through the wider energy complex.**  
**Then ask whether the macro tape is confirming it.**

That is the conceptual shift.

The goal is not to make the deck more complicated.

The goal is to make it more faithful to how real wartime energy stress actually appears.
