'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

interface EqualizedOddsChartProps {
  /** { attribute: { group: { fpr, fnr, precision } } } */
  equalizedOdds: Record<string, Record<string, { fpr: number; fnr: number; precision: number }>>;
}

export default function EqualizedOddsChart({ equalizedOdds }: EqualizedOddsChartProps) {
  if (!equalizedOdds || Object.keys(equalizedOdds).length === 0) return null;

  return (
    <div className="space-y-4">
      {Object.entries(equalizedOdds).map(([attr, groups]) => {
        const data = Object.entries(groups).map(([group, metrics]) => ({
          group,
          FPR: +(metrics.fpr * 100).toFixed(1),
          FNR: +(metrics.fnr * 100).toFixed(1),
          Precision: +(metrics.precision * 100).toFixed(1),
        }));

        return (
          <div key={attr} className="card" style={{ padding: '16px 12px' }}>
            <h4 className="text-xs font-semibold mb-3 px-2" style={{ color: 'var(--muted)' }}>
              Equalized Odds- {attr}
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} margin={{ top: 5, right: 24, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="group"
                  tick={{ fill: 'var(--fg)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--fg)',
                  }}
                  formatter={(value) => [`${Number(value ?? 0)}%`]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                <ReferenceLine
                  y={10}
                  stroke="var(--accent)"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: '10% threshold',
                    fill: 'var(--accent)',
                    fontSize: 10,
                    position: 'right',
                  }}
                />
                <Bar
                  dataKey="FPR"
                  name="False Positive Rate"
                  fill="#FF165D"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  fillOpacity={0.85}
                />
                <Bar
                  dataKey="FNR"
                  name="False Negative Rate"
                  fill="#FF9A00"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  fillOpacity={0.85}
                />
                <Bar
                  dataKey="Precision"
                  name="Precision"
                  fill="#3EC1D3"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  fillOpacity={0.85}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
