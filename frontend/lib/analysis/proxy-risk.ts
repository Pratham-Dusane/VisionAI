/**
 * Proxy-Risk Analysis Utility
 *
 * Joins top explainability features with the audit's proxy detection results
 * to color-code features by their proxy risk severity.
 */

export type ProxyRiskLevel = 'high' | 'medium' | 'low' | 'none';

export interface ProxyCorrelation {
  proxy_column: string;
  protected_column: string;
  correlation: number;
  risk_level: string;
  explanation?: string;
}

export interface FeatureWithProxyRisk {
  feature: string;
  importance: number;
  /** Normalized [0-1] bar width relative to maximum */
  normalizedImportance: number;
  proxyRisk: ProxyRiskLevel;
  /** The protected attribute this feature proxies for, if any */
  proxiedAttribute: string | null;
  /** Correlation score from proxy detection */
  proxyCorrelation: number | null;
  /** Raw explanation from proxy detection */
  proxyExplanation: string | null;
}

function normalizeFeatureName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function classifyRisk(riskLevel: string | undefined, correlation: number | undefined): ProxyRiskLevel {
  const level = (riskLevel || '').toUpperCase();
  if (level === 'HIGH' || level === 'CRITICAL') return 'high';
  if (level === 'MEDIUM' || level === 'ELEVATED') return 'medium';

  // Fallback: use raw correlation magnitude
  const corr = Math.abs(correlation ?? 0);
  if (corr >= 0.7) return 'high';
  if (corr >= 0.4) return 'medium';
  if (corr >= 0.2) return 'low';
  return 'none';
}

/**
 * Join top features with proxy correlations to produce risk-annotated feature list.
 */
export function joinFeaturesWithProxyRisk(
  topFeatures: Array<{ feature: string; importance: number }>,
  proxies: ProxyCorrelation[],
  maxFeatures = 10,
): FeatureWithProxyRisk[] {
  if (!topFeatures || topFeatures.length === 0) return [];

  const proxyIndex = new Map<string, ProxyCorrelation>();
  for (const p of (proxies || [])) {
    const key = normalizeFeatureName(p.proxy_column);
    // Keep highest-risk match if duplicates
    const existing = proxyIndex.get(key);
    if (!existing || Math.abs(p.correlation) > Math.abs(existing.correlation)) {
      proxyIndex.set(key, p);
    }
  }

  const maxImportance = topFeatures[0]?.importance || 1;

  return topFeatures.slice(0, maxFeatures).map((f) => {
    const key = normalizeFeatureName(f.feature);
    const match = proxyIndex.get(key);
    return {
      feature: f.feature,
      importance: f.importance,
      normalizedImportance: maxImportance > 0 ? f.importance / maxImportance : 0,
      proxyRisk: match ? classifyRisk(match.risk_level, match.correlation) : 'none',
      proxiedAttribute: match?.protected_column ?? null,
      proxyCorrelation: match?.correlation ?? null,
      proxyExplanation: match?.explanation ?? null,
    };
  });
}

/**
 * CSS color for proxy risk level.
 */
export function proxyRiskColor(risk: ProxyRiskLevel): string {
  switch (risk) {
    case 'high': return 'var(--danger)';
    case 'medium': return 'var(--status-warning)';
    case 'low': return 'var(--accent)';
    case 'none':
    default: return 'var(--primary)';
  }
}

/**
 * Human-readable label for risk levels.
 */
export function proxyRiskLabel(risk: ProxyRiskLevel): string {
  switch (risk) {
    case 'high': return 'High Proxy Risk';
    case 'medium': return 'Medium Proxy Risk';
    case 'low': return 'Low Proxy Risk';
    case 'none':
    default: return '';
  }
}
