# VisionAI UI/UX Execution Plan

This file collects the UI/UX improvements in the order they should be executed. Follow the sequence top to bottom so each change builds on the previous one.

## 1. Set the visual direction first
Move the frontend from the current dark custom look to a light-first enterprise interface inspired by Material Design 3 and google ecosystem

- Use light surfaces as the default for readability 
- Keep color restrained and functional, decorative.
- Introduce softer elevation, rounded surfaces, and clear surface hierarchy.
- Use high-legibility typography with strong heading scale and stable metric sizing.
- Keep the Google-inspired feel in the interaction model, not by copying branding.


### Success criteria
- The app clearly reads as a calm enterprise tool.
- Surfaces, buttons, cards, and alerts follow one visual system.
- The UI feels lighter and easier to scan.

## 2. Establish spatial continuity across the app shell
Make the overall layout feel connected from page to page.
- Normalize spacing, gutters, card padding, and section rhythm.
- Make headers, content regions, and actions align to a shared grid.
- Keep elevation and border usage consistent across sidebar, top nav, cards, and dialogs.
- Make transitions between dashboard, audit flow, and detail pages feel like the same product.
- Spatial continuity is what makes Google-style UX feel deliberate

### Success criteria
- Layouts feel related rather than assembled independently.
- There is no visual jump between shell and content.
- Section spacing is consistent across screens.

## 3. Improve navigation and action hierarchy
Make the app easier to understand and act on quickly.

- Keep the primary navigation simple and predictable.
- Ensure the current location is always obvious.
- Make the main action on each page visually dominant.
- Reduce competing focal points in headers and content blocks.


Users should never have to hunt for the next action. Clear navigation and hierarchy reduce friction everywhere else.

### Success criteria
- The user always knows where they are and what to do next.
- One action is clearly primary on every page.
- Secondary actions do not compete visually with the main task.

## 4. Rebuild the dashboard into a decision surface
Treat the dashboard as a live operational view, not a static summary page.

- Move the New Audit CTA to the top right or make it a prominent primary action in the layout.
- Remove the feeling that the center of the page is a blank CTA zone.
- Populate the center with actionable content:
  - critical bias alerts
  - recent audit activity
  - system health summary
  - drift movement or trend summaries
- Keep the top metric cards, but add trend indicators such as:
  - Avg Fairness 70/100, up 5% since last week
  - Proxy Alerts down since last audit
- Make the dashboard feel like a live control panel for fairness monitoring.


The dashboard is the main landing page after login, so it should immediately communicate value and urgency.

### Success criteria
- The dashboard center is useful data, not empty space.
- The most important metrics are obvious in under a few seconds.
- The CTA placement feels natural and enterprise-appropriate.

## 5. Promote critical health indicators
Make “Proxy Alerts” and “Avg Fairness” behave like true status signals.

- Highlight these metrics with status-driven typography, subtle background elevation, or tinted surfaces.
- Use clear visual states for healthy, warning, and critical conditions.
- Add trend language so the user knows whether the situation is improving or worsening.
- Avoid treating these as ordinary stats when they are effectively health indicators.

These are the highest-signal dashboard values. They deserve stronger emphasis than generic totals.

### Success criteria
- Users can identify risk at a glance.
- Critical metrics visually stand apart from neutral metrics.
- Trend direction is obvious without extra interpretation.


## 6. Add real upload and processing states
Design explicit states for the audit intake flow.

- Idle
- Dragging
- Uploading
- Processing
- Success
- Error

- Make these states visually different.
- Show meaningful progress feedback while work is happening.
- Use clear error text for cases such as missing protected class columns, bad schema, or parse failures.
- Never leave the user unsure whether the system is doing something.

Trust depends on system feedback. The user should always know whether the app is ready, working, or blocked.

### Success criteria
- Upload state is always visible and unambiguous.
- Errors explain what to fix.
- Processing never feels frozen or vague.


## 7. Improve Step 2 with progressive disclosure
Make the context form feel smarter and less overwhelming.

- Only show fields when they are relevant.
- Prefill or suggest values when the backend has already inferred something.
- Keep advanced options tucked away until needed.
- Use helpful labels and examples for the most important inputs.

The context step is critical, but it should not feel dense or intimidating. Progressive disclosure keeps the flow approachable.

### Success criteria
- The form feels shorter than it actually is.
- Relevant inputs appear only when needed.
- Auto-suggestions reduce manual work.

## 8. Strengthen accessibility across the interface
Build inclusive behavior into the UI system, not as an afterthought.

- Ensure visible focus states for all interactive controls.
- Make the interface keyboard-friendly end to end.
- Do not rely on color alone for severity or state.
- Keep contrast strong on every surface and for all text sizes.
- Make error messages plain, specific, and actionable.
- Ensure buttons, inputs, and cards have accessible hover and focus affordances.

Accessibility should be baked into the core patterns before visual refinement is finalized.

### Success criteria
- The app is fully usable by keyboard.
- State and severity remain clear without color dependence.
- Text is readable and controls are easy to target.

## 9. Refine typography and density rules
Make dense enterprise content easier to scan.

- Establish a clear hierarchy for page titles, section titles, metrics, labels, and helper text.
- Avoid overly small text for important data.
- Keep metric cards consistent in size and rhythm.
- Use whitespace to separate task groups without fragmenting the layout.

Once the structure is set, typography and density tuning make the interface feel polished and calm.

### Success criteria
- The page is readable at a glance.
- Metrics and actions do not crowd each other.
- Content feels calm instead of packed.

## 10. Polish consistency across secondary surfaces
Apply the same rules to all non-primary screens.

- Audit detail pages
- Reports
- Drift monitor
- Settings
- Auth pages

- Reuse the same surface styles, spacing, and status language.
- Keep the same action hierarchy in headers and cards.
- Make empty states and loading states match the dashboard tone.

The product should feel unified outside the main two screens as well. Secondary pages often reveal inconsistency fastest.

### Success criteria
- No page feels like it belongs to a different design system.
- Loading, empty, and error states feel coherent.
- The product feels intentionally designed end to end.

## 11. Final visual QA pass
Do one final pass after the core changes are in place.

- Check alignment, spacing, and elevation consistency.
- Review dashboard emphasis and audit flow friction.
- Verify accessibility again with keyboard and contrast in mind.
- Make sure the app still feels calm, task-first, and spatially continuous.

This is the finishing pass. It is where you catch visual mismatches after the main changes are done.

### Success criteria
- The UI feels cohesive and production-ready.
- No element competes with the primary user task.
- The whole experience feels like one system.



## Notes to keep in mind throughout
- Keep the interface task-first.
- Keep it calm, not noisy.
- Keep the center of the dashboard actionable.
- Keep important alerts visually distinct.
- Keep the product visually consistent across pages.
- Use strong defaults so the user never has to decode the UI.
