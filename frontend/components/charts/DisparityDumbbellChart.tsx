'use client';

interface DumbbellRow {
  group: string;
  baselineValue: number;
  value: number;
  delta: number;
}

interface DisparityDumbbellChartProps {
  dimensionLabel: string;
  metric: 'fpr' | 'fnr';
  baselineGroup: string;
  rows: DumbbellRow[];
}

function metricLabel(metric: 'fpr' | 'fnr') {
  return metric === 'fpr' ? 'False Positive Rate' : 'False Negative Rate';
}

function lineColor(delta: number) {
  const abs = Math.abs(delta);
  if (abs >= 10) return 'var(--danger)';
  if (abs >= 5) return 'var(--status-warning)';
  return 'var(--success)';
}

export default function DisparityDumbbellChart({
  dimensionLabel,
  metric,
  baselineGroup,
  rows,
}: DisparityDumbbellChartProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          At least two groups are required for disparity comparison.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>
            {dimensionLabel} disparity map ({metric.toUpperCase()})
          </div>
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Blue dot = baseline ({baselineGroup}), red dot = compared group. Longer links indicate larger gaps.
          </div>
        </div>
        <div className="text-[11px]" style={{ color: 'var(--placeholder)' }}>
          Metric: {metricLabel(metric)}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const left = Math.min(row.baselineValue, row.value);
          const right = Math.max(row.baselineValue, row.value);

          return (
            <div key={row.group} className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>{row.group}</span>
                <span className="text-[11px]" style={{ color: lineColor(row.delta) }}>
                  Delta: {row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)} pts
                </span>
              </div>

              <div className="relative h-7">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full" style={{ background: 'var(--border)' }} />

                <div
                  className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(right - left, 0.6)}%`,
                    background: lineColor(row.delta),
                  }}
                />

                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border"
                  style={{
                    left: `${row.baselineValue}%`,
                    background: 'var(--primary)',
                    borderColor: 'color-mix(in srgb, var(--primary) 45%, black)',
                  }}
                  title={`Baseline ${baselineGroup}: ${row.baselineValue.toFixed(1)}%`}
                />

                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border"
                  style={{
                    left: `${row.value}%`,
                    background: 'var(--danger)',
                    borderColor: 'color-mix(in srgb, var(--danger) 45%, black)',
                  }}
                  title={`${row.group}: ${row.value.toFixed(1)}%`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--placeholder)' }}>
                <span>Baseline {row.baselineValue.toFixed(1)}%</span>
                <span>{row.group} {row.value.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
