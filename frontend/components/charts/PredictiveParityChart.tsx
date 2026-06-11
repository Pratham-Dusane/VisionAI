'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface PredictiveParityChartProps {
  /** { attribute: { group: { precision } } } */
  equalizedOdds: Record<string, Record<string, { precision: number }>>;
}

export default function PredictiveParityChart({ equalizedOdds }: PredictiveParityChartProps) {
  if (!equalizedOdds || Object.keys(equalizedOdds).length === 0) return null;

  return (
    <div className="space-y-4">
      {Object.entries(equalizedOdds).map(([attr, groups]) => {
        const data = Object.entries(groups).map(([group, metrics]) => ({
          group,
          precision: +(metrics.precision * 100).toFixed(1),
        }));

        return (
          <div key={attr} className="chart-card" style={{ padding: '16px 12px' }}>
            <h4 className="text-xs font-semibold mb-3 px-2" style={{ color: 'var(--muted)' }}>
              Predictive Parity (Precision) - {attr}
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
                  domain={[0, 100]}
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
                  formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, 'Precision']}
                />
                <Bar
                  dataKey="precision"
                  fill="#3EC1D3"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
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
