'use client';

import { AlertTriangle, Shield } from 'lucide-react';
import {
  FeatureWithProxyRisk,
  proxyRiskColor,
  proxyRiskLabel,
} from '@/lib/analysis/proxy-risk';

interface ProxyRiskFeatureBarsProps {
  features: FeatureWithProxyRisk[];
}

export default function ProxyRiskFeatureBars({ features }: ProxyRiskFeatureBarsProps) {
  if (features.length === 0) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          No feature importance data available for proxy risk analysis.
        </div>
      </div>
    );
  }

  const hasAnyRisk = features.some((f) => f.proxyRisk !== 'none');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
            Global Impact- Top Feature Drivers
          </div>
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Features ranked by SHAP importance. Colors indicate proxy risk for protected attributes.
          </div>
        </div>
        {hasAnyRisk && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <AlertTriangle size={10} />
            Proxy risk detected
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--placeholder)' }}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }} /> No proxy risk
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} /> Low
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-warning)' }} /> Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--danger)' }} /> High
        </span>
      </div>

      {/* Feature bars */}
      <div className="space-y-1.5">
        {features.map((f) => {
          const color = proxyRiskColor(f.proxyRisk);
          const label = proxyRiskLabel(f.proxyRisk);
          const isRisky = f.proxyRisk === 'high' || f.proxyRisk === 'medium';

          return (
            <div key={f.feature} className="group">
              <div className="flex items-center gap-2">
                {/* Feature name */}
                <span className="text-xs w-36 truncate font-medium" style={{ color: isRisky ? color : 'var(--fg)' }}>
                  {isRisky && <AlertTriangle size={10} className="inline mr-1" style={{ verticalAlign: '-1px' }} />}
                  {f.feature}
                </span>

                {/* Bar */}
                <div className="flex-1 h-4 rounded-full relative" style={{ background: 'var(--surface-2)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(f.normalizedImportance * 100, 2)}%`,
                      background: color,
                      opacity: isRisky ? 0.9 : 0.7,
                    }}
                  />
                </div>

                {/* Value */}
                <span className="text-xs w-14 text-right tabular-nums" style={{ color: 'var(--placeholder)' }}>
                  {f.importance.toFixed(4)}
                </span>

                {/* Risk badge */}
                {label && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{
                      background: `color-mix(in srgb, ${color} 12%, transparent)`,
                      color,
                      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                    }}
                  >
                    {label}
                  </span>
                )}
              </div>

              {/* Tooltip-style detail on proxy match */}
              {f.proxiedAttribute && (
                <div className="ml-[152px] mt-0.5 text-[10px] flex items-center gap-1" style={{ color: 'var(--placeholder)' }}>
                  <Shield size={9} />
                  Proxies <strong style={{ color }}>{f.proxiedAttribute}</strong>
                  {f.proxyCorrelation != null && (
                    <span> (r = {Math.abs(f.proxyCorrelation).toFixed(2)})</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
