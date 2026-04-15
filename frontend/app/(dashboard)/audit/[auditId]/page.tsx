'use client';

import TopNav from '@/components/layout/TopNav';
import { getAudit } from '@/lib/api';
import { useState, useEffect, use } from 'react';
import {
  Download,
  Share2,
  AlertTriangle,
  Shield,
  BarChart3,
  Brain,
  Grid3x3,
  Wrench,
  Scale,
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  Zap,
  Users,
  TrendingDown,
  ArrowRight,
  Info,
  Eye,
} from 'lucide-react';

const PIPELINE_STEPS = [
  { key: 'schema_parsing', label: 'Schema Parsing' },
  { key: 'proxy_detection', label: 'Proxy Detection' },
  { key: 'data_profiling', label: 'Data Profiling' },
  { key: 'data_bias_scan', label: 'Bias Scanning' },
  { key: 'model_evaluation', label: 'Model Evaluation' },
  { key: 'explainability', label: 'Explainability' },
  { key: 'intersectional_audit', label: 'Intersectional Audit' },
  { key: 'counterfactual_analysis', label: 'Counterfactual Analysis' },
  { key: 'regulation_mapping', label: 'Regulation Mapping' },
  { key: 'narrative_generation', label: 'Narrative Generation' },
];

const TABS = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'data', label: 'Data Analysis', icon: BarChart3 },
  { key: 'proxies', label: 'Proxy Detection', icon: AlertTriangle },
  { key: 'profiles', label: 'Data Profiles', icon: Users },
];

export default function AuditResultsPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params);
  const [tab, setTab] = useState('overview');
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await getAudit(auditId);
        setAudit(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load audit');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auditId]);

  if (loading) {
    return (
      <>
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Loading...' }]} />
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, #3EC1D3, #FF9A00)' }}>
            <Eye size={28} color="#0B0E14" className="animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Loading audit results</h2>
          <p className="text-sm mb-6" style={{ color: '#8892A5' }}>Fetching data from Firestore...</p>
          <Loader2 size={24} className="animate-spin" style={{ color: '#3EC1D3' }} />
        </div>
      </>
    );
  }

  if (error || !audit) {
    return (
      <>
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Error' }]} />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <XCircle size={40} style={{ color: '#FF165D', marginBottom: 12 }} />
          <h2 className="text-lg font-semibold mb-1">Audit not found</h2>
          <p className="text-sm" style={{ color: '#8892A5' }}>{error || 'This audit does not exist.'}</p>
        </div>
      </>
    );
  }

  const schema = audit.schema;
  const proxies = audit.proxies || [];
  const profiles = audit.profiles || [];

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: audit.name }]} />

      <div className="flex-1 p-4 space-y-3 animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88" className="score-ring">
              <circle cx="44" cy="44" r="38" fill="none" stroke="#1A1F2B" strokeWidth="6" />
              <circle
                cx="44" cy="44" r="38"
                fill="none" stroke="#3EC1D3" strokeWidth="6"
                strokeDasharray="239 239"
                strokeLinecap="round"
                transform="rotate(-90 44 44)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold" style={{ color: '#3EC1D3' }}>P3</span>
              <span className="text-[9px]" style={{ color: '#5A6478' }}>Phase 3</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-bold">{audit.name}</h1>
              <span className="badge badge-pass">COMPLETE</span>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: '#8892A5' }}>
              <span>{audit.domain}</span>
              <span>•</span>
              <span>{new Date(audit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span>•</span>
              <span>{audit.rowCount?.toLocaleString()} rows</span>
              <span>•</span>
              <span>{audit.columnCount} columns</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="btn btn-secondary btn-sm">
              <Share2 size={13} /> Share
            </button>
            <button className="btn btn-primary btn-sm">
              <Download size={13} /> PDF
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-bar">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`tab-item flex items-center gap-1.5 ${tab === t.key ? 'active' : ''}`}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && <OverviewTab audit={audit} proxies={proxies} profiles={profiles} />}
        {tab === 'data' && <DataTab schema={schema} />}
        {tab === 'proxies' && <ProxiesTab proxies={proxies} />}
        {tab === 'profiles' && <ProfilesTab profiles={profiles} />}
      </div>
    </>
  );
}

/* ============ OVERVIEW ============ */
function OverviewTab({ audit, proxies, profiles }: { audit: any; proxies: any[]; profiles: any[] }) {
  const imbalancedCount = profiles.filter((p: any) => p.imbalance_warning).length;

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricMini label="Rows Analyzed" value={audit.rowCount?.toLocaleString()} sub={`${audit.columnCount} columns`} color="#3EC1D3" />
        <MetricMini label="Protected Attributes" value={String(audit.protectedCols?.length || 0)} sub={audit.protectedCols?.join(', ') || '—'} color="#FF9A00" />
        <MetricMini label="Proxy Variables" value={String(proxies.length)} sub={`${proxies.filter((p: any) => p.risk_level === 'HIGH').length} HIGH risk`} color={proxies.length > 0 ? '#FF165D' : '#06D6A0'} />
        <MetricMini label="Imbalance Warnings" value={String(imbalancedCount)} sub={`of ${profiles.length} attributes`} color={imbalancedCount > 0 ? '#FF9A00' : '#06D6A0'} />
      </div>

      {/* Config summary */}
      <div className="card">
        <h3 className="text-xs font-semibold mb-3" style={{ color: '#8892A5' }}>Audit Configuration</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span style={{ color: '#5A6478' }}>Label Column</span>
          <span>{audit.labelCol}</span>
          <span style={{ color: '#5A6478' }}>Positive Value</span>
          <span>{audit.positiveLabel}</span>
          <span style={{ color: '#5A6478' }}>Fairness Threshold</span>
          <span>{audit.threshold?.toFixed(2)}</span>
          <span style={{ color: '#5A6478' }}>Dataset</span>
          <span className="text-xs" style={{ color: '#8892A5' }}>{audit.storagePath?.split('/').pop()}</span>
        </div>
      </div>

      {/* Proxy warnings summary */}
      {proxies.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255, 22, 93, 0.3)', background: 'rgba(255, 22, 93, 0.03)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} style={{ color: '#FF165D' }} />
            <span className="text-xs font-semibold" style={{ color: '#FF165D' }}>
              Proxy Variables Detected — {proxies.length} found
            </span>
          </div>
          <div className="space-y-1">
            {proxies.slice(0, 3).map((p: any, i: number) => (
              <div key={i} className="text-sm" style={{ color: '#C8CCD4' }}>
                <strong style={{ color: '#FF9A00' }}>{p.proxy_column}</strong> → correlates with <strong>{p.protected_column}</strong> ({p.method}: {p.association_score.toFixed(2)})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Imbalance warnings */}
      {profiles.filter((p: any) => p.imbalance_warning).map((profile: any, i: number) => (
        <div key={i} className="card" style={{ borderColor: 'rgba(255, 154, 0, 0.2)', background: 'rgba(255, 154, 0, 0.03)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} style={{ color: '#FF9A00' }} />
            <span className="text-xs font-semibold" style={{ color: '#FF9A00' }}>
              Group Imbalance — {profile.attribute} (ratio: {profile.imbalance_ratio}x)
            </span>
          </div>
          <div className="flex gap-3">
            {Object.entries(profile.group_counts as Record<string, number>).map(([group, count]) => (
              <div key={group} className="text-center px-3 py-2 rounded-lg" style={{ background: '#1A1F2B' }}>
                <div className="text-sm font-bold" style={{ color: '#E8EAED' }}>{(count as number).toLocaleString()}</div>
                <div className="text-[10px]" style={{ color: '#8892A5' }}>{group} ({profile.group_percentages[group]}%)</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============ DATA TAB ============ */
function DataTab({ schema }: { schema: any }) {
  if (!schema) return <div className="card text-center py-8 text-sm" style={{ color: '#5A6478' }}>No schema data available.</div>;

  return (
    <div className="space-y-3">
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Column Analysis — {schema.column_count} columns, {schema.row_count?.toLocaleString()} rows
        </div>
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Unique</th>
              <th>Nulls</th>
              <th>Sensitivity</th>
              <th>Auto-Flagged</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {schema.columns?.map((col: any) => (
              <tr key={col.name}>
                <td className="font-medium">{col.name}</td>
                <td className="text-xs" style={{ color: '#8892A5' }}>{col.dtype}</td>
                <td>{col.unique_count}</td>
                <td style={{ color: col.null_count > 0 ? '#FF9A00' : '#5A6478' }}>{col.null_count}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span style={{ color: col.sensitivity_score >= 0.65 ? '#FF165D' : col.sensitivity_score > 0 ? '#FF9A00' : '#5A6478' }}>
                      {col.sensitivity_score.toFixed(2)}
                    </span>
                    <div className="w-12 h-1.5 rounded-full" style={{ background: '#1A1F2B' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${col.sensitivity_score * 100}%`,
                        background: col.sensitivity_score >= 0.65 ? '#FF165D' : col.sensitivity_score > 0 ? '#FF9A00' : '#353D4F'
                      }} />
                    </div>
                  </div>
                </td>
                <td>
                  {col.auto_flagged ? (
                    <span className="badge badge-critical">YES</span>
                  ) : (
                    <span className="text-xs" style={{ color: '#5A6478' }}>—</span>
                  )}
                </td>
                <td className="text-xs" style={{ color: '#8892A5' }}>{col.flagged_reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ PROXIES TAB ============ */
function ProxiesTab({ proxies }: { proxies: any[] }) {
  if (proxies.length === 0) {
    return (
      <div className="card flex items-center gap-3 text-center" style={{ background: 'rgba(6, 214, 160, 0.05)', borderColor: 'rgba(6, 214, 160, 0.2)' }}>
        <CheckCircle2 size={20} style={{ color: '#06D6A0' }} />
        <div>
          <div className="text-sm font-medium" style={{ color: '#06D6A0' }}>No proxy variables detected</div>
          <div className="text-xs" style={{ color: '#8892A5' }}>No columns show significant statistical association with protected attributes.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Proxy Variable Detection — {proxies.length} found
        </div>
        <table>
          <thead>
            <tr>
              <th>Proxy Column</th>
              <th>Correlated With</th>
              <th>Score</th>
              <th>Method</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {proxies.map((pv: any, i: number) => (
              <tr key={i}>
                <td className="font-medium">{pv.proxy_column}</td>
                <td>{pv.protected_column}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span style={{ color: pv.association_score >= 0.5 ? '#FF165D' : '#FF9A00' }}>
                      {pv.association_score.toFixed(2)}
                    </span>
                    <div className="w-12 h-1.5 rounded-full" style={{ background: '#1A1F2B' }}>
                      <div className="h-full rounded-full" style={{ width: `${pv.association_score * 100}%`, background: pv.risk_level === 'HIGH' ? '#FF165D' : '#FF9A00' }} />
                    </div>
                  </div>
                </td>
                <td className="text-xs" style={{ color: '#8892A5' }}>{pv.method}</td>
                <td><span className={`badge badge-${pv.risk_level.toLowerCase()}`}>{pv.risk_level}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Explanations */}
      <div className="card space-y-2">
        <h3 className="text-xs font-semibold" style={{ color: '#8892A5' }}>Detailed Explanations</h3>
        {proxies.map((pv: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-sm" style={{ color: '#C8CCD4' }}>
            <AlertTriangle size={14} style={{ color: pv.risk_level === 'HIGH' ? '#FF165D' : '#FF9A00', marginTop: 2, flexShrink: 0 }} />
            <span>{pv.explanation}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ PROFILES TAB ============ */
function ProfilesTab({ profiles }: { profiles: any[] }) {
  if (profiles.length === 0) {
    return <div className="card text-center py-8 text-sm" style={{ color: '#5A6478' }}>No profile data available.</div>;
  }

  return (
    <div className="space-y-4">
      {profiles.map((profile: any, idx: number) => (
        <div key={idx} className="card space-y-3">
          <div className="flex items-center gap-2">
            <Users size={16} style={{ color: '#3EC1D3' }} />
            <h3 className="text-sm font-semibold">{profile.attribute}</h3>
            {profile.imbalance_warning && (
              <span className="badge badge-high">IMBALANCED ({profile.imbalance_ratio}x)</span>
            )}
          </div>

          {/* Group distribution */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(profile.group_counts as Record<string, number>).map(([group, count]) => {
              const pct = profile.group_percentages[group];
              return (
                <div key={group} className="flex-1 min-w-[120px] p-3 rounded-lg" style={{ background: '#1A1F2B', border: '1px solid #2A3040' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: '#8892A5' }}>{group}</div>
                  <div className="text-lg font-bold" style={{ color: '#E8EAED' }}>{(count as number).toLocaleString()}</div>
                  <div className="w-full h-1.5 rounded-full mt-1" style={{ background: '#2A3040' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#3EC1D3' }} />
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: '#5A6478' }}>{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Label distribution per group */}
          {profile.label_distribution_per_group && Object.keys(profile.label_distribution_per_group).length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: '#8892A5' }}>Outcome Rate by Group</div>
              <div className="space-y-1.5">
                {Object.entries(profile.label_distribution_per_group as Record<string, any>).map(([group, rates]) => (
                  <div key={group} className="flex items-center gap-3">
                    <span className="text-xs w-24 truncate" style={{ color: '#8892A5' }}>{group}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden flex" style={{ background: '#1A1F2B' }}>
                      <div className="h-full flex items-center justify-center text-[9px] font-bold"
                        style={{ width: `${(rates as any).positive}%`, background: '#06D6A0', color: '#0B0E14' }}>
                        {(rates as any).positive}%
                      </div>
                      <div className="h-full flex items-center justify-center text-[9px] font-bold"
                        style={{ width: `${(rates as any).negative}%`, background: '#FF165D', color: '#fff' }}>
                        {(rates as any).negative}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SMOTE recommendations */}
          {profile.smote_recommendations && Object.keys(profile.smote_recommendations).length > 0 && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(62, 193, 211, 0.05)', border: '1px solid rgba(62, 193, 211, 0.15)' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: '#3EC1D3' }}>
                <Zap size={11} className="inline mr-1" />
                SMOTE Oversampling Recommendations
              </div>
              {Object.entries(profile.smote_recommendations as Record<string, any>).map(([group, rec]) => (
                <div key={group} className="text-sm" style={{ color: '#C8CCD4' }}>
                  <strong style={{ color: '#FF9A00' }}>{group}</strong>: Add {(rec as any).synthetic_samples_needed.toLocaleString()} synthetic samples
                  <span className="text-xs ml-2" style={{ color: '#5A6478' }}>({(rec as any).current_count} → {(rec as any).target_count})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---- Helper ---- */
function MetricMini({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card">
      <div className="text-[11px] font-medium mb-1" style={{ color: '#8892A5' }}>{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px]" style={{ color: '#5A6478' }}>{sub}</div>
    </div>
  );
}
