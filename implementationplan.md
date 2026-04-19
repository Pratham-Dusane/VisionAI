Created 8 todos

Implementation approach will be strictly approval-gated: I will do only one step at a time, stop, show you exactly what changed, and wait for your approval before starting the next step. No commits unless you explicitly say commit.

**Proposed Implementation Plan (Ordered By Easiest + Highest Leverage First)**
1. Visual System Baseline (Google-like clarity + strict semantics)
2. Executive Mode Information Architecture
3. Technical Mode Density Reduction + Deep-Dive Placement
4. Legal Mode Compliance-First Output
5. AI Narratives Progressive Disclosure
6. Actionable KPI Cards With Click-to-Expand Visuals
7. Skeleton Loading Standardization
8. Final Polish + README Update

**What Each Step Contains**
1. Visual System Baseline
- Tighten spacing, hierarchy, and breathing room globally.
- Enforce color semantics globally:
- Red only for critical/compliance fail.
- Green only for pass.
- Neutral/amber for warning/in-progress.
- Make fairness score the visual focal point style-wise.
- Primary targets:
- globals.css
- TopNav.tsx
- Sidebar.tsx

2. Executive Mode IA
- Remove technical jargon entirely in executive mode.
- Show only executive essentials:
- High-level fairness score
- Delta vs previous audit
- Business risk estimate
- Potential fines in INR
- Binary deployment recommendation: GO / NO-GO
- Convert existing “one-pager” into concise decision panel.
- Primary target:
- [frontend/app/(dashboard)/audit/[auditId]/page.tsx](frontend/app/(dashboard)/audit/[auditId]/page.tsx)

3. Technical Mode Restructure
- Keep adversarial simulator, Pareto frontier, feature flip rates here only.
- Reduce stacked graph overload by surfacing KPI-first and drilling down on demand.
- Keep technical detail rich, but not noisy by default.
- Primary target:
- [frontend/app/(dashboard)/audit/[auditId]/page.tsx](frontend/app/(dashboard)/audit/[auditId]/page.tsx)

4. Legal Mode Restructure
- Map directly to compliance frameworks with cleaner legal layout.
- Improve legal audit trail readability.
- Prepare PDF-ready compliance sheet formatting consistency.
- Primary target:
- [frontend/app/(dashboard)/audit/[auditId]/page.tsx](frontend/app/(dashboard)/audit/[auditId]/page.tsx)

5. AI Narratives Progressive Disclosure
- Replace wall-of-text with:
- One-paragraph TLDR at top
- View Full Audit Narrative button
- Full narrative in side drawer/modal
- No fake simplification via random dropdown clutter.
- Primary target:
- [frontend/app/(dashboard)/audit/[auditId]/page.tsx](frontend/app/(dashboard)/audit/[auditId]/page.tsx)

6. KPI Cards -> Expandable Visuals
- Replace vertical chart stacks with top KPI cards.
- Card click expands corresponding visualization inline.
- Example card: “Disparate Impact 0.54 Critical” with direct action context.
- Primary targets:
- [frontend/app/(dashboard)/audit/[auditId]/page.tsx](frontend/app/(dashboard)/audit/[auditId]/page.tsx)
- charts

7. Skeleton Loaders Everywhere Needed
- Replace spinner-only waits in core async states with skeletons.
- Especially pipeline progression and dashboard waits.
- Primary targets:
- [frontend/app/(dashboard)/audit/[auditId]/page.tsx](frontend/app/(dashboard)/audit/[auditId]/page.tsx)
- frontend/app/(dashboard)/audit/new/page.tsx/audit/new/page.tsx)
- frontend/app/(dashboard)/dashboard/page.tsx/dashboard/page.tsx)

8. Docs Update
- Update behavior and stakeholder-mode expectations in:
- README.md
