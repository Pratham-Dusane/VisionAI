'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

interface GroupDistributionChartProps {
  profiles: Array<{
    attribute: string;
    group_counts: Record<string, number>;
    group_percentages: Record<string, number>;
  }>;
}

const PALETTE = [
  '#8A63FF', '#3EC1D3', '#FF9A00', '#FF165D',
  '#06D6A0', '#5B86E5', '#FF6B6B', '#4ECDC4',
];

export default function GroupDistributionChart({ profiles }: GroupDistributionChartProps) {
  if (!profiles || profiles.length === 0) return null;

  return (
    <div className="space-y-4">
      {profiles.map((profile) => {
        const data = Object.entries(profile.group_counts).map(([group, count]) => ({
          group,
          count: count as number,
          pct: profile.group_percentages[group] ?? 0,
        }));

        return (
          <div key={profile.attribute} className="card" style={{ padding: '16px 12px' }}>
            <h4 className="text-xs font-semibold mb-3 px-2" style={{ color: 'var(--muted)' }}>
              Group Distribution- {profile.attribute}
            </h4>
            <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="group"
                  width={100}
                  tick={{ fill: 'var(--fg)', fontSize: 12 }}
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
                  formatter={(value, _name, props: any) => [
                    `${Number(value ?? 0).toLocaleString()} (${props.payload.pct.toFixed(1)}%)`,
                    'Count',
                  ]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {data.map((_, idx) => (
                    <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
