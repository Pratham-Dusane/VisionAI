# VisionAI Implementation Plan (Canonical)

Created: 2026-04-20
Owner: GitHub Copilot
Scope: Frontend-first implementation for requested UX redesigns.

---

## 1) Decision Lock (Confirmed)

These decisions are finalized and should be treated as implementation truth:

1. Soft Gate behavior on /:
   - Yes, show the hero modal first for everyone.
   - CTA "Explore Live Audit" routes:
     - Logged-in user -> /dashboard
     - Not logged in -> /login

2. Model Analysis metric strategy (chosen by implementation):
   - Use a metric toggle with FPR default and FNR secondary.
   - Reason: best balance of clarity for judges plus analytical depth.

3. Explainability waterfall wording:
   - "Relative contribution index" wording is approved.

4. Data dimension labels:
   - Use user-readable labels, including "Zip Code" (not "Zip_Code").

Optional suggestions status:
- shadcn/ui Tabs: deferred for now.
- Tremor.so charts: deferred for now.
- Reason: existing stack (Recharts + D3 + Framer Motion) already supports all requested outcomes with lower migration risk.

---

## 2) Codebase Anchors (Validated)

### Routing/Auth shell
- frontend/app/page.tsx
  - Currently redirects to /login, must become Soft Gate entry.
- frontend/components/layout/AuthGuard.tsx
  - Already enforces auth and org routing.
- frontend/lib/auth-context.tsx
  - Source of logged-in state for Soft Gate CTA decisions.

### Dashboard copy and typography targets
- frontend/app/(dashboard)/dashboard/page.tsx
  - Tagline and benchmark headline area.
- frontend/app/layout.tsx
  - Global font imports and CSS variables.
- frontend/app/globals.css
  - Typography, gradients, theme-specific highlight rules.

### Audit tab architecture
- frontend/app/(dashboard)/audit/[auditId]/page.tsx
  - Tab routing and all current tab implementations.
  - DataTab ~ line 1313.
  - ModelTab ~ line 2319.
  - ExplainabilityTab ~ line 2822.

### Existing chart components available for reuse/refactor
- frontend/components/charts/GroupDistributionChart.tsx
- frontend/components/charts/LabelDistributionChart.tsx
- frontend/components/charts/EqualizedOddsChart.tsx
- frontend/components/charts/PredictiveParityChart.tsx
- frontend/components/charts/ShapSummaryChart.tsx
- frontend/components/charts/IntersectionalHeatmap.tsx

### Installed dependencies relevant to this plan
- framer-motion (already installed)
- recharts (already installed)
- d3 (already installed)

---

## 3) Main Deliverables

1. Data Analysis tab redesign
- Replace stacked per-attribute charts with one master-detail chart.
- Add segmented dimension toggle: Age, Gender, Race, Zip Code.
- Add meaningful motion when switching dimensions.

2. Typography refinements
- Lora italic for: "Benchmarking accuracy is easy. Compare your previous and next."
- Bodoni Moda for: "Because an algorithm should not inherit our history's mistakes"

3. Soft Gate architecture on /
- Blurred dashboard background preview in light mode.
- Centered hero modal with CTA "Explore Live Audit".
- Fade-out + blur-lift transition on CTA.

4. Model Analysis redesign
- Use master toggle (Age, Gender, Race).
- Replace stacked equalized-odds bars with disparity dumbbell chart.
- Add high-contrast FPR/FNR validation table below chart.

5. Explainability root-cause engine
- Split into Global Impact and Local Group Impact.
- Global feature importance colored by proxy risk severity.
- Group-level waterfall with demographic selector.

---

## 4) Sequential Execution Plan (Strict Order)

## Phase A - Typography and dashboard text foundations

### Step A1 - Add missing font families globally
Files:
- frontend/app/layout.tsx
- frontend/app/globals.css

Actions:
1. Import Bodoni_Moda and Lora from next/font/google.
2. Register variables:
   - --font-bodoni-moda
   - --font-lora
3. Add utility classes:
   - .font-bodoni-tagline
   - .font-lora-italic

Acceptance:
- Fonts load with no layout shift/regression.

### Step A2 - Apply requested typography exactly
Files:
- frontend/app/(dashboard)/dashboard/page.tsx
- frontend/app/globals.css

Actions:
1. Apply Bodoni Moda to algorithm-history tagline.
2. Apply Lora italic to benchmark sentence.
3. Preserve light mode gradient and dark mode cyan emphasis.

Acceptance:
- Typography is visibly distinct and responsive.

---

## Phase B - Soft Gate implementation

### Step B1 - Replace / redirect with Soft Gate page
Files:
- frontend/app/page.tsx
- frontend/app/globals.css
- new: frontend/components/landing/SoftGateHero.tsx
- new: frontend/components/landing/DashboardBackdropPreview.tsx

Actions:
1. Replace redirect page with client-rendered soft gate.
2. Render full-screen dashboard-like preview in light mode only.
3. Apply blur when gate is active.
4. Render centered hero:
   - Title: VisionAI: Eradicate Algorithmic Bias.
   - Subtitle: Enterprise-grade inspection for high-stakes AI decisions.
   - CTA: Explore Live Audit
5. CTA flow:
   - user exists -> /dashboard
   - no user -> /login
6. Animate modal fade-out and blur lift.

Acceptance:
- / opens hero gate first for all users.
- CTA routes correctly by auth state.

---

## Phase C - Data Analysis master-detail system

### Step C1 - Dimension normalization contract
Files:
- new: frontend/lib/analysis/dimensions.ts
- frontend/app/(dashboard)/audit/[auditId]/page.tsx

Actions:
1. Normalize incoming attribute names to canonical keys:
   - age, gender, race, zip_code
2. Build display label map:
   - age -> Age
   - gender -> Gender
   - race -> Race
   - zip_code -> Zip Code
3. Build available dimensions from current audit payload.

Acceptance:
- Toggle shows only available dimensions with user-readable labels.

### Step C2 - Master-detail chart and segmented toggle
Files:
- new: frontend/components/charts/DimensionPillToggle.tsx
- new: frontend/components/charts/MasterDetailDistributionChart.tsx
- frontend/app/(dashboard)/audit/[auditId]/page.tsx

Actions:
1. In DataTab distribution panel, replace stacked chart rendering.
2. Render one segmented toggle + one primary chart.
3. Keep one selected dimension visible at a time.
4. Add detail strip below chart:
   - imbalance warning
   - group count summary
   - highest disparity hint

Acceptance:
- No chart stacking overload remains.

### Step C3 - Meaningful motion on lens switch
Files:
- frontend/components/charts/MasterDetailDistributionChart.tsx

Actions:
1. Use Framer Motion layout transitions for bars/labels.
2. Animate reposition and value transitions (not hard swap).
3. Add reduced motion fallback.

Acceptance:
- Switching dimensions feels like one dataset changing perspective.

---

## Phase D - Model Analysis: inference and disparity

### Step D1 - Build disparity dumbbell visualization
Files:
- new: frontend/components/charts/DisparityDumbbellChart.tsx
- frontend/app/(dashboard)/audit/[auditId]/page.tsx

Actions:
1. Add Model dimension toggle: Age, Gender, Race.
2. Add metric toggle: FPR (default), FNR.
3. Build dumbbell rows for group comparisons:
   - baseline dot (blue)
   - comparative dot (red)
   - connecting line indicates gap severity
4. Baseline source priority:
   - privileged_group when available
   - fallback to first stable group.

Acceptance:
- Gap severity is visually obvious from line lengths.

### Step D2 - Add supporting raw table
Files:
- frontend/app/(dashboard)/audit/[auditId]/page.tsx

Actions:
1. Render high-contrast table below dumbbell:
   - group
   - FPR
   - FNR
   - precision
   - delta vs baseline
2. Color-code problematic deltas.

Acceptance:
- Table values match chart values exactly.

---

## Phase E - Explainability: root cause engine

### Step E1 - Split tab into two vertical zones
Files:
- frontend/app/(dashboard)/audit/[auditId]/page.tsx
- new: frontend/components/charts/ProxyRiskFeatureBars.tsx
- new: frontend/components/charts/GroupImpactWaterfall.tsx

Actions:
1. Global Impact section:
   - top 10 feature drivers.
2. Local Group Impact section:
   - demographic selector
   - waterfall for selected group.

Acceptance:
- Explainability page reads as Global then Local by design.

### Step E2 - Proxy-aware feature color logic
Files:
- new: frontend/lib/analysis/proxy-risk.ts
- frontend/components/charts/ProxyRiskFeatureBars.tsx

Actions:
1. Join top features with audit.proxies correlations.
2. Color code:
   - high proxy risk: warning/critical palette + icon
   - medium: amber
   - low/none: neutral-primary
3. Tooltip includes protected column and score.

Acceptance:
- Risky proxy-like drivers are immediately visible.

### Step E3 - Group waterfall using current payload
Files:
- new: frontend/lib/analysis/waterfall.ts
- frontend/components/charts/GroupImpactWaterfall.tsx

Actions:
1. Use explainability.shap_by_group from existing response.
2. Compute and rank relative contribution index per selected group.
3. Render cumulative waterfall with clear start/end anchors.
4. Label chart explicitly as "Relative Contribution Index".

Acceptance:
- Group selector updates waterfall correctly.
- Wording is accurate and approved.

---

## Phase F - QA and docs

### Step F1 - Regression validation
Checks:
1. All tabs still work in technical/executive/legal modes.
2. Mobile + desktop responsive behavior holds.
3. Dark/light theme consistency for all new visuals.
4. / soft gate flow works for auth and non-auth users.

### Step F2 - Documentation sync
Files:
- frontend/README.md
- IMPLEMENTATION_PLAN.md

Actions:
1. Add section describing new tab architecture and soft gate behavior.
2. Mark completed steps as they land.

---

## 5) Quick Reference While Implementing

Use this checklist during coding in order:

1. A1 fonts
2. A2 typography apply
3. B1 soft gate page
4. C1 dimensions contract
5. C2 master-detail data chart
6. C3 motion polish
7. D1 dumbbell + metric toggle
8. D2 raw validation table
9. E1 explainability split
10. E2 proxy color intelligence
11. E3 group waterfall
12. F1 regression QA
13. F2 docs update

---

## 6) Manual Verification Checklist

1. / shows soft gate modal over blurred light dashboard preview.
2. CTA says Explore Live Audit.
3. Logged-in CTA path goes to /dashboard.
4. Logged-out CTA path goes to /login.
5. Tagline uses Bodoni Moda.
6. Benchmark sentence uses Lora italic.
7. Data tab has one chart and a dimension segmented toggle.
8. Data dimension switch animates (morph-like transition).
9. Model tab has dumbbell chart with FPR default and FNR toggle.
10. Model tab table displays exact FPR/FNR values for selected dimension.
11. Explainability tab is split into Global Impact and Group Impact.
12. High proxy-risk features are highlighted with warning styling.
13. Group waterfall updates by demographic selector.

---

## 7) Open Questions

None. All prior clarifications are now resolved.
