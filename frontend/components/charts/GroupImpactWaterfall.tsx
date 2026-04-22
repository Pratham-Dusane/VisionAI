'use client';

import { useMemo } from 'react';
import { computeGroupWaterfall, WaterfallBar } from '@/lib/analysis/waterfall';

interface GroupImpactWaterfallProps {
  /** SHAP values for the selected group: feature → importance */
  shapValues: Record<string, number>;
  /** Display name of the selected group */
  group: string;
}

function barColor(bar: WaterfallBar): string {
  return bar.isPositive ? 'var(--primary)' : 'var(--danger)';
}

export default function GroupImpactWaterfall({ shapValues, group }: GroupImpactWaterfallProps) {
  const waterfall = useMemo(
    () => computeGroupWaterfall(shapValues, group, 10),
    [shapValues, group],
  );

  if (waterfall.bars.length === 0) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          No SHAP data available for group &quot;{group}&quot;.
        </div>
      </div>
    );
  }

  // Scale: we need to map values to pixel widths.
  // We use the max absolute cumulative value to set the range.
  const maxRange = waterfall.maxAbsCumulative || 1;
  // Chart occupies a logical range from -maxRange to +maxRange
  const totalRange = maxRange * 2;

  // Map a value to a percentage position (0-100)
  const toPercent = (val: number) => ((val + maxRange) / totalRange) * 100;
  const zeroPosition = toPercent(0);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
          Local Group Impact- Relative Contribution Index
        </div>
        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
          Waterfall shows how each feature contributes to the model&apos;s output for
          group &quot;{group}&quot;. Blue bars push toward approval; red bars push toward rejection.
        </div>
      </div>

      {/* Waterfall chart */}
      <div className="space-y-1">
        {waterfall.bars.map((bar) => {
          const left = toPercent(Math.min(bar.start, bar.start + bar.value));
          const right = toPercent(Math.max(bar.start, bar.start + bar.value));
          const width = Math.max(right - left, 0.5);

          return (
            <div key={bar.feature} className="flex items-center gap-2">
              {/* Feature label */}
              <span className="text-xs w-36 truncate text-right" style={{ color: 'var(--fg)' }}>
                {bar.feature}
              </span>

              {/* Bar area */}
              <div className="flex-1 relative h-6">
                {/* Zero line */}
                <div
                  className="absolute top-0 bottom-0 w-px"
                  style={{ left: `${zeroPosition}%`, background: 'var(--border)' }}
                />

                {/* Bar */}
                <div
                  className="absolute top-1 bottom-1 rounded transition-all duration-300"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: barColor(bar),
                    opacity: 0.8,
                    minWidth: '3px',
                  }}
                  title={`${bar.feature}: ${bar.value >= 0 ? '+' : ''}${bar.value.toFixed(4)} (cumulative: ${bar.cumulative.toFixed(4)})`}
                />

                {/* Connector line from end of previous bar */}
                <div
                  className="absolute top-0 bottom-0 w-px opacity-30"
                  style={{
                    left: `${toPercent(bar.start)}%`,
                    background: 'var(--muted)',
                  }}
                />
              </div>

              {/* Value */}
              <span
                className="text-[11px] w-16 text-right tabular-nums font-medium"
                style={{ color: barColor(bar) }}
              >
                {bar.value >= 0 ? '+' : ''}{bar.value.toFixed(4)}
              </span>
            </div>
          );
        })}

        {/* Total bar */}
        <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs w-36 truncate text-right font-semibold" style={{ color: 'var(--fg)' }}>
            Total
          </span>
          <div className="flex-1 relative h-6">
            <div
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${zeroPosition}%`, background: 'var(--border)' }}
            />
            <div
              className="absolute top-1 bottom-1 rounded"
              style={{
                left: `${toPercent(Math.min(0, waterfall.total))}%`,
                width: `${Math.max(Math.abs(toPercent(waterfall.total) - zeroPosition), 0.5)}%`,
                background: waterfall.total >= 0 ? 'var(--primary)' : 'var(--danger)',
                opacity: 0.5,
                minWidth: '3px',
              }}
            />
          </div>
          <span
            className="text-[11px] w-16 text-right tabular-nums font-bold"
            style={{ color: waterfall.total >= 0 ? 'var(--primary)' : 'var(--danger)' }}
          >
            {waterfall.total >= 0 ? '+' : ''}{waterfall.total.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Axis labels */}
      <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--placeholder)' }}>
        <span>← Pushes toward rejection</span>
        <span>Pushes toward approval →</span>
      </div>
    </div>
  );
}
