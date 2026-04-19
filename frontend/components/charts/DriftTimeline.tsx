'use client';

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DriftBatch } from '@/lib/types';

interface TimelinePoint {
  id: string;
  date: string;
  fairnessScore: number;
  [metric: string]: string | number;
}

function toChartData(batches: DriftBatch[]): { data: TimelinePoint[]; metricKeys: string[] } {
  const metricSet = new Set<string>();

  const data = batches.map((batch) => {
    const row: TimelinePoint = {
      id: batch.id,
      date: batch.batchDate.slice(0, 10),
      fairnessScore: Number(batch.fairnessScore || 0),
    };

    for (const metric of batch.metrics || []) {
      const key = `di_${metric.protectedAttribute}`;
      metricSet.add(key);
      row[key] = Number(metric.diRatio ?? 0);
    }

    return row;
  });

  return {
    data,
    metricKeys: Array.from(metricSet),
  };
}

const LINE_COLORS = ['#FF165D', '#FF9A00', '#3EC1D3', '#22C55E', '#0EA5E9', '#F97316'];

export default function DriftTimeline({
  batches,
  onPointClick,
}: {
  batches: DriftBatch[];
  onPointClick?: (batchId: string) => void;
}) {
  if (!batches || batches.length === 0) {
    return (
      <div className="card" style={{ padding: '18px' }}>
        <div className="text-sm" style={{ color: 'var(--muted)' }}>
          No drift batches uploaded yet.
        </div>
      </div>
    );
  }

  const { data, metricKeys } = toChartData(batches);

  function handleChartClick(event: unknown) {
    if (!onPointClick || !event || typeof event !== 'object') {
      return;
    }

    const maybeEvent = event as { activePayload?: Array<{ payload?: { id?: string } }> };
    const id = maybeEvent.activePayload?.[0]?.payload?.id;
    if (id) {
      onPointClick(String(id));
    }
  }

  return (
    <div className="card" style={{ padding: '16px 12px' }}>
      <h2 className="card-title mb-4 px-2">Fairness Drift Timeline</h2>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: 30, bottom: 8, left: 0 }} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            yAxisId="score"
            domain={[0, 100]}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            label={{ value: 'Fairness Score', angle: -90, position: 'insideLeft', fill: 'var(--placeholder)', fontSize: 10 }}
          />
          <YAxis
            yAxisId="di"
            orientation="right"
            domain={[0, 1.5]}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            label={{ value: 'DI Ratio', angle: 90, position: 'insideRight', fill: 'var(--placeholder)', fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--fg)',
            }}
          />
          <ReferenceLine
            yAxisId="di"
            y={0.8}
            stroke="var(--danger)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: 'DI 0.80 threshold', fill: 'var(--danger)', fontSize: 10, position: 'right' }}
          />

          <Line
            yAxisId="score"
            type="monotone"
            dataKey="fairnessScore"
            stroke="var(--primary)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 2, cursor: 'pointer' }}
            activeDot={{ r: 6 }}
            name="Fairness Score"
          />

          {metricKeys.map((key, index) => (
            <Line
              key={key}
              yAxisId="di"
              type="monotone"
              dataKey={key}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: LINE_COLORS[index % LINE_COLORS.length], cursor: 'pointer' }}
              name={`DI - ${key.replace('di_', '')}`}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
