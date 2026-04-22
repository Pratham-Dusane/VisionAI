export type CanonicalDimensionKey = 'age' | 'gender' | 'race' | 'zip_code';

export interface DistributionProfile {
  attribute: string;
  group_counts?: Record<string, number>;
  group_percentages?: Record<string, number>;
  label_distribution_per_group?: Record<string, { positive: number; negative: number }>;
  imbalance_warning?: boolean;
  imbalance_ratio?: number | string;
}

export interface DimensionOption {
  key: CanonicalDimensionKey;
  label: string;
  attribute: string;
  profile: DistributionProfile;
  disparateImpact: number | null;
  severity: string | null;
  verdict: string | null;
}

const DIMENSION_ORDER: CanonicalDimensionKey[] = ['age', 'gender', 'race', 'zip_code'];

const DIMENSION_LABELS: Record<CanonicalDimensionKey, string> = {
  age: 'Age',
  gender: 'Gender',
  race: 'Race',
  zip_code: 'Zip Code',
};

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeDimensionKey(value: string | null | undefined): CanonicalDimensionKey | null {
  if (!value) return null;

  const token = normalizeToken(value);
  if (!token) return null;

  if (token.includes('zipcode') || token.includes('zip') || token.includes('postal') || token.includes('pincode')) {
    return 'zip_code';
  }
  if (token.includes('race') || token.includes('ethnic')) {
    return 'race';
  }
  if (token.includes('gender') || token.includes('sex')) {
    return 'gender';
  }
  if (token.includes('age') || token.includes('dob') || token.includes('years')) {
    return 'age';
  }

  return null;
}

export function getDimensionLabel(key: CanonicalDimensionKey) {
  return DIMENSION_LABELS[key];
}

function readNumeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildDimensionOptions(
  profilesInput: unknown,
  dataBiasInput: unknown,
): DimensionOption[] {
  const profiles = Array.isArray(profilesInput) ? (profilesInput as DistributionProfile[]) : [];
  const dataBiasRows = Object.values((dataBiasInput as Record<string, unknown>) || {}) as Array<Record<string, unknown>>;

  const byKey = new Map<CanonicalDimensionKey, DistributionProfile>();
  for (const profile of profiles) {
    const key = normalizeDimensionKey(profile?.attribute);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, profile);
  }

  const output: DimensionOption[] = [];
  for (const key of DIMENSION_ORDER) {
    const profile = byKey.get(key);
    if (!profile) continue;

    const biasRow = dataBiasRows.find((row) => normalizeDimensionKey(String(row?.attribute || '')) === key);
    const disparateImpact = readNumeric((biasRow?.metrics as Record<string, unknown> | undefined)?.disparate_impact);

    output.push({
      key,
      label: getDimensionLabel(key),
      attribute: profile.attribute,
      profile,
      disparateImpact,
      severity: biasRow?.severity ? String(biasRow.severity) : null,
      verdict: biasRow?.verdict ? String(biasRow.verdict) : null,
    });
  }

  return output;
}

export function summarizeLargestGroup(profile: DistributionProfile) {
  const percentages = profile.group_percentages || {};
  const counts = profile.group_counts || {};
  const keys = Object.keys(percentages).length > 0
    ? Object.keys(percentages)
    : Object.keys(counts);

  if (keys.length === 0) {
    return { name: 'N/A', percentage: 0, totalGroups: 0 };
  }

  let largestName = keys[0];
  let largestPct = Number(percentages[largestName] ?? 0);

  if (Object.keys(percentages).length === 0) {
    const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    largestPct = total > 0 ? (Number(counts[largestName] || 0) / total) * 100 : 0;

    for (const key of keys) {
      const pct = total > 0 ? (Number(counts[key] || 0) / total) * 100 : 0;
      if (pct > largestPct) {
        largestPct = pct;
        largestName = key;
      }
    }
  } else {
    for (const key of keys) {
      const pct = Number(percentages[key] ?? 0);
      if (pct > largestPct) {
        largestPct = pct;
        largestName = key;
      }
    }
  }

  return {
    name: largestName,
    percentage: largestPct,
    totalGroups: keys.length,
  };
}
