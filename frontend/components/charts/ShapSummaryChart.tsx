'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

interface ShapSummaryChartProps {
  /**
   * explainability data keyed by protected attribute.
   * Each entry has shap_by_group: { group: { feature: importance } }
   * and top_features: [{ feature, importance }]
   */
  explainability: Record<string, {
    shap_by_group?: Record<string, Record<string, number>>;
    top_features?: Array<{ feature: string; importance: number }>;
    disparity_flags?: Array<{ feature: string; disparity_ratio: number }>;
  }>;
}

const GROUP_COLORS = [
  '#8A63FF', '#3EC1D3', '#FF9A00', '#FF165D',
  '#06D6A0', '#5B86E5', '#FF6B6B', '#4ECDC4',
];

export default function ShapSummaryChart({ explainability }: ShapSummaryChartProps) {
  if (!explainability || Object.keys(explainability).length === 0) return null;

  return (
    <div className="space-y-4">
      {Object.entries(explainability).map(([attr, data]) => {
        const shapByGroup = data.shap_by_group;
        if (!shapByGroup || Object.keys(shapByGroup).length === 0) return null;

        const groups = Object.keys(shapByGroup);

        // Collect all features and compute total importance for sorting
        const featureMap = new Map<string, Record<string, number>>();
        for (const [group, features] of Object.entries(shapByGroup)) {
          for (const [feature, importance] of Object.entries(features)) {
            if (!featureMap.has(feature)) featureMap.set(feature, {});
            featureMap.get(feature)![group] = importance;
          }
        }

        const chartData = Array.from(featureMap.entries())
          .map(([feature, groupVals]) => {
            const total = Object.values(groupVals).reduce((s, v) => s + v, 0);
            return { feature, ...groupVals, _total: total };
          })
          .sort((a, b) => b._total - a._total)
          .slice(0, 12); // Top 12 features

        return (
          <div key={attr} className="card" style={{ padding: '16px 12px' }}>
            <h4 className="text-xs font-semibold mb-3 px-2" style={{ color: 'var(--muted)' }}>
              SHAP Feature Importance by Group — {attr}
            </h4>
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="feature"
                  width={120}
                  tick={{ fill: 'var(--fg)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--fg)',
                  }}
                  formatter={(value) => [Number(value ?? 0).toFixed(4)]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                {groups.map((group, idx) => (
                  <Bar
                    key={group}
                    dataKey={group}
                    name={group}
                    stackId="shap"
                    fill={GROUP_COLORS[idx % GROUP_COLORS.length]}
                    fillOpacity={0.85}
                    radius={idx === groups.length - 1 ? [0, 4, 4, 0] : undefined}
                    maxBarSize={24}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
