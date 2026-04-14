'use client';

import TopNav from '@/components/layout/TopNav';
import { MOCK_RESULTS, MOCK_NARRATIVES, getScoreColor, getGradeColor, getSeverityColor } from '@/lib/mock-data';
import { useState, use } from 'react';
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

// Progress steps for loading state
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
  { key: 'model', label: 'Model Analysis', icon: Brain },
  { key: 'explainability', label: 'Explainability', icon: Zap },
  { key: 'intersectional', label: 'Intersectional', icon: Grid3x3 },
  { key: 'fixes', label: 'Fixes', icon: Wrench },
  { key: 'legal', label: 'Legal', icon: Scale },
];

export default function AuditResultsPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params);
  const [tab, setTab] = useState('overview');
  const [stakeholder, setStakeholder] = useState<'technical' | 'executive' | 'legal'>('technical');

  // Simulate: for 'aud-003' show loading, else show results
  const isProcessing = auditId === 'aud-003';
  const r = MOCK_RESULTS;

  if (isProcessing) {
    return (
      <>
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Insurance Risk Scoring' }]} />
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, #3EC1D3, #FF9A00)' }}>
            <Eye size={28} color="#0B0E14" className="animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Analyzing your data</h2>
          <p className="text-sm mb-6" style={{ color: '#8892A5' }}>This usually takes 30–60 seconds</p>
          <div className="w-full max-w-sm space-y-2">
            {PIPELINE_STEPS.map((step) => {
              const status = step.key === 'data_bias_scan' ? 'running' : 
                ['schema_parsing', 'proxy_detection', 'data_profiling'].includes(step.key) ? 'complete' : 'pending';
              return (
                <div key={step.key} className="flex items-center gap-3 py-1.5 px-3 rounded-lg" style={{ background: '#141820' }}>
                  {status === 'complete' && <CheckCircle2 size={14} style={{ color: '#06D6A0' }} />}
                  {status === 'running' && <Loader2 size={14} style={{ color: '#FF9A00' }} className="animate-spin" />}
                  {status === 'pending' && <Clock size={14} style={{ color: '#353D4F' }} />}
                  <span className="text-sm" style={{ color: status === 'pending' ? '#5A6478' : '#E8EAED' }}>{step.label}</span>
                  {status === 'complete' && <span className="ml-auto text-[10px]" style={{ color: '#06D6A0' }}>Done</span>}
                  {status === 'running' && <span className="ml-auto text-[10px] badge-processing px-1.5 rounded" style={{ color: '#FF9A00' }}>Running</span>}
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Q1 Hiring Pipeline Audit' }]} />

      <div className="flex-1 p-4 space-y-3 animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Score circle */}
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88" className="score-ring">
              <circle cx="44" cy="44" r="38" fill="none" stroke="#1A1F2B" strokeWidth="6" />
              <circle
                cx="44" cy="44" r="38"
                fill="none"
                stroke={getScoreColor(r.fairnessScore)}
                strokeWidth="6"
                strokeDasharray={`${(r.fairnessScore / 100) * 239} 239`}
                strokeLinecap="round"
                transform="rotate(-90 44 44)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold" style={{ color: getScoreColor(r.fairnessScore) }}>{r.fairnessScore}</span>
              <span className="text-[9px]" style={{ color: '#5A6478' }}>/ 100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-bold">Q1 Hiring Pipeline Audit</h1>
              <span className="text-2xl font-black px-3 py-0.5 rounded-lg"
                style={{ background: `${getGradeColor(r.letterGrade)}15`, color: getGradeColor(r.letterGrade) }}>
                {r.letterGrade}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: '#8892A5' }}>
              <span>Hiring / Recruitment</span>
              <span>•</span>
              <span>Mar 15, 2026</span>
              <span>•</span>
              <span>10,000 rows</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Stakeholder Toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #2A3040' }}>
              {(['technical', 'executive', 'legal'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setStakeholder(mode)}
                  className="px-3 py-1.5 text-xs font-medium capitalize transition-all cursor-pointer"
                  style={{
                    background: stakeholder === mode ? '#3EC1D3' : '#141820',
                    color: stakeholder === mode ? '#0B0E14' : '#8892A5',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
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

        {/* TAB CONTENT */}
        {tab === 'overview' && <OverviewTab r={r} stakeholder={stakeholder} />}
        {tab === 'data' && <DataTab r={r} />}
        {tab === 'model' && <ModelTab r={r} />}
        {tab === 'explainability' && <ExplainabilityTab r={r} />}
        {tab === 'intersectional' && <IntersectionalTab r={r} />}
        {tab === 'fixes' && <FixesTab r={r} />}
        {tab === 'legal' && <LegalTab r={r} />}
      </div>
    </>
  );
}

/* ============= TAB COMPONENTS ============= */

function OverviewTab({ r, stakeholder }: { r: typeof MOCK_RESULTS; stakeholder: string }) {
  return (
    <div className="space-y-3">
      {/* Metric summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricMini label="Worst DI Ratio" value="0.58" sub="Race — below 0.80" color="#FF165D" />
        <MetricMini label="Equalized Odds" value="FAIL" sub="FPR gap: 0.13" color="#FF9A00" />
        <MetricMini label="Proxy Variables" value="3" sub="2 HIGH, 1 MEDIUM" color="#FF9A00" />
        <MetricMini label="Feature Laundering" value="DETECTED" sub="Race reconstructable at 82%" color="#FF165D" />
      </div>

      {/* Historical Harm */}
      {r.historicalHarm && (
        <div className="card" style={{ borderColor: 'rgba(255, 22, 93, 0.3)', background: 'rgba(255, 22, 93, 0.03)' }}>
          <div className="flex items-start gap-3">
            <Users size={20} style={{ color: '#FF165D', marginTop: 2 }} />
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#FF165D' }}>Historical Harm Estimate</div>
              <div className="text-2xl font-bold mb-1" style={{ color: '#FF165D' }}>
                {r.historicalHarm.estimatedIndividualsHarmed.toLocaleString()}
              </div>
              <div className="text-sm">{r.historicalHarm.headline}</div>
              <div className="text-[10px] mt-1" style={{ color: '#5A6478' }}>{r.historicalHarm.disclaimer}</div>
            </div>
          </div>
        </div>
      )}

      {/* Narrative */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={14} style={{ color: '#3EC1D3' }} />
          <span className="text-xs font-semibold" style={{ color: '#3EC1D3' }}>
            Gemini AI Narrative — {stakeholder.charAt(0).toUpperCase() + stakeholder.slice(1)} View
          </span>
        </div>
        <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed" style={{ color: '#C8CCD4' }}>
          {MOCK_NARRATIVES[stakeholder].split('\n').map((line, i) => {
            if (line.startsWith('## ')) return <h3 key={i} className="text-sm font-bold mt-3 mb-1" style={{ color: '#E8EAED' }}>{line.replace('## ', '')}</h3>;
            if (line.startsWith('### ')) return <h4 key={i} className="text-xs font-bold mt-2 mb-1" style={{ color: '#3EC1D3' }}>{line.replace('### ', '')}</h4>;
            if (line.startsWith('- **')) return <div key={i} className="text-sm my-0.5">{line.replace(/\*\*/g, '')}</div>;
            if (line.startsWith('🔴') || line.startsWith('🟠') || line.startsWith('🟢')) return <div key={i} className="text-sm my-1">{line}</div>;
            if (line.trim() === '') return <br key={i} />;
            return <p key={i} className="text-sm my-0.5">{line.replace(/\*\*/g, '')}</p>;
          })}
        </div>
      </div>
    </div>
  );
}

function DataTab({ r }: { r: typeof MOCK_RESULTS }) {
  return (
    <div className="space-y-3">
      {/* DI table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Disparate Impact Analysis
        </div>
        <table>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Privileged</th>
              <th>DI Ratio</th>
              <th>SPD</th>
              <th>Pos. Rate (Priv)</th>
              <th>Pos. Rate (Unpriv)</th>
              <th>Verdict</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(r.dataBias).map((db) => (
              <tr key={db.attribute}>
                <td className="font-medium">{db.attribute}</td>
                <td>{db.privilegedGroup}</td>
                <td style={{ color: db.metrics.disparateImpact < 0.8 ? '#FF165D' : '#06D6A0' }}>
                  {db.metrics.disparateImpact.toFixed(2)}
                </td>
                <td style={{ color: Math.abs(db.metrics.statisticalParityDifference) > 0.1 ? '#FF9A00' : '#06D6A0' }}>
                  {db.metrics.statisticalParityDifference.toFixed(2)}
                </td>
                <td>{(db.metrics.positiveRatePrivileged * 100).toFixed(0)}%</td>
                <td>{(db.metrics.positiveRateUnprivileged * 100).toFixed(0)}%</td>
                <td><span className={`badge ${db.verdict === 'FAIL' ? 'badge-critical' : 'badge-pass'}`}>{db.verdict}</span></td>
                <td><span className={`badge badge-${db.severity.toLowerCase()}`}>{db.severity}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Proxy Variables */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Proxy Variable Detection
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
            {r.proxyVariables.map((pv, i) => (
              <tr key={i}>
                <td className="font-medium">{pv.proxyColumn}</td>
                <td>{pv.protectedColumn}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span style={{ color: pv.associationScore >= 0.5 ? '#FF165D' : '#FF9A00' }}>
                      {pv.associationScore.toFixed(2)}
                    </span>
                    <div className="w-12 h-1.5 rounded-full" style={{ background: '#1A1F2B' }}>
                      <div className="h-full rounded-full" style={{ width: `${pv.associationScore * 100}%`, background: pv.riskLevel === 'HIGH' ? '#FF165D' : '#FF9A00' }} />
                    </div>
                  </div>
                </td>
                <td className="text-xs" style={{ color: '#8892A5' }}>{pv.method}</td>
                <td><span className={`badge badge-${pv.riskLevel.toLowerCase()}`}>{pv.riskLevel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelTab({ r }: { r: typeof MOCK_RESULTS }) {
  if (!r.modelBias) return <div className="card text-center py-8 text-sm" style={{ color: '#5A6478' }}>No model was provided for this audit.</div>;
  return (
    <div className="space-y-3">
      {/* Flip Rates */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Counterfactual Flip Rates
        </div>
        <table>
          <thead><tr><th>Attribute</th><th>Transition</th><th>Flip Rate</th><th>Verdict</th></tr></thead>
          <tbody>
            {Object.entries(r.modelBias.flipRates).map(([attr, data]) =>
              Object.entries(data.flipRates).map(([transition, rate], i) => (
                <tr key={`${attr}-${transition}`}>
                  {i === 0 && <td rowSpan={Object.keys(data.flipRates).length} className="font-medium">{attr}</td>}
                  <td className="text-sm">{transition}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span style={{ color: rate > 0.1 ? '#FF165D' : '#06D6A0' }}>{(rate * 100).toFixed(0)}%</span>
                      <div className="w-16 h-1.5 rounded-full" style={{ background: '#1A1F2B' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(rate * 200, 100)}%`, background: rate > 0.1 ? '#FF165D' : '#06D6A0' }} />
                      </div>
                    </div>
                  </td>
                  {i === 0 && <td rowSpan={Object.keys(data.flipRates).length}><span className={`badge ${data.verdict === 'FAIL' ? 'badge-critical' : 'badge-pass'}`}>{data.verdict}</span></td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Equalized Odds */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Equalized Odds
        </div>
        <table>
          <thead><tr><th>Attribute</th><th>Group</th><th>FPR</th><th>FNR</th><th>Precision</th></tr></thead>
          <tbody>
            {Object.entries(r.modelBias.equalizedOdds).map(([attr, groups]) =>
              Object.entries(groups).map(([group, vals], i) => (
                <tr key={`${attr}-${group}`}>
                  {i === 0 && <td rowSpan={Object.keys(groups).length} className="font-medium">{attr}</td>}
                  <td>{group}</td>
                  <td style={{ color: vals.fpr > 0.1 ? '#FF9A00' : '#06D6A0' }}>{(vals.fpr * 100).toFixed(0)}%</td>
                  <td style={{ color: vals.fnr > 0.2 ? '#FF165D' : '#06D6A0' }}>{(vals.fnr * 100).toFixed(0)}%</td>
                  <td>{(vals.precision * 100).toFixed(0)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Flip Sensitivity */}
      {r.flipSensitivity && (
        <div className="card" style={{ borderColor: 'rgba(255, 154, 0, 0.2)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} style={{ color: '#FF9A00' }} />
            <span className="text-xs font-semibold" style={{ color: '#FF9A00' }}>Flip Sensitivity</span>
          </div>
          <div className="text-sm mb-1">{r.flipSensitivity.explanation}</div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="text-center p-2 rounded-lg" style={{ background: '#1A1F2B' }}>
              <div className="text-lg font-bold" style={{ color: '#FF9A00' }}>{r.flipSensitivity.mostVulnerablePercentage}%</div>
              <div className="text-[10px]" style={{ color: '#5A6478' }}>Vulnerable</div>
            </div>
            <div className="text-center p-2 rounded-lg" style={{ background: '#1A1F2B' }}>
              <div className="text-lg font-bold" style={{ color: '#3EC1D3' }}>{r.flipSensitivity.meanFlipCount}</div>
              <div className="text-[10px]" style={{ color: '#5A6478' }}>Avg Flips</div>
            </div>
            <div className="text-center p-2 rounded-lg" style={{ background: '#1A1F2B' }}>
              <div className="text-lg font-bold" style={{ color: '#E8EAED' }}>{r.flipSensitivity.mostVulnerableCount.toLocaleString()}</div>
              <div className="text-[10px]" style={{ color: '#5A6478' }}>Individuals</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExplainabilityTab({ r }: { r: typeof MOCK_RESULTS }) {
  if (!r.explainability) return <div className="card text-center py-8 text-sm" style={{ color: '#5A6478' }}>Explainability data not available.</div>;
  return (
    <div className="space-y-3">
      {/* SHAP by group */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          SHAP Values by Demographic Group
        </div>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              {Object.keys(r.explainability.shapByGroup).map((g) => <th key={g}>{g}</th>)}
              <th>Disparity</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(Object.values(r.explainability.shapByGroup)[0]).map((feat) => {
              const vals = Object.entries(r.explainability!.shapByGroup).map(([, v]) => v[feat]);
              const max = Math.max(...vals);
              const min = Math.min(...vals);
              const ratio = min > 0 ? max / min : 0;
              return (
                <tr key={feat}>
                  <td className="font-medium">{feat}</td>
                  {Object.values(r.explainability!.shapByGroup).map((gv, i) => (
                    <td key={i}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{gv[feat].toFixed(3)}</span>
                        <div className="w-12 h-1.5 rounded-full" style={{ background: '#1A1F2B' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(gv[feat] * 200, 100)}%`, background: '#3EC1D3' }} />
                        </div>
                      </div>
                    </td>
                  ))}
                  <td>
                    {ratio > 2 ? (
                      <span className="badge badge-high">{ratio.toFixed(1)}x</span>
                    ) : (
                      <span className="text-xs" style={{ color: '#5A6478' }}>{ratio.toFixed(1)}x</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Feature Laundering */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Feature Laundering Detection
        </div>
        {r.featureLaundering.map((fl, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3" style={{ borderBottom: i < r.featureLaundering.length - 1 ? '1px solid rgba(42,48,64,0.5)' : 'none' }}>
            {fl.launderingDetected ? <AlertTriangle size={16} style={{ color: '#FF165D', marginTop: 2 }} /> : <CheckCircle2 size={16} style={{ color: '#06D6A0', marginTop: 2 }} />}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{fl.protectedAttribute}</span>
                <span className={`badge badge-${fl.severity.toLowerCase()}`}>{fl.severity}</span>
              </div>
              <div className="text-sm" style={{ color: '#8892A5' }}>{fl.explanation}</div>
              <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: '#5A6478' }}>
                <span>Accuracy: {(fl.reconstructionAccuracy * 100).toFixed(0)}%</span>
                <span>Baseline: {(fl.baselineAccuracy * 100).toFixed(0)}%</span>
                <span>Lift: {(fl.liftOverBaseline * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntersectionalTab({ r }: { r: typeof MOCK_RESULTS }) {
  return (
    <div className="space-y-3">
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          Intersectional Fairness — Gender × Race
        </div>
        {/* Heatmap Grid */}
        <div className="p-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'auto repeat(3, 1fr)' }}>
            <div />
            {['White', 'Black', 'Hispanic'].map((r) => (
              <div key={r} className="text-center text-xs font-semibold" style={{ color: '#8892A5' }}>{r}</div>
            ))}
            {['Male', 'Female'].map((g) => (
              <>
                <div key={g} className="text-xs font-semibold flex items-center" style={{ color: '#8892A5' }}>{g}</div>
                {['White', 'Black', 'Hispanic'].map((race) => {
                  const cell = r.intersectional.find(
                    (x) => x.valA === g && x.valB === race
                  );
                  const di = cell?.diVsOverall || 0;
                  const bg = di >= 0.8 ? 'rgba(6, 214, 160, 0.15)' : di >= 0.6 ? 'rgba(255, 154, 0, 0.15)' : 'rgba(255, 22, 93, 0.15)';
                  const color = di >= 0.8 ? '#06D6A0' : di >= 0.6 ? '#FF9A00' : '#FF165D';
                  return (
                    <div key={`${g}-${race}`} className="rounded-lg p-3 text-center" style={{ background: bg, border: `1px solid ${color}30` }}>
                      <div className="text-lg font-bold" style={{ color }}>{di?.toFixed(2) || '—'}</div>
                      <div className="text-[10px]" style={{ color: '#8892A5' }}>
                        n={cell?.sampleSize.toLocaleString()} • {((cell?.positiveRate || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
          All Intersectional Groups (sorted by DI)
        </div>
        <table>
          <thead><tr><th>Group</th><th>Sample Size</th><th>Positive Rate</th><th>DI vs Overall</th><th>Severity</th></tr></thead>
          <tbody>
            {r.intersectional.map((int, i) => (
              <tr key={i}>
                <td className="font-medium text-sm">{int.group}</td>
                <td>{int.sampleSize.toLocaleString()}</td>
                <td>{(int.positiveRate * 100).toFixed(0)}%</td>
                <td style={{ color: getSeverityColor(int.severity) }}>{int.diVsOverall?.toFixed(2) || '—'}</td>
                <td><span className={`badge badge-${int.severity.toLowerCase()}`}>{int.severity}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FixesTab({ r }: { r: typeof MOCK_RESULTS }) {
  const fixes = [
    { title: 'Apply SMOTE Rebalancing', severity: 'HIGH', technique: 'SMOTE Oversampling', improvement: '+14 pts', accuracy: '-1.2%', desc: 'Add synthetic samples for underrepresented groups to balance training data.' },
    { title: 'Remove Proxy Variables', severity: 'CRITICAL', technique: 'Feature Removal', improvement: '+8 pts', accuracy: '-3.5%', desc: 'Remove zip_code and surname from feature set to prevent proxy discrimination.' },
    { title: 'Threshold Adjustment', severity: 'HIGH', technique: 'Decision Threshold', improvement: '+11 pts', accuracy: '-2.1%', desc: 'Set group-specific decision thresholds to equalize positive rates.' },
    { title: 'Reweighting Training', severity: 'MEDIUM', technique: 'Sample Reweighting', improvement: '+6 pts', accuracy: '-0.8%', desc: 'Apply inverse propensity weights during model training.' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {fixes.map((fix, i) => (
          <div key={i} className="card">
            <div className="flex items-center gap-2 mb-2">
              <span className={`badge badge-${fix.severity.toLowerCase()}`}>{fix.severity}</span>
              <h3 className="text-sm font-semibold">{fix.title}</h3>
            </div>
            <p className="text-xs mb-3" style={{ color: '#8892A5' }}>{fix.desc}</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2 py-1 rounded" style={{ background: 'rgba(62, 193, 211, 0.1)', color: '#3EC1D3' }}>{fix.technique}</span>
              <span style={{ color: '#06D6A0' }}>Fairness {fix.improvement}</span>
              <span style={{ color: '#FF9A00' }}>Accuracy {fix.accuracy}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalTab({ r }: { r: typeof MOCK_RESULTS }) {
  return (
    <div className="space-y-3">
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid #2A3040' }}>
          <span className="text-xs font-semibold" style={{ color: '#8892A5' }}>Regulation Mapping</span>
          <button className="btn btn-secondary btn-sm">
            <Download size={12} /> Export Compliance JSON
          </button>
        </div>
        {r.regulationMap.map((reg, i) => (
          <div key={i} className="px-4 py-3" style={{ borderBottom: i < r.regulationMap.length - 1 ? '1px solid rgba(42,48,64,0.5)' : 'none' }}>
            <div className="flex items-center gap-2 mb-1">
              <Scale size={13} style={{ color: '#FF9A00' }} />
              <span className="text-sm font-semibold">{reg.regulation}</span>
              <span className={`badge badge-${reg.liability.includes('CRITICAL') ? 'critical' : 'high'}`}>{reg.liability.split('—')[0].trim()}</span>
            </div>
            <div className="text-xs font-medium mb-1" style={{ color: '#3EC1D3' }}>{reg.clause}</div>
            <div className="text-sm mb-2" style={{ color: '#8892A5' }}>{reg.description}</div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#FF9A00' }}>
              <ArrowRight size={10} />
              <span className="font-medium">{reg.requiredAction}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Whistleblower */}
      <div className="card flex items-center gap-3" style={{ borderColor: 'rgba(246, 247, 215, 0.2)' }}>
        <Shield size={18} style={{ color: '#F6F7D7' }} />
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: '#F6F7D7' }}>Whistleblower Export</div>
          <div className="text-xs" style={{ color: '#8892A5' }}>Generate anonymized report with SHA-256 integrity hash</div>
        </div>
        <button className="btn btn-secondary btn-sm">
          <Download size={12} /> Export Anonymized Report
        </button>
      </div>
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
