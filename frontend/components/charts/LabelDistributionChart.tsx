'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

interface LabelDistributionChartProps {
  profiles: Array<{
    attribute: string;
    label_distribution_per_group: Record<string, { positive: number; negative: number }>;
  }>;
  overallPositiveRate?: number;
}

export default function LabelDistributionChart({ profiles, overallPositiveRate }: LabelDistributionChartProps) {
  if (!profiles || profiles.length === 0) return null;

  return (
    <div className="space-y-4">
      {profiles.map((profile) => {
        if (!profile.label_distribution_per_group) return null;

        const data = Object.entries(profile.label_distribution_per_group).map(([group, rates]) => ({
          group,
          positive: rates.positive,
          negative: rates.negative,
        }));

        return (
          <div key={profile.attribute} className="card" style={{ padding: '16px 12px' }}>
            <h4 className="text-xs font-semibold mb-3 px-2" style={{ color: 'var(--muted)' }}>
              Outcome Distribution- {profile.attribute}
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
                  formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }}
                />
                {overallPositiveRate != null && (
                  <ReferenceLine
                    y={overallPositiveRate}
                    stroke="var(--primary)"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{
                      value: `Overall: ${overallPositiveRate.toFixed(1)}%`,
                      fill: 'var(--primary)',
                      fontSize: 10,
                      position: 'right',
                    }}
                  />
                )}
                <Bar
                  dataKey="positive"
                  name="Positive Outcome"
                  fill="#06D6A0"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  fillOpacity={0.85}
                />
                <Bar
                  dataKey="negative"
                  name="Negative Outcome"
                  fill="#FF165D"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
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
