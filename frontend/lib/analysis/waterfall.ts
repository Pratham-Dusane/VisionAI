/**
 * Waterfall Computation Utility
 *
 * Computes cumulative waterfall data from per-group SHAP importance values.
 * Used to render the "Relative Contribution Index" waterfall in the
 * Explainability tab's Local Group Impact section.
 */

export interface WaterfallBar {
  feature: string;
  /** Raw SHAP importance for this feature in the selected group */
  value: number;
  /** Running cumulative total up to and including this bar */
  cumulative: number;
  /** Start position for the waterfall bar (previous cumulative) */
  start: number;
  /** Whether contribution is positive (pushes decision toward positive outcome) */
  isPositive: boolean;
}

export interface WaterfallResult {
  bars: WaterfallBar[];
  /** Sum of all contributions */
  total: number;
  /** Maximum absolute cumulative value (for scaling) */
  maxAbsCumulative: number;
  /** Group name this waterfall was built for */
  group: string;
}

/**
 * Compute waterfall bars for a single group's SHAP values.
 *
 * @param shapByFeature  Object mapping feature name → importance (from shap_by_group[group])
 * @param group          Group label
 * @param maxBars        Maximum number of bars to show (remainder grouped as "Other")
 */
export function computeGroupWaterfall(
  shapByFeature: Record<string, number> | undefined | null,
  group: string,
  maxBars = 10,
): WaterfallResult {
  if (!shapByFeature || Object.keys(shapByFeature).length === 0) {
    return { bars: [], total: 0, maxAbsCumulative: 0, group };
  }

  // Sort by absolute importance descending
  const sorted = Object.entries(shapByFeature)
    .map(([feature, value]) => ({ feature, value: Number(value) || 0 }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // Take top N, aggregate rest into "Other"
  const top = sorted.slice(0, maxBars);
  const rest = sorted.slice(maxBars);

  if (rest.length > 0) {
    const otherSum = rest.reduce((sum, item) => sum + item.value, 0);
    top.push({ feature: 'Other features', value: otherSum });
  }

  // Build cumulative waterfall
  let cumulative = 0;
  let maxAbsCumulative = 0;
  const bars: WaterfallBar[] = top.map(({ feature, value }) => {
    const start = cumulative;
    cumulative += value;
    maxAbsCumulative = Math.max(maxAbsCumulative, Math.abs(cumulative));
    return {
      feature,
      value,
      cumulative,
      start,
      isPositive: value >= 0,
    };
  });

  return { bars, total: cumulative, maxAbsCumulative, group };
}

/**
 * Get available groups from SHAP by-group data.
 */
export function getAvailableGroups(
  explainabilityData: Record<string, {
    shap_by_group?: Record<string, Record<string, number>>;
  }>,
): string[] {
  const groupSet = new Set<string>();
  for (const data of Object.values(explainabilityData || {})) {
    for (const group of Object.keys(data.shap_by_group || {})) {
      groupSet.add(group);
    }
  }
  return Array.from(groupSet).sort();
}

/**
 * Get SHAP values for a specific group across all attributes.
 * Merges values from multiple protected attributes into one feature map.
 */
export function getGroupShapValues(
  explainabilityData: Record<string, {
    shap_by_group?: Record<string, Record<string, number>>;
  }>,
  group: string,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const data of Object.values(explainabilityData || {})) {
    const groupData = data.shap_by_group?.[group];
    if (!groupData) continue;
    for (const [feature, value] of Object.entries(groupData)) {
      // Use max absolute value across attributes
      const current = merged[feature] ?? 0;
      if (Math.abs(Number(value)) > Math.abs(current)) {
        merged[feature] = Number(value);
      }
    }
  }
  return merged;
}
