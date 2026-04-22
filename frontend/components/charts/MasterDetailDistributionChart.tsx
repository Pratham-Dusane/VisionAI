'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CanonicalDimensionKey, DistributionProfile } from '@/lib/analysis/dimensions';

type GroupRow = {
  group: string;
  count: number;
  percentage: number;
  positiveRate: number | null;
  negativeRate: number | null;
};

interface MasterDetailDistributionChartProps {
  dimensionKey: CanonicalDimensionKey;
  dimensionLabel: string;
  profile: DistributionProfile;
  disparateImpact?: number | null;
  severity?: string | null;
}

function getRows(profile: DistributionProfile): GroupRow[] {
  const counts = profile.group_counts || {};
  const percentages = profile.group_percentages || {};
  const labelDistribution = profile.label_distribution_per_group || {};

  const groupKeys = new Set<string>([
    ...Object.keys(counts),
    ...Object.keys(percentages),
    ...Object.keys(labelDistribution),
  ]);

  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);

  const rows = Array.from(groupKeys).map((group) => {
    const count = Number(counts[group] || 0);
    const pctFromCount = total > 0 ? (count / total) * 100 : 0;
    const percentage = Number.isFinite(Number(percentages[group])) ? Number(percentages[group]) : pctFromCount;
    const rates = labelDistribution[group];

    return {
      group,
      count,
      percentage,
      positiveRate: rates && Number.isFinite(Number(rates.positive)) ? Number(rates.positive) : null,
      negativeRate: rates && Number.isFinite(Number(rates.negative)) ? Number(rates.negative) : null,
    };
  });

  return rows.sort((a, b) => b.percentage - a.percentage);
}

export default function MasterDetailDistributionChart({
  dimensionKey,
  dimensionLabel,
  profile,
  disparateImpact,
  severity,
}: MasterDetailDistributionChartProps) {
  const shouldReduceMotion = useReducedMotion();
  const rows = getRows(profile);

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] };

  const diStatusColor = disparateImpact != null && disparateImpact < 0.8
    ? 'var(--danger)'
    : 'var(--success)';

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Distribution Lens
          </div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--fg)' }}>
            {dimensionLabel}
          </h3>
          <div className="text-xs mt-1" style={{ color: 'var(--placeholder)' }}>
            Normalized from attribute: {profile.attribute}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Disparate Impact
          </div>
          <div className="text-lg font-black" style={{ color: diStatusColor }}>
            {disparateImpact == null ? '-' : disparateImpact.toFixed(2)}
          </div>
          {severity && (
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--placeholder)' }}>
              Severity: {severity}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout" initial={!shouldReduceMotion}>
          {rows.map((row) => {
            const barWidth = Math.max(2, Math.min(100, row.percentage));
            return (
              <motion.div
                key={`${dimensionKey}-${row.group}`}
                layout
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={transition}
                className="rounded-lg px-2 py-2"
                style={{ background: 'var(--surface-2)' }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--fg)' }}>
                    {row.group}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {row.count.toLocaleString()} rows • {row.percentage.toFixed(1)}%
                  </span>
                </div>

                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={shouldReduceMotion ? false : { width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={transition}
                    style={{ background: 'var(--primary)' }}
                  />
                </div>

                {(row.positiveRate != null || row.negativeRate != null) && (
                  <div className="mt-1.5 text-[11px]" style={{ color: 'var(--placeholder)' }}>
                    Positive: {row.positiveRate == null ? '-' : `${row.positiveRate.toFixed(1)}%`} | Negative: {row.negativeRate == null ? '-' : `${row.negativeRate.toFixed(1)}%`}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
