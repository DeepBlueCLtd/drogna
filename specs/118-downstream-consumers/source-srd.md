# Drogna — Downstream Consumer Tabs

## Software Requirements Document

**Status:** Draft for development
**Scope:** Three new tabs in the Drogna single-page application
**Audience:** Implementing developer

---

## 1. Purpose and framing

Drogna currently presents the simulated environmental data platform itself: roughly twenty components and subsystems concerned with capturing and forecasting environmental data, surfaced across six tabs (background infographics, map, messages, monitoring, and others), with a simulated front-end/back-end separation and visible wire traffic.

The three tabs specified here are **not part of that system**. They are illustrations of *downstream consumers* — separate notional systems that take Drogna's environmental forecast data and use it to support a decision. Their purpose is to answer the "so what" question: to make visible why fresh, well-sampled environmental data changes what an operator would actually do.

This distinction is load-bearing. It must be obvious to anyone looking at the screen, and it must survive a screenshot being lifted out of context.

### 1.1 Fidelity expectations

Drogna is a toy. Where a real downstream consumer would need data Drogna does not model, the tab may assume that data exists and synthesise it. This is explicitly permitted and should be used freely — a densely populated illustration is more convincing than a sparse, technically-honest one.

Two consequences follow:

- Modelling should be *plausible*, not *correct*. The demonstration value is in the shape of the interaction, not the numerical result.
- Where a shortcut is taken, the UI should label it honestly rather than imply more rigour than exists. See §2.5.

### 1.2 What is deliberately absent

Drogna does not currently model current direction and speed. Any consumer requiring drift — search and rescue planning, spill trajectory, man-overboard — is therefore out of scope. Adding a 2D current field would unlock this class of consumer and is a reasonable future piece of work, but is **not** part of this specification and should not be assumed by the implementation.

---

## 2. Shared conventions

These apply to all three tabs. They are stated once here and are not repeated in the per-tab sections. Sections 3, 4 and 5 are written in sequence and each is expected to reuse the visual and interaction decisions established by its predecessors; the tabs must feel like one family.

### 2.1 Visual separation from Drogna proper

The existing application uses a dark theme with black tabs. The three consumer tabs must be **bright yellow with black text**, so the boundary is legible at a glance and without explanation.

### 2.2 Provenance strip

Each consumer tab carries a persistent strip along the top of the content area reading:

> **Downstream consumer — not part of Drogna**

The strip is always visible, is not dismissible, and does not scroll out of view. It exists so that a screenshot taken from any of these tabs still carries the caveat.

### 2.3 Data freshness: stale-then-refresh

This is the mechanism that proves the tabs are genuinely consuming Drogna's forecast rather than faking it, and it is the most important shared behaviour in this document.

- When a new forecast becomes available in Drogna, the consumer tab **does not** recalculate.
- A halo or badge appears on the tab, and within the tab, reading **"New forecast available — update"**.
- Nothing changes until the user clicks it.
- On click, the tab recalculates against the new forecast.
- The **previous result remains visible as a ghost** — reduced opacity, dashed outline, or equivalent — so the delta is legible.

The ghost is the point. If the recommendation barely moves, the new forecast was not decision-relevant. If it swings hard, the value of fresh environmental data has just been demonstrated without anyone having to argue for it.

The ghost should persist until the next update, or until dismissed by the user.

### 2.4 Local controls recompute immediately

The click-to-update ceremony in §2.3 applies **only** to newly arrived forecast data. Every other control in these tabs — sliders, dropdowns, toggles, resolution changes, confidence settings — recomputes instantly. Local knob-twiddling must feel immediate; only genuinely new upstream data waits for an explicit click.

### 2.5 Honest labelling of derived quantities

Where a displayed quantity is a proxy rather than the thing it resembles, the label says so. Specifically, the uncertainty field in §3 is labelled **"observation-driven uncertainty"** and never "forecast uncertainty" or "ensemble spread". This is not pedantry; it is what keeps the demonstration defensible under questioning.

### 2.6 Underlying data

The authoritative environmental grid is **96 × 96 horizontal cells across 8 depth zones**. This remains authoritative and is not modified by any consumer tab.

Consumer tabs resample it to whatever resolution suits their own decision (§3.1). This is itself a point worth making: consumers are not locked to the storage grid.

**Platform depth limit:** the vessel operates only within the **top three depth zones**. The remaining five are forecast but physically unreachable by the platform itself. This asymmetry drives the expendable sensor requirement in §3.5.

---

## 3. Tab 1 — Adaptive Sampling

### 3.1 Presentation

A map presentation of the domain, overlaid with a **hexagonal grid at user-adjustable resolution**. Resolution is a control local to this tab (per §2.4, it recomputes instantly) and does not affect other tabs or the underlying grid.

Hex cells are coloured by observation-driven uncertainty (§3.2). At 96 × 96, resampling to hexes is a genuine coarsening step and should be treated as such — a hex aggregates the underlying cells it covers.

Vessel current position is shown and is an input to planning.

### 3.2 Uncertainty model

Uncertainty is a **proxy derived from observation coverage**, not a physics ensemble. It is a function of:

- **Recency** — how long since this cell was last observed
- **Density** — how many observations this cell has received
- **Age decay** — uncertainty grows monotonically with time since last observation

An ensemble of 8–16 members over 3,200 cells would have been tractable in-browser; over 73,728 cells it is less comfortable, and in any case the operational question ("where should I go to learn the most?") is adequately served by the coverage proxy. If a later revision wants true ensemble spread, the interface here should not need to change — only the source of the scalar field.

Label in UI: **"observation-driven uncertainty"**.

### 3.3 Depth handling

Uncertainty is three-dimensional. A surface pass tells you little about the thermocline, and the display must not imply otherwise.

- All 8 depth zones carry an uncertainty value.
- The vessel can only reduce uncertainty in the **top 3 zones** by transiting.
- Zones 4–8 can only be addressed by expendable sensors (§3.5).

The display should let the user see uncertainty by depth zone — a selector, a small-multiple, or a stacked indicator per hex. The implementation may choose; the requirement is that the vessel-reachable and vessel-unreachable portions of the problem are distinguishable.

### 3.4 Planning inputs

| Control | Values |
|---|---|
| Time budget | 3 h, 6 h, 12 h, 24 h |
| Expendable rate | 1 per hour, 1 per 6 h, 1 per 12 h, 1 per 24 h |

The expendable rate is a **rate, not a stock**, and therefore couples directly to the time budget. Twelve hours at one per six hours yields two drops. This coupling is deliberate and should be surfaced — show the resulting drop count.

### 3.5 Planning behaviour

**Objective:** maximise uncertainty reduction within the time budget.

**Optimisation is value-per-mile, not greedy.** The planner must not simply head for the single worst cell. It should balance uncertainty reduction against transit cost, with the result that it will sometimes ignore the worst cell in favour of a cluster of merely-bad ones. This is more interesting to demonstrate and is the behaviour that makes the time budget dropdown meaningful — the plan should visibly change *shape*, not just length, between 3 h and 24 h.

**The route does not return to its starting point.** It ends wherever the budget expires. This keeps the problem simpler and lets the route sprawl usefully.

**Expendable drops:**

- Placed to address uncertainty in depth zones the vessel cannot reach (zones 4–8).
- **Constrained to lie on the route** — a sensor cannot be dropped somewhere the vessel does not go.
- Rendered as distinct markers on the route.
- Each drop should be justifiable: on hover or selection, show which depth zone and how much uncertainty it addresses.

The constraint that drops must lie on the route creates a genuine tension worth demonstrating: the route now has to bend to service deep hotspots, not merely shallow ones. **Depth changes the route shape.** This should be visible.

### 3.6 Interaction sequence

1. User sets time budget and expendable rate.
2. User clicks a plan/optimise action.
3. Route renders, with drop markers.
4. New forecast arrives → halo appears, nothing changes.
5. User clicks update → new route renders, previous route ghosted.

---

## 4. Tab 2 — Comparative Courses of Action

Inherits all conventions from §2 and the hex grid presentation and resolution control from §3.1.

### 4.1 Scope boundary

This tab depicts reasoning about **hypothetical vessel classes present in a region**. It holds no tracks, no contacts, no detections. Nothing here represents a known entity at a known place.

This is the correct side of the governing rule, and the yellow tab plus provenance strip (§2.1, §2.2) exist substantially to make that legible.

### 4.2 Other-participant roster

The user configures which classes may be present, and how likely each is:

| Class | Presence likelihood |
|---|---|
| Evasive submarine | 1–10 |
| Indifferent fishing vessel / trawler | 1–10 |
| Ferry on timetable | 1–10 |

Classes may be included or excluded entirely. The likelihood value feeds **Monte Carlo seeding density** — a submarine at 2 and a trawler at 9 produces a materially different distribution, and therefore a materially different recommended route, from the reverse. That contrast is a good thing to show live.

Seeding is distributed across the domain; the tab does not assume knowledge of where any participant actually is.

### 4.3 Behaviour drives motion, not merely scoring

**This is a requirement, not an implementation detail.**

If behaviour type only affected scoring, all three classes would produce identical distributions and the roster would be cosmetic. Behaviour must govern how the hypothetical participants *move*:

- **Ferry on timetable** — follows a fixed corridor, on a schedule. Highly predictable in space and time.
- **Indifferent fishing vessel** — loiters over shallow banks. Spatially clustered, temporally unpredictable, not responsive to own-vessel presence.
- **Evasive submarine** — actively seeks poor detectability, using the environmental forecast field already rendered in Drogna. Responsive and adversarial.

The resulting Monte Carlo clouds should be visibly different in character from one another.

### 4.4 Objective selection

A dropdown selects the operator's intent:

- Evasion
- Investigation
- Monitoring
- Stealthy reconnaissance

### 4.5 Candidate courses of action

The tab produces **three or four candidate routes**, not a single recommendation. A black-box single answer is both less useful and less defensible; showing candidates with scores invites the operator to disagree with the weighting rather than the whole idea.

Each candidate carries:

- **Component scores** — at minimum, detection risk and objective achievement, scored separately
- **A headline score** — the weighted combination

### 4.6 Adjustable weighting

The weighting between components is user-adjustable via sliders, recomputing instantly per §2.4.

The ranking of candidates should be able to **flip** as the weighting shifts. This is the moment worth engineering for: it makes the trade-off tangible and shows the tool is reasoning rather than reciting.

---

## 5. Tab 3 — Temporal Feasibility

Inherits all conventions from §2. **This tab has no map.** It is deliberately non-spatial, and exists to show that environmental data supports decisions that are not about *where*.

### 5.1 Presentation

A Gantt-style timeline. Time runs horizontally. Rows are grouped into two bands:

- **Source lanes** (lower band) — the raw inputs
- **Derived feasibility lane** (upper band) — computed from the sources

### 5.2 Source lanes

Sources combine environmental forecast, downloaded vector forecast data, and reference/schedule data:

| Source | Lane type |
|---|---|
| Tidal state / tidal windows | Continuous |
| Daylight and twilight | Boolean |
| Moon phase / illumination | Continuous |
| Sea state | Continuous |
| Ferry timetable | Boolean |
| Satellite overpasses | Boolean |
| Fuel / endurance remaining | Continuous |
| Crew rest and watch cycles | Boolean |
| Range from port or rendezvous | Continuous |
| Downloaded vector forecast data | Continuous |

### 5.3 Mixed lane types

A plain bar implies a boolean yes/no, which is wrong for several of the above. Two lane types are required:

- **Boolean lanes** — rendered as bars. Present or absent.
- **Continuous lanes** — rendered as a line trace, or lines overlaid on a bar where multiple perspectives share a lane, with a **threshold line drawn across**.

Thresholds are **draggable** and **per-task**: a task becomes feasible where the continuous variable crosses its threshold. This is what allows the operator to see *marginal* windows rather than simply being told no, and it is why the feasibility calculation is more involved than boolean intersection.

### 5.4 Source confidence

Each source lane carries a confidence setting: **High / Medium / Low / Off**.

- Confidence is a **second visual dimension** on the lane — opacity, hatching, or equivalent — distinct from the value the lane carries.
- High, Medium and Low all contribute to feasibility, weighted down accordingly. A low-confidence source should not be able to veto a task on its own.
- **Off** excludes the source entirely. This exists so that "what if this source is rubbish?" can be answered live, on stage, in one click.
- Confidence changes recompute **instantly** (§2.4).

### 5.5 Tasks and feasibility

The user defines a set of competing tasks that must be performed. Each task carries its own thresholds against the relevant continuous sources (§5.3).

It will frequently not be possible to achieve all tasks. The tab's output is therefore:

**The top two or three maximal feasible sets.**

Not one answer. Showing several is what reveals the trade — *you can do A and B, or B and C, but never A and C.* One set alone hides exactly the information the operator needs.

### 5.6 Framing

This is a **triage aid, not an optimiser**. The honest output is "here is what you are giving up." That framing is deliberate and is more defensible than claiming to solve the scheduling problem.

The heavy constraint set in §5.2 will squeeze feasibility hard. That is the intent — the value is in informing which of multiple commitments can be met, not in producing a comfortable answer.

### 5.7 Task locking

The user may **lock a task as mandatory**. The feasible sets recompute around it, and tasks that no longer survive are shown as excluded.

Locking the ferry crossing as immovable and watching two other tasks go red is the interaction that makes this feel like a real tool rather than a chart.

---

## 6. Open questions

These were not settled in specification and are left to implementation judgement, or to a later pass:

1. **Confidence weighting curve (§5.4)** — the relative numerical weight of High vs Medium vs Low is undefined. A simple 1.0 / 0.66 / 0.33 multiplier is a reasonable starting point.
2. **Depth-zone display idiom (§3.3)** — selector, small-multiple, or per-hex stacked indicator. Not prescribed.
3. **Task definition UI (§5.5)** — whether tasks are a fixed demo list or user-composable was not resolved. A fixed list with editable thresholds is the cheaper starting point.
4. **Ghost persistence (§2.3)** — whether the ghost clears on next update automatically or requires dismissal.
5. **Hex resolution range (§3.1)** — the sensible upper and lower bounds relative to the 96 × 96 grid.

---

## 7. Summary of cross-cutting requirements

For quick reference during implementation, every one of the three tabs must have:

- Bright yellow tab, black text
- Persistent "Downstream consumer — not part of Drogna" strip
- Stale-then-refresh: halo on new forecast, no auto-recalculation
- Ghost rendering of the previous result after update
- Instant recomputation on all local controls
