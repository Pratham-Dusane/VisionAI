'use client';

import TopNav from '@/components/layout/TopNav';
import {
  getAudit,
  listAudits,
  exportPDF,
  exportLegalJSON,
  exportAnonJSON,
  runRedTeamAudit,
  getSampleRow,
  predictAuditDecision,
  findMinimumFlip,
} from '@/lib/api';
import { useState, useEffect, use } from 'react';
import {
  Download, AlertTriangle, Shield, BarChart3,
  Brain, Wrench, Scale, CheckCircle2, Loader2, XCircle,
  Zap, Users, Eye, FileText, Layers, Info, Sparkles,
} from 'lucide-react';
import GroupDistributionChart from '@/components/charts/GroupDistributionChart';
import LabelDistributionChart from '@/components/charts/LabelDistributionChart';
import ProxyNetworkGraph from '@/components/charts/ProxyNetworkGraph';
import EqualizedOddsChart from '@/components/charts/EqualizedOddsChart';
import PredictiveParityChart from '@/components/charts/PredictiveParityChart';
import ShapSummaryChart from '@/components/charts/ShapSummaryChart';
import IntersectionalHeatmap from '@/components/charts/IntersectionalHeatmap';
import ParetoFrontier from '@/components/charts/ParetoFrontier';
import AuditTrailTimeline from '@/components/audit/AuditTrailTimeline';
import StakeholderToggle, { StakeholderMode } from '@/components/audit/StakeholderToggle';

const BASE_TABS = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'data', label: 'Data Analysis', icon: BarChart3 },
  { key: 'model', label: 'Model Analysis', icon: Brain },
  { key: 'intersectional', label: 'Intersectional', icon: Layers },
  { key: 'explainability', label: 'Explainability', icon: Zap },
  { key: 'narratives', label: 'AI Narratives', icon: Sparkles },
  { key: 'fixes', label: 'Fixes', icon: Wrench },
  { key: 'legal', label: 'Legal', icon: Scale },
];

const MODE_TAB_KEYS: Record<StakeholderMode, string[]> = {
  technical: ['overview', 'data', 'model', 'intersectional', 'explainability', 'narratives', 'fixes', 'legal'],
  executive: ['overview', 'narratives', 'legal'],
  legal: ['overview', 'intersectional', 'legal', 'narratives'],
};

const MODE_DEFAULT_TAB: Record<StakeholderMode, string> = {
  technical: 'model',
  executive: 'overview',
  legal: 'legal',
};

function gradeColor(g: string) {
  const m: Record<string, string> = { A: 'var(--grade-a)', B: 'var(--grade-b)', C: 'var(--grade-c)', D: 'var(--grade-d)', F: 'var(--grade-f)' };
  return m[g] || 'var(--muted)';
}
function scoreColor(s: number) {
  if (s >= 80) return 'var(--grade-a)';
  if (s >= 65) return 'var(--grade-b)';
  if (s >= 50) return 'var(--grade-c)';
  if (s >= 35) return 'var(--grade-d)';
  return 'var(--grade-f)';
}
function sevBadge(s: string) {
  const m: Record<string, string> = { PASS: 'badge-pass', HIGH: 'badge-high', CRITICAL: 'badge-critical', MEDIUM: 'badge-medium', FAIL: 'badge-critical', LOW_CONFIDENCE: 'badge-neutral' };
  return m[s] || '';
}

function getTabs(mode: StakeholderMode) {
  const allowed = new Set(MODE_TAB_KEYS[mode]);
  return BASE_TABS.filter((t) => allowed.has(t.key));
}

function getDefaultTabForMode(mode: StakeholderMode) {
  return MODE_DEFAULT_TAB[mode];
}

function riskLevelFromScore(score: number) {
  if (score >= 80) return 'LOW';
  if (score >= 60) return 'MEDIUM';
  return 'HIGH';
}

function hasCriticalLegalTrigger(regs: any[]) {
  return regs.some((r: any) => {
    const complianceRisk = String(r?.compliance_risk || '').toUpperCase();
    const liability = String(r?.liability || '').toUpperCase();
    return complianceRisk.includes('CRITICAL') || liability.includes('CRITICAL');
  });
}

function estimateInrFineBand(score: number, threshold: number, criticalLegal: boolean) {
  if (criticalLegal) {
    return { min: 25000000, max: 50000000, rationale: 'Critical compliance trigger active' };
  }
  if (score < threshold * 100) {
    return { min: 10000000, max: 25000000, rationale: 'Fairness below deployment threshold' };
  }
  if (score < 60) {
    return { min: 3000000, max: 10000000, rationale: 'Elevated fairness risk band' };
  }
  if (score < 80) {
    return { min: 1000000, max: 3000000, rationale: 'Moderate fairness risk band' };
  }
  return { min: 0, max: 1000000, rationale: 'Low fairness risk band' };
}

function formatInr(value: number) {
  return `INR ${new Intl.NumberFormat('en-IN').format(value)}`;
}

function isIdentifierField(fieldName: string) {
  const normalized = fieldName.toLowerCase();
  return normalized === 'id'
    || normalized.endsWith('_id')
    || normalized.includes('applicant_id')
    || normalized.includes('record_id')
    || normalized.includes('user_id')
    || normalized.includes('customer_id');
}

function narrativeToPlainText(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*]\s+/, '• ')
      .replace(/^\d+\.\s+/, '• ')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractNarrativeTldr(markdown: string, mode: StakeholderMode, maxChars = 360) {
  const plain = narrativeToPlainText(markdown || '');
  if (!plain) return 'Narrative summary is not available yet.';

  const narrative = plain
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = narrative
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);

  if (sentences.length === 0) {
    return narrative.length <= maxChars ? narrative : `${narrative.slice(0, maxChars).trim()}...`;
  }

  const keywordMap: Record<StakeholderMode, string[]> = {
    executive: ['fairness', 'risk', 'business', 'deployment', 'recommendation', 'liability', 'fine', 'impact'],
    legal: ['compliance', 'regulation', 'clause', 'liability', 'violation', 'required action', 'legal', 'article'],
    technical: ['disparate impact', 'flip', 'equalized odds', 'proxy', 'feature', 'model', 'threshold', 'bias'],
  };
  const modeKeywords = keywordMap[mode] || [];
  const severityHints = ['critical', 'high', 'fail', 'violation', 'no-go'];

  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = 0;

    for (const keyword of modeKeywords) {
      if (lower.includes(keyword)) score += 3;
    }
    for (const hint of severityHints) {
      if (lower.includes(hint)) score += 2;
    }
    if (/\d/.test(sentence)) score += 1;
    if (/%|inr|usd|di|spd|fpr|fnr/i.test(sentence)) score += 1;

    // Mild position prior keeps context but does not dominate.
    score += Math.max(0, 1.5 - index * 0.1);

    return { sentence, score };
  });

  const selected: string[] = [];
  const usedTokens = new Set<string>();
  for (const item of [...scored].sort((a, b) => b.score - a.score)) {
    const tokens = item.sentence.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    const overlap = tokens.filter((t) => usedTokens.has(t)).length;
    if (selected.length > 0 && overlap / Math.max(tokens.length, 1) > 0.6) continue;

    selected.push(item.sentence);
    tokens.forEach((t) => usedTokens.add(t));

    const joined = selected.join(' ');
    if (joined.length >= maxChars || selected.length >= 3) break;
  }

  const summary = selected.join(' ').trim();
  if (!summary) {
    return narrative.length <= maxChars ? narrative : `${narrative.slice(0, maxChars).trim()}...`;
  }
  if (summary.length <= maxChars) return summary;

  const clipped = summary.slice(0, maxChars);
  const cutoff = clipped.lastIndexOf('. ');
  if (cutoff > 120) return clipped.slice(0, cutoff + 1).trim();
  return `${clipped.trim()}...`;
}

function asciiOnly(text: string) {
  return text
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2022/g, '- ')
    .replace(/[^	\u000A\u000D\u0020-\u007E]/g, '');
}

function escapePdfText(text: string) {
  return asciiOnly(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdf(text: string, title = 'VisionAI Narrative') {
  const normalized = asciiOnly(text).replace(/\r\n/g, '\n');
  const maxCharsPerLine = 86;
  const linesPerPage = 46;

  const wrapLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return [''];
    if (trimmed.length <= maxCharsPerLine) return [trimmed];

    const words = trimmed.split(/\s+/);
    const wrapped: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if ((current + ' ' + word).length <= maxCharsPerLine) {
        current += ` ${word}`;
      } else {
        wrapped.push(current);
        current = word;
      }
    }

    if (current) wrapped.push(current);
    return wrapped;
  };

  const wrappedLines = normalized
    .split('\n')
    .flatMap((line) => wrapLine(line))
    .slice(0, 500);

  const pages: string[][] = [];
  for (let index = 0; index < wrappedLines.length; index += linesPerPage) {
    pages.push(wrappedLines.slice(index, index + linesPerPage));
  }
  if (pages.length === 0) pages.push(['']);

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    `<< /Title (${escapePdfText(title)}) /Creator (VisionAI) /Producer (VisionAI) >>`,
  ];
  const fontObjectId = 4 + pages.length * 2;

  pages.forEach((pageLines, pageIndex) => {
    const contentLines = [
      'BT',
      '/F1 12 Tf',
      '14 TL',
      '72 760 Td',
      ...pageLines.map((line, index) => {
        const safeLine = escapePdfText(line || ' ');
        return index === 0 ? `(${safeLine}) Tj` : `T* (${safeLine}) Tj`;
      }),
      'ET',
    ];
    const contentStream = contentLines.join('\n');
    const pageObjectId = 4 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pdfParts: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(pdfParts.join('').length);
    pdfParts.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }

  const xrefStart = pdfParts.join('').length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdfParts.join(''), xref, trailer], { type: 'application/pdf' });
}

export default function AuditResultsPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params);
  const [tab, setTab] = useState(getDefaultTabForMode('technical'));
  const [stakeholderMode, setStakeholderMode] = useState<StakeholderMode>('technical');
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redTeam, setRedTeam] = useState<any>(null);
  const [redTeamLoading, setRedTeamLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const data = await getAudit(auditId);
        if (cancelled) return;
        setAudit(data);
        setRedTeam(data.redTeamLatest || null);
        setLoading(false);
        // Keep polling while PROCESSING
        if (data.status === 'PROCESSING') {
          timer = setTimeout(poll, 3000);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed');
          setLoading(false);
        }
      }
    }
    poll();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [auditId]);

  useEffect(() => {
    setTab(getDefaultTabForMode(stakeholderMode));
  }, [stakeholderMode]);

  useEffect(() => {
    const allowed = MODE_TAB_KEYS[stakeholderMode];
    if (!allowed.includes(tab)) {
      setTab(getDefaultTabForMode(stakeholderMode));
    }
  }, [stakeholderMode, tab]);

  // Show processing state - skeleton shimmer layout
  if (loading || (audit && audit.status === 'PROCESSING')) {
    const pipeline = audit?.pipeline || {};
    const steps = Object.entries(pipeline);
    return (
      <>
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: audit?.name || 'Analyzing...' }]} />
        <div className="flex-1 p-4 space-y-3 animate-fade-in">
          {/* Header skeleton */}
          <div className="flex items-start gap-4">
            <div className="skeleton" style={{ width: 88, height: 88, borderRadius: '50%' }} />
            <div className="flex-1 space-y-2 pt-2">
              <div className="skeleton" style={{ width: '40%', height: 20 }} />
              <div className="skeleton" style={{ width: '60%', height: 14 }} />
            </div>
          </div>

          {/* Tab bar skeleton */}
          <div className="flex gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ width: 90, height: 32 }} />
            ))}
          </div>

          {/* Metric cards skeleton */}
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 80 }} />
            ))}
          </div>

          {/* Pipeline progress overlay */}
          {steps.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Pipeline Progress</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {steps.map(([step, status]) => (
                  <div key={step} className="flex items-center gap-1.5 text-xs">
                    {status === 'complete' ? <CheckCircle2 size={10} style={{ color: 'var(--success)' }} /> :
                      status === 'running' ? <Loader2 size={10} className="animate-spin" style={{ color: 'var(--primary)' }} /> :
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--border)' }} />}
                    <span style={{ color: status === 'running' ? 'var(--primary)' : status === 'complete' ? 'var(--success)' : 'var(--placeholder)' }}>
                      {step.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content skeletons */}
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </>
    );
  }

  if (error || !audit) return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Error' }]} />
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <XCircle size={40} style={{ color: 'var(--danger)', marginBottom: 12 }} />
        <h2 className="text-lg font-semibold mb-1">{audit?.status === 'FAILED' ? 'Audit Failed' : 'Audit not found'}</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{audit?.error || error}</p>
      </div>
    </>
  );

  const sev = audit.severity || {};
  const score = sev.fairness_score ?? audit.fairnessScore ?? 0;
  const grade = sev.letter_grade ?? audit.letterGrade ?? '?';
  const tabs = getTabs(stakeholderMode);
  const visibleTabKeys = new Set(tabs.map((t) => t.key));

  async function onRunRedTeam() {
    try {
      setRedTeamLoading(true);
      const result = await runRedTeamAudit(auditId);
      setRedTeam(result);
    } catch (e: any) {
      setError(e?.message || 'Failed to run red-team analysis');
    } finally {
      setRedTeamLoading(false);
    }
  }

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: audit.name }]} />
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        {redTeam?.worstCase && (
          <div className="card" style={{ borderColor: 'rgba(255, 22, 93, 0.35)', background: 'var(--danger-dim)' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--danger)' }}>WORST CASE SCENARIO</div>
            <div className="text-sm" style={{ color: 'var(--fg)' }}>{redTeam.worstCase.message}</div>
            <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              Evaluated {redTeam.evaluatedThresholds} thresholds across {redTeam.evaluatedSlices} demographic slices.
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Score ring */}
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="38" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
              <circle cx="44" cy="44" r="38" fill="none" stroke={scoreColor(score)} strokeWidth="6"
                strokeDasharray={`${score * 2.39} 239`} strokeLinecap="round" transform="rotate(-90 44 44)" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black" style={{ color: gradeColor(grade) }}>{grade}</span>
              <span className="text-xs font-bold" style={{ color: scoreColor(score) }}>{score}/100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="page-title">{audit.name}</h1>
              <span className={`badge ${audit.status === 'COMPLETE' ? 'badge-pass' : 'badge-medium'}`}>{audit.status}</span>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span>{audit.domain}</span><span>•</span>
              <span>{new Date(audit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span>•</span><span>{audit.rowCount?.toLocaleString()} rows</span>
              <span>•</span><span>{audit.columnCount} cols</span>
            </div>
            {sev.penalties?.length > 0 && (
              <div className="text-xs mt-1" style={{ color: 'var(--placeholder)' }}>
                {sev.penalties.length} penalty deductions applied
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="btn btn-outline btn-sm" onClick={onRunRedTeam} disabled={redTeamLoading || audit.dataOnly}>
              {redTeamLoading ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />} Red Team
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => exportPDF(auditId)}><Download size={13} /> PDF</button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Stakeholder Mode</div>
            <StakeholderToggle value={stakeholderMode} onChange={setStakeholderMode} />
          </div>
          {stakeholderMode === 'executive' && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              Executive mode active: Explainability tab is hidden and high-level business framing is prioritized.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{ overflowX: 'auto' }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                data-tab-key={t.key}
                className={`tab-item flex items-center gap-1.5 ${tab === t.key ? 'active' : ''}`}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {visibleTabKeys.has('overview') && tab === 'overview' && <OverviewTab audit={audit} stakeholderMode={stakeholderMode} />}
        {visibleTabKeys.has('data') && tab === 'data' && <DataTab audit={audit} />}
        {visibleTabKeys.has('model') && tab === 'model' && <ModelTab audit={audit} />}
        {visibleTabKeys.has('intersectional') && tab === 'intersectional' && <IntersectionalTab audit={audit} />}
        {visibleTabKeys.has('explainability') && tab === 'explainability' && <ExplainabilityTab audit={audit} />}
        {visibleTabKeys.has('narratives') && tab === 'narratives' && <NarrativesTab audit={audit} mode={stakeholderMode} />}
        {visibleTabKeys.has('fixes') && tab === 'fixes' && <FixesTab audit={audit} stakeholderMode={stakeholderMode} />}
        {visibleTabKeys.has('legal') && tab === 'legal' && <LegalTab audit={audit} mode={stakeholderMode} />}
      </div>
    </>
  );
}

/* ==================== OVERVIEW ==================== */
function OverviewTab({ audit, stakeholderMode }: { audit: any; stakeholderMode: StakeholderMode }) {
  const sev = audit.severity || {};
  const dataBias = audit.dataBias || {};
  const proxies = audit.proxies || [];
  const laundering = audit.featureLaundering || [];
  const harm = audit.historicalHarm || [];
  const profiles = audit.profiles || [];
  const regs = audit.regulationMap || [];
  const modelBias = audit.modelBias || {};
  const benchmarking = audit.benchmarking;
  const imbalanced = profiles.filter((p: any) => p.imbalance_warning).length;
  const [sameDomainDelta, setSameDomainDelta] = useState<number | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);

  let worstDI: any = null;
  Object.values(dataBias).forEach((v: any) => {
    const di = v?.metrics?.disparate_impact;
    if (di && (!worstDI || di < worstDI.di)) worstDI = { attr: v.attribute, di, sev: v.severity };
  });

  const fairnessScore = sev.fairness_score ?? audit.fairnessScore ?? 0;
  const fairnessRisk = riskLevelFromScore(fairnessScore);
  const legalHeadline = regs[0]
    ? `${regs[0].regulation} ${regs[0].clause}`
    : 'No major compliance clause triggered';
  const topHarm = harm.length > 0
    ? [...harm].sort((a: any, b: any) => (b.estimated_individuals_harmed || 0) - (a.estimated_individuals_harmed || 0))[0]
    : null;

  const threshold = Number(audit.threshold ?? 0.8);
  const legalCritical = hasCriticalLegalTrigger(regs);
  const deploymentNoGo = fairnessScore < threshold * 100 || legalCritical;
  const deploymentDecision = deploymentNoGo ? 'NO-GO' : 'GO';
  const inrBand = estimateInrFineBand(fairnessScore, threshold, legalCritical);
  const businessRiskExample = topHarm
    ? `${Number(topHarm.estimated_individuals_harmed || 0).toLocaleString()} people may be impacted over ${topHarm.months_deployed || 0} months if current behavior persists.`
    : worstDI
      ? `Decisions in ${worstDI.attr} show the widest fairness gap and can raise escalation risk.`
      : 'No major fairness hotspots are currently detected.';

  useEffect(() => {
    let cancelled = false;

    async function loadSameDomainDelta() {
      if (stakeholderMode !== 'executive' || !audit?.orgId || !audit?.domain || !audit?.id) {
        setSameDomainDelta(null);
        return;
      }
      try {
        setDeltaLoading(true);
        const audits = await listAudits(audit.orgId);
        if (cancelled) return;

        const previous = (audits || [])
          .filter((a: any) => a.id !== audit.id && a.status === 'COMPLETE' && a.domain === audit.domain)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        const currentScore = Number(sev.fairness_score ?? audit.fairnessScore ?? 0);
        const prevScore = Number(previous?.fairnessScore ?? previous?.severity?.fairness_score);

        if (previous && Number.isFinite(prevScore)) {
          setSameDomainDelta(currentScore - prevScore);
        } else {
          setSameDomainDelta(null);
        }
      } catch {
        if (!cancelled) setSameDomainDelta(null);
      } finally {
        if (!cancelled) setDeltaLoading(false);
      }
    }

    loadSameDomainDelta();
    return () => {
      cancelled = true;
    };
  }, [audit?.domain, audit?.id, audit?.orgId, audit?.fairnessScore, sev.fairness_score, stakeholderMode]);

  if (stakeholderMode === 'executive') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Mini
            label="Fairness Score"
            value={`${fairnessScore}`}
            sub={`Threshold ${Math.round(threshold * 100)}/100`}
            color={scoreColor(fairnessScore)}
          />
          <Mini
            label="Delta vs Last Audit"
            value={deltaLoading ? '...' : sameDomainDelta == null ? 'N/A' : `${sameDomainDelta > 0 ? '+' : ''}${sameDomainDelta.toFixed(1)}`}
            sub="Same domain comparison"
            color={sameDomainDelta == null ? 'var(--muted)' : sameDomainDelta >= 0 ? 'var(--success)' : 'var(--danger)'}
          />
          <Mini
            label="Business Risk"
            value={fairnessRisk}
            sub="Operational exposure level"
            color={fairnessRisk === 'HIGH' ? 'var(--danger)' : fairnessRisk === 'MEDIUM' ? 'var(--status-warning)' : 'var(--success)'}
          />
          <Mini
            label="Potential Fine Band"
            value={`${formatInr(inrBand.min)} - ${formatInr(inrBand.max)}`}
            sub={inrBand.rationale}
            color={inrBand.max >= 10000000 ? 'var(--danger)' : inrBand.max >= 3000000 ? 'var(--status-warning)' : 'var(--success)'}
          />
          <Mini
            label="Deployment Recommendation"
            value={deploymentDecision}
            sub={deploymentNoGo ? 'Hold deployment until risks are addressed' : 'Within current policy limits'}
            color={deploymentNoGo ? 'var(--danger)' : 'var(--success)'}
          />
        </div>

        <div className="card" style={{ borderColor: deploymentNoGo ? 'var(--danger-dim)' : 'var(--success-dim)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: deploymentNoGo ? 'var(--danger)' : 'var(--success)' }}>
            Executive TLDR
          </div>
          <div className="text-sm" style={{ color: 'var(--fg)' }}>
            Current fairness score is <strong>{fairnessScore}</strong> against threshold <strong>{Math.round(threshold * 100)}</strong>. 
            Recommendation is <strong>{deploymentDecision}</strong> because {legalCritical ? 'a critical legal trigger is active' : fairnessScore < threshold * 100 ? 'fairness is below threshold' : 'risk is within allowed bounds'}.
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Business risk example: {businessRiskExample}
          </div>
        </div>
      </div>
    );
  }

  if (stakeholderMode === 'technical') {
    const flipRates = Object.entries(modelBias)
      .filter(([attr]) => attr !== '_equalized_odds')
      .map(([, data]: [string, any]) => Number(data?.max_flip_rate || 0));
    const maxFlipRate = flipRates.length > 0 ? Math.max(...flipRates) : 0;
    const criticalFindings = Object.values(dataBias).filter((v: any) => v?.severity === 'CRITICAL' || v?.severity === 'HIGH').length
      + laundering.filter((l: any) => l?.laundering_detected).length
      + proxies.filter((p: any) => p?.risk_level === 'HIGH').length;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Mini
            label="Fairness Score"
            value={`${fairnessScore}`}
            sub={`Grade ${sev.letter_grade ?? '?'}`}
            color={scoreColor(fairnessScore)}
          />
          <Mini
            label="Worst Disparate Impact"
            value={worstDI ? worstDI.di.toFixed(2) : '-'}
            sub={worstDI ? `${worstDI.attr} is most affected` : 'No DI hotspot found'}
            color={worstDI && worstDI.di < 0.8 ? 'var(--danger)' : 'var(--success)'}
          />
          <Mini
            label="Max Feature Flip Rate"
            value={`${(maxFlipRate * 100).toFixed(1)}%`}
            sub="Prediction sensitivity to protected changes"
            color={maxFlipRate > 0.1 ? 'var(--danger)' : 'var(--success)'}
          />
          <Mini
            label="Critical Technical Findings"
            value={String(criticalFindings)}
            sub="High-impact diagnostics requiring action"
            color={criticalFindings > 0 ? 'var(--danger)' : 'var(--success)'}
          />
        </div>

        <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--primary)' }}>Technical TLDR</div>
          <div className="text-sm" style={{ color: 'var(--fg)' }}>
            Primary model risk is {worstDI ? <strong>{`${worstDI.attr} DI ${worstDI.di.toFixed(2)}`}</strong> : <strong>no major DI hotspot</strong>}.
            Maximum protected-attribute flip sensitivity is <strong>{(maxFlipRate * 100).toFixed(1)}%</strong>.
            Use the workbench below for adversarial simulation, detailed flip analysis, and Pareto remediation planning.
          </div>
        </div>

        <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
          <div className="text-xs font-semibold mb-3" style={{ color: 'var(--primary)' }}>Technical Workbench</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              className="p-3 rounded-lg text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => {
                const modelTab = document.querySelector('[data-tab-key="model"]') as HTMLButtonElement | null;
                modelTab?.click();
              }}
            >
              <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>Adversarial Applicant Simulator</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Run counterfactual profiles and inspect decision boundary behavior.</div>
            </button>

            <button
              type="button"
              className="p-3 rounded-lg text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => {
                const modelTab = document.querySelector('[data-tab-key="model"]') as HTMLButtonElement | null;
                modelTab?.click();
              }}
            >
              <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>Feature Flipping Rates</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Inspect protected-attribute perturbation sensitivity and hotspots.</div>
            </button>

            <button
              type="button"
              className="p-3 rounded-lg text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => {
                const fixesTab = document.querySelector('[data-tab-key="fixes"]') as HTMLButtonElement | null;
                fixesTab?.click();
              }}
            >
              <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>Pareto Frontier Remediation</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Review fairness-accuracy trade-offs and rank mitigation candidates.</div>
            </button>
          </div>
        </div>

        {benchmarking?.message && (
          <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--primary)' }}>Sector Benchmarking</div>
            <div className="text-sm" style={{ color: 'var(--fg)' }}>{benchmarking.message}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--placeholder)' }}>
              Peer sample size: {benchmarking.peerCount ?? 0}{benchmarking.optedIn ? '' : ' • Enable benchmarking opt-in in Settings to contribute anonymized scores.'}
            </div>
          </div>
        )}
      </div>
    );
  }

  const primaryMetricLabel = stakeholderMode === 'executive'
    ? 'Fairness Risk'
    : stakeholderMode === 'legal'
      ? 'Primary Compliance Signal'
      : 'Disparate Impact (worst)';
  const primaryMetricValue = stakeholderMode === 'executive'
    ? fairnessRisk
    : stakeholderMode === 'legal'
      ? regs.length > 0 ? `${regs.length}` : '0'
      : worstDI ? worstDI.di.toFixed(2) : '-';
  const primaryMetricSub = stakeholderMode === 'executive'
    ? `Business fairness risk is currently ${fairnessRisk}`
    : stakeholderMode === 'legal'
      ? legalHeadline
      : worstDI ? `${worstDI.attr} - ${worstDI.sev}` : 'No violations';
  const primaryMetricColor = stakeholderMode === 'executive'
    ? fairnessRisk === 'HIGH' ? 'var(--danger)' : fairnessRisk === 'MEDIUM' ? 'var(--accent)' : 'var(--success)'
    : stakeholderMode === 'legal'
      ? regs.length > 0 ? 'var(--accent)' : 'var(--success)'
      : worstDI && worstDI.di < 0.8 ? 'var(--danger)' : 'var(--success)';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-6">
        <Mini label="Fairness Score" value={`${sev.fairness_score ?? 0}`} sub={`Grade: ${sev.letter_grade ?? '?'}`}
          color={scoreColor(sev.fairness_score ?? 0)} />
        <Mini label={primaryMetricLabel} value={String(primaryMetricValue)}
          sub={primaryMetricSub} color={primaryMetricColor} />
        <Mini label="Proxy Variables" value={String(proxies.length)}
          sub={`${proxies.filter((p: any) => p.risk_level === 'HIGH').length} HIGH risk`}
          color={proxies.length > 0 ? 'var(--accent)' : 'var(--success)'} />
        <Mini label="Feature Laundering" value={String(laundering.filter((l: any) => l.laundering_detected).length)}
          sub={`of ${laundering.length} tested`}
          color={laundering.some((l: any) => l.laundering_detected) ? 'var(--danger)' : 'var(--success)'} />
      </div>

      {stakeholderMode === 'executive' && (
        <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--primary)' }}>Executive One-Pager</div>
          <div className="text-sm mb-2" style={{ color: 'var(--fg)' }}>
            Overall fairness score is <strong>{fairnessScore}</strong> with risk level <strong>{fairnessRisk}</strong>.
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            Top risks: {worstDI ? `${worstDI.attr} DI ${worstDI.di.toFixed(2)}` : 'No major DI violations'}, {proxies.length} proxy warnings, {regs.length} compliance indicators.
          </div>
        </div>
      )}

      {benchmarking?.message && (
        <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--primary)' }}>Sector Benchmarking</div>
          <div className="text-sm" style={{ color: 'var(--fg)' }}>{benchmarking.message}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--placeholder)' }}>
            Peer sample size: {benchmarking.peerCount ?? 0}{benchmarking.optedIn ? '' : ' • Enable benchmarking opt-in in Settings to contribute anonymized scores.'}
          </div>
        </div>
      )}

      {topHarm && (
        <div className="card" style={{ borderColor: 'rgba(255, 22, 93, 0.4)', background: 'var(--danger-dim)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--danger)' }}>Historical Harm Estimate</div>
          <div className="text-3xl font-black" style={{ color: 'var(--danger)' }}>
            {Number(topHarm.estimated_individuals_harmed || 0).toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--fg)' }}>
            Based on {topHarm.months_deployed} months of deployment at {Number(audit.decisionsPerMonth || 0).toLocaleString()} decisions/month.
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--placeholder)' }}>{topHarm.disclaimer}</div>
          <div className="mt-3">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => navigator.clipboard.writeText(
                `${Number(topHarm.estimated_individuals_harmed || 0).toLocaleString()} estimated individuals harmed over ${topHarm.months_deployed} months`
              )}
            >
              Copy for presentation
            </button>
          </div>
        </div>
      )}

      {(audit.blindSpots?.length > 0) && (
        <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: 'var(--primary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
              {audit.blindSpots.length} AI-detected blind spots
            </span>
            <span className="text-xs" style={{ color: 'var(--placeholder)' }}>See Data Analysis tab for details</span>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--muted)' }}>Audit Configuration</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span style={{ color: 'var(--placeholder)' }}>Label Column</span><span>{audit.labelCol}</span>
          <span style={{ color: 'var(--placeholder)' }}>Positive Value</span><span>{audit.positiveLabel}</span>
          <span style={{ color: 'var(--placeholder)' }}>Protected Attributes</span><span>{audit.protectedCols?.join(', ')}</span>
          <span style={{ color: 'var(--placeholder)' }}>Threshold</span><span>{audit.threshold}</span>
          <span style={{ color: 'var(--placeholder)' }}>Data Only</span><span>{audit.dataOnly ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {audit.binning && Object.keys(audit.binning).length > 0 && (
        <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
          <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--primary)' }}>
            <Info size={13} className="inline mr-1" />Auto-Binned Attributes
          </h3>
          <div className="text-xs mb-2" style={{ color: 'var(--placeholder)' }}>
            Continuous columns were binned into groups for meaningful fairness analysis
          </div>
          <div className="space-y-1">
            {Object.entries(audit.binning).map(([col, info]: [string, any]) => (
              <div key={col} className="flex items-center gap-2 text-xs">
                <span className="font-medium" style={{ color: 'var(--fg)' }}>{col}</span>
                <span style={{ color: 'var(--placeholder)' }}>→</span>
                <span style={{ color: 'var(--primary)' }}>
                  {info.labels ? info.labels.join(', ') : info.description}
                </span>
                <span className="badge badge-pass text-xs">{info.n_groups} groups</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {audit.blindSpots && audit.blindSpots.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)', background: 'var(--accent-dim)' }}>
          <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent)' }}>
            <AlertTriangle size={13} className="inline mr-1" />
            AI-Detected Blind Spots ({audit.blindSpots.length})
          </h3>
          <div className="text-xs mb-2" style={{ color: 'var(--placeholder)' }}>
            Gemini AI identified potential protected attributes you may have missed
          </div>
          <div className="space-y-2">
            {audit.blindSpots.map((bs: any, i: number) => (
              <div key={i} className="p-2 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-xs" style={{ color: 'var(--fg)' }}>{bs.column}</span>
                  <span className={`badge ${bs.confidence === 'HIGH' ? 'badge-critical' : bs.confidence === 'MEDIUM' ? 'badge-medium' : 'badge-neutral'} text-xs`}>
                    {bs.confidence}
                  </span>
                </div>
                <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
                  May encode: <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{bs.encodes}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--placeholder)' }}>{bs.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sev.penalties?.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger-dim)' }}>
          <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={13} className="inline mr-1" />Score Penalties
          </h3>
          <div className="space-y-1">
            {sev.penalties.map((p: string, i: number) => (
              <div key={i} className="text-xs" style={{ color: 'var(--fg)' }}>• {p}</div>
            ))}
          </div>
        </div>
      )}

      {imbalanced > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)', background: 'var(--accent-dim)' }}>
          <div className="flex items-center gap-2">
            <Users size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{imbalanced} group imbalance warnings detected</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== DATA ANALYSIS ==================== */
function DataTab({ audit }: { audit: any }) {
  const dataBias = audit.dataBias || {};
  const schema = audit.schema;
  const proxies = audit.proxies || [];
  const profiles = audit.profiles || [];
  const blindSpots = audit.blindSpots || [];
  const [activePanel, setActivePanel] = useState<'disparate' | 'distribution' | 'proxy' | 'schema' | 'blindspots'>('disparate');

  const diRows = Object.values(dataBias) as any[];
  const worstDi = diRows.length > 0
    ? Math.min(...diRows.map((b: any) => Number(b?.metrics?.disparate_impact ?? 1)).filter((n: number) => Number.isFinite(n)))
    : null;
  const imbalancedCount = profiles.filter((p: any) => p.imbalance_warning).length;
  const highProxyCount = proxies.filter((p: any) => p.risk_level === 'HIGH').length;
  const flaggedSchemaCount = (schema?.columns || []).filter((c: any) => c.auto_flagged).length;

  const kpiCards = [
    {
      key: 'disparate' as const,
      label: 'Disparate Impact',
      value: worstDi == null ? '-' : worstDi.toFixed(2),
      sub: 'Click to expand DI analysis table',
      color: worstDi != null && worstDi < 0.8 ? 'var(--danger)' : 'var(--success)',
    },
    {
      key: 'distribution' as const,
      label: 'Group Distribution',
      value: `${imbalancedCount}`,
      sub: 'Click to inspect group composition charts',
      color: imbalancedCount > 0 ? 'var(--status-warning)' : 'var(--success)',
    },
    {
      key: 'proxy' as const,
      label: 'Proxy Variables',
      value: `${proxies.length}`,
      sub: 'Click to open proxy network + risk table',
      color: highProxyCount > 0 ? 'var(--danger)' : 'var(--success)',
    },
    {
      key: 'schema' as const,
      label: 'Schema Sensitivity',
      value: `${flaggedSchemaCount}`,
      sub: 'Click to review column sensitivity',
      color: flaggedSchemaCount > 0 ? 'var(--status-warning)' : 'var(--success)',
    },
    {
      key: 'blindspots' as const,
      label: 'AI Blind Spots',
      value: `${blindSpots.length}`,
      sub: 'Click to review hidden risk signals',
      color: blindSpots.length > 0 ? 'var(--status-warning)' : 'var(--success)',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {kpiCards.map((card) => {
          const active = activePanel === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setActivePanel(card.key)}
              className="card text-left"
              style={{
                borderColor: active ? 'var(--primary)' : 'var(--border)',
                boxShadow: active ? '0 0 0 1px var(--primary-dim)' : undefined,
                cursor: 'pointer',
              }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>{card.label}</div>
              <div className="page-title" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs" style={{ color: 'var(--placeholder)' }}>{card.sub}</div>
            </button>
          );
        })}
      </div>

      {activePanel === 'distribution' && (
        <>
          <GroupDistributionChart profiles={profiles} />
          <LabelDistributionChart profiles={profiles} />

          {profiles.map((p: any, i: number) => (
            <div key={i} className="card space-y-2">
              <div className="flex items-center gap-2">
                <Users size={14} style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-semibold">{p.attribute}</span>
                {p.imbalance_warning && <span className="badge badge-high">IMBALANCED ({p.imbalance_ratio}x)</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(p.group_counts as Record<string, number>).map(([g, c]) => (
                  <div key={g} className="flex-1 min-w-[100px] p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{g}</div>
                    <div className="text-sm font-bold">{(c as number).toLocaleString()}</div>
                    <div className="w-full h-1 rounded-full mt-1" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${p.group_percentages[g]}%`, background: 'var(--primary)' }} />
                    </div>
                    <div className="text-xs" style={{ color: 'var(--placeholder)' }}>{p.group_percentages[g]}%</div>
                  </div>
                ))}
              </div>
              {p.label_distribution_per_group && (
                <div className="space-y-1 mt-2">
                  <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Outcome Rate by Group</div>
                  {Object.entries(p.label_distribution_per_group as Record<string, any>).map(([g, r]) => (
                    <div key={g} className="flex items-center gap-2">
                      <span className="text-xs w-20 truncate" style={{ color: 'var(--muted)' }}>{g}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full flex items-center justify-center text-[8px] font-bold"
                          style={{ width: `${(r as any).positive}%`, background: 'var(--success)', color: '#fff' }}>
                          {(r as any).positive}%</div>
                        <div className="h-full flex items-center justify-center text-[8px] font-bold"
                          style={{ width: `${(r as any).negative}%`, background: 'var(--danger)', color: '#fff' }}>
                          {(r as any).negative}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {activePanel === 'disparate' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            Disparate Impact Analysis
          </div>
          <table>
            <thead><tr>
              <th>Attribute</th><th>Privileged Group</th><th>DI Ratio</th><th>SPD</th><th>Pos Rate (Priv)</th><th>Pos Rate (Unpriv)</th><th>Verdict</th>
            </tr></thead>
            <tbody>
              {Object.values(dataBias).map((b: any) => (
                <tr key={b.attribute}>
                  <td className="font-medium">{b.attribute}</td>
                  <td>{b.privileged_group}</td>
                  <td><span style={{ color: b.metrics.disparate_impact < 0.8 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    {b.metrics.disparate_impact?.toFixed(2) ?? '-'}</span></td>
                  <td style={{ color: Math.abs(b.metrics.statistical_parity_difference) > 0.1 ? 'var(--status-warning)' : 'var(--muted)' }}>
                    {b.metrics.statistical_parity_difference?.toFixed(3)}</td>
                  <td>{(b.metrics.positive_rate_privileged * 100).toFixed(1)}%</td>
                  <td>{(b.metrics.positive_rate_unprivileged * 100).toFixed(1)}%</td>
                  <td><span className={`badge ${sevBadge(b.severity)}`}>{b.verdict}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activePanel === 'proxy' && (
        <>
          {proxies.length > 0 && (
            <ProxyNetworkGraph
              proxies={proxies}
              protectedCols={audit.protectedCols || []}
            />
          )}

          {proxies.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                Proxy Variables - {proxies.length} found
              </div>
              <table>
                <thead><tr><th>Proxy Column</th><th>Correlates With</th><th>Score</th><th>Method</th><th>Risk</th></tr></thead>
                <tbody>
                  {proxies.map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="font-medium">{p.proxy_column}</td>
                      <td>{p.protected_column}</td>
                      <td><span style={{ color: p.association_score >= 0.5 ? 'var(--danger)' : 'var(--status-warning)' }}>
                        {p.association_score.toFixed(2)}</span></td>
                      <td className="text-xs" style={{ color: 'var(--muted)' }}>{p.method}</td>
                      <td><span className={`badge ${sevBadge(p.risk_level)}`}>{p.risk_level}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activePanel === 'blindspots' && blindSpots.length > 0 && (
        <div className="card" style={{ padding: 0, borderColor: 'var(--primary-dim)' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <Sparkles size={13} style={{ color: 'var(--primary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>AI Blind Spot Detection</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--placeholder)' }}>Powered by Gemini</span>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-xs mb-3" style={{ color: 'var(--placeholder)' }}>
              Gemini identified columns that may encode protected characteristics not yet flagged in your audit.
            </div>
            {blindSpots.map((bs: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--primary-dim)', border: '1px solid var(--primary-dim)' }}>
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`badge ${bs.confidence === 'HIGH' ? 'badge-critical' : bs.confidence === 'MEDIUM' ? 'badge-high' : 'badge-medium'}`}
                    style={{ fontSize: '9px', padding: '1px 6px' }}>{bs.confidence}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
                    {bs.column} <span style={{ color: 'var(--primary)' }}>may encode</span> {bs.encodes}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{bs.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePanel === 'schema' && schema && (
        <div className="card" style={{ padding: 0 }}>
          <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            Schema - {schema.column_count} columns
          </div>
          <table>
            <thead><tr><th>Column</th><th>Type</th><th>Unique</th><th>Nulls</th><th>Sensitivity</th><th>Flagged</th></tr></thead>
            <tbody>
              {schema.columns?.map((c: any) => (
                <tr key={c.name}>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-xs" style={{ color: 'var(--muted)' }}>{c.dtype}</td>
                  <td>{c.unique_count}</td>
                  <td style={{ color: c.null_count > 0 ? 'var(--status-warning)' : 'var(--placeholder)' }}>{c.null_count}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <span style={{ color: c.sensitivity_score >= 0.65 ? 'var(--danger)' : 'var(--placeholder)' }}>{c.sensitivity_score.toFixed(2)}</span>
                      <div className="w-10 h-1 rounded-full" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${c.sensitivity_score * 100}%`,
                          background: c.sensitivity_score >= 0.65 ? 'var(--danger)' : 'var(--border-light)',
                        }} />
                      </div>
                    </div>
                  </td>
                  <td>{c.auto_flagged ? <span className="badge badge-critical">YES</span> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ==================== AI NARRATIVES ==================== */
function NarrativesTab({ audit, mode }: { audit: any; mode: StakeholderMode }) {
  const narratives = audit.narratives || {};
  const [fullNarrativeOpen, setFullNarrativeOpen] = useState(false);

  const MODES = {
    executive: { label: 'Executive', desc: 'Board-ready summary' },
    technical: { label: 'Technical', desc: 'ML engineer deep-dive' },
    legal: { label: 'Legal', desc: 'Compliance assessment' },
  } as const;

  const currentNarrative = narratives[mode] || '';
  const tldr = extractNarrativeTldr(currentNarrative || '', mode);
  const hasNarratives = Object.keys(narratives).length > 0 && Object.values(narratives).some((v: any) => v && v.length > 0);

  if (!hasNarratives) return (
    <div className="card text-center py-12">
      <Sparkles size={28} className="mx-auto mb-3" style={{ color: 'var(--primary)', opacity: 0.5 }} />
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--muted)' }}>No AI Narratives Generated</div>
      <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
        Narratives are generated by Gemini AI during the audit pipeline. Check that your GEMINI_API_KEY is configured.
      </div>
    </div>
  );

  // Simple markdown renderer
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: any[] = [];
    let inList = false;
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="space-y-1 ml-4 mb-3">
            {listItems.map((item, j) => (
              <li key={j} className="text-sm flex gap-2" style={{ color: 'var(--fg)' }}>
                <span style={{ color: 'var(--placeholder)' }}>{'\u2022'}</span>
                <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
              </li>
            ))}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };

    const inlineFormat = (text: string) => {
      return text
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--fg)">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:var(--surface-2);padding:1px 4px;border-radius:3px;font-size:11px;color:var(--primary);border:1px solid var(--border)">$1</code>');
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('# ')) {
        flushList();
        elements.push(<h2 key={i} className="text-base font-bold mb-2 mt-4" style={{ color: 'var(--fg)' }}>{line.slice(2)}</h2>);
      } else if (line.startsWith('## ')) {
        flushList();
        elements.push(<h3 key={i} className="text-sm font-bold mb-2 mt-3" style={{ color: 'var(--primary)' }}>{line.slice(3)}</h3>);
      } else if (line.startsWith('### ')) {
        flushList();
        elements.push(<h4 key={i} className="text-xs font-bold mb-1 mt-2" style={{ color: 'var(--primary)' }}>{line.slice(4)}</h4>);
      } else if (line.startsWith('---')) {
        flushList();
        elements.push(<hr key={i} className="my-3" style={{ borderColor: 'var(--border)' }} />);
      } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
        inList = true;
        const content = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
        listItems.push(content);
      } else if (line === '') {
        flushList();
      } else {
        flushList();
        elements.push(
          <p key={i} className="text-sm mb-2" style={{ color: 'var(--fg)' }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
        );
      }
    }
    flushList();
    return elements;
  };

  return (
    <div className="space-y-3">
      <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
          Showing {MODES[mode].label} Narrative
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{MODES[mode].desc}</div>
      </div>

      <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
        <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <Sparkles size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
            TLDR
          </span>
          <span className="text-xs ml-auto" style={{ color: 'var(--placeholder)' }}>Generated by Gemini AI</span>
        </div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--fg)' }}>
          {tldr}
        </div>
        <div className="mt-3">
          <button className="btn btn-outline btn-sm" disabled={!currentNarrative} onClick={() => setFullNarrativeOpen(true)}>
            View Full Audit Narrative
          </button>
        </div>
      </div>

      {fullNarrativeOpen && (
        <>
          <div
            onClick={() => setFullNarrativeOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 70 }}
          />
          <aside
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: 'min(720px, 100vw)',
              height: '100vh',
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 71,
              padding: '20px 20px 28px 20px',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Sparkles size={14} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                {MODES[mode].label} Full Narrative
              </span>
              <button className="btn btn-outline btn-sm ml-auto" onClick={() => setFullNarrativeOpen(false)}>Close</button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <button
                className="btn btn-outline btn-sm"
                disabled={!currentNarrative}
                onClick={() => navigator.clipboard.writeText(narrativeToPlainText(currentNarrative || ''))}
              >
                Copy narrative
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={!currentNarrative}
                onClick={() => {
                  const plainText = narrativeToPlainText(currentNarrative || '');
                  const blob = buildSimplePdf(plainText, `${MODES[mode].label} Narrative`);
                  const url = window.URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `visionai-${mode}-narrative.pdf`;
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  window.URL.revokeObjectURL(url);
                }}
              >
                Download narrative
              </button>
            </div>
            <div>
              {currentNarrative ? renderMarkdown(currentNarrative) : (
                <div className="text-sm text-center py-8" style={{ color: 'var(--placeholder)' }}>
                  No narrative available for {mode} mode.
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

/* Collapsible Equalized Odds group per attribute */
function EqOddsGroup({ attr, groups }: { attr: string; groups: any }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(groups);
  const fprs = entries.map(([, m]: [string, any]) => m.fpr);
  const fprGap = fprs.length >= 2 ? (Math.max(...fprs) - Math.min(...fprs)) : 0;

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[var(--surface-2)] transition-colors"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--placeholder)', transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▶</span>
          <span className="text-xs font-semibold">{attr}</span>
          <span className="text-xs" style={{ color: 'var(--placeholder)' }}>{entries.length} groups</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: fprGap > 0.1 ? 'var(--danger)' : 'var(--success)' }}>
            FPR gap: {(fprGap * 100).toFixed(1)}%
          </span>
          <span className={`badge ${fprGap > 0.1 ? 'badge-critical' : 'badge-pass'}`} style={{ fontSize: '9px', padding: '1px 6px' }}>
            {fprGap > 0.1 ? 'FAIL' : 'PASS'}
          </span>
        </div>
      </button>
      {open && (
        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          <table>
            <thead className="sticky top-0 sticky-header" style={{ background: 'var(--surface-2)', zIndex: 10 }}>
              <tr><th>Group</th><th>FPR</th><th>FNR</th><th>Precision</th></tr>
            </thead>
            <tbody>
              {entries.map(([g, m]: [string, any]) => (
                <tr key={g}>
                  <td className="font-medium">{g}</td>
                  <td style={{ color: m.fpr > 0.15 ? 'var(--danger)' : 'var(--muted)' }}>{(m.fpr * 100).toFixed(1)}%</td>
                  <td style={{ color: m.fnr > 0.15 ? 'var(--accent)' : 'var(--muted)' }}>{(m.fnr * 100).toFixed(1)}%</td>
                  <td>{(m.precision * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ==================== MODEL ANALYSIS ==================== */
function ModelTab({ audit }: { audit: any }) {
  const modelBias = audit.modelBias;
  const flip = audit.flipSensitivity;
  const [sampleRow, setSampleRow] = useState<Record<string, any>>({});
  const [sampleRowIndex, setSampleRowIndex] = useState<number | null>(null);
  const [rowLoaded, setRowLoaded] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [minimumFlipLoading, setMinimumFlipLoading] = useState(false);
  const [simError, setSimError] = useState('');
  const [decisionResult, setDecisionResult] = useState<any>(null);
  const [minimumFlipResult, setMinimumFlipResult] = useState<any>(null);
  const [explainEnabled, setExplainEnabled] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadSample() {
      if (!audit?.id || audit?.dataOnly) return;
      try {
        const data = await getSampleRow(audit.id);
        if (!cancelled) {
          setSampleRow(data.sampleRow || {});
          setSampleRowIndex(typeof data.rowIndex === 'number' ? data.rowIndex : null);
          setRowLoaded(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSimError(e?.message || 'Failed to load sample row');
        }
      }
    }

    loadSample();
    return () => { cancelled = true; };
  }, [audit?.id, audit?.dataOnly]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrgSettings() {
      if (!audit?.orgId) return;
      try {
        setExplainLoading(true);
        const payload = await getOrgSettings(audit.orgId);
        if (!cancelled) {
          setExplainEnabled(Boolean(payload?.settings?.explain_rejection_enabled));
        }
      } catch {
        if (!cancelled) {
          setExplainEnabled(false);
        }
      } finally {
        if (!cancelled) setExplainLoading(false);
      }
    }

    loadOrgSettings();
    return () => { cancelled = true; };
  }, [audit?.orgId]);

  if (!modelBias) return (
    <div className="card flex items-center gap-3 py-8" style={{ background: 'var(--primary-dim)', borderColor: 'var(--primary-dim)' }}>
      <Info size={20} style={{ color: 'var(--primary)' }} />
      <div>
        <div className="text-sm font-medium">No model provided</div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>Upload a model file (.pkl/.joblib) to enable counterfactual testing, equalized odds, and flip sensitivity analysis.</div>
      </div>
    </div>
  );

  const eqOdds = modelBias._equalized_odds || {};
  const editableFields = Object.entries(sampleRow)
    .filter(([k]) => k !== audit.labelCol && !isIdentifierField(k))
    .slice(0, 14);

  const explainUrl = (sampleRowIndex != null)
    ? `${window.location.origin}/explain/${audit.id}/${sampleRowIndex}`
    : '';

  const changedFeatures = new Set((minimumFlipResult?.changedFields || []).map((x: any) => x.feature));

  async function onCheckDecision() {
    try {
      setDecisionLoading(true);
      setSimError('');
      const result = await predictAuditDecision({
        auditId: audit.id,
        values: sampleRow,
        threshold: audit.threshold,
      });
      setDecisionResult(result);
    } catch (e: any) {
      setSimError(e?.message || 'Failed to predict decision');
    } finally {
      setDecisionLoading(false);
    }
  }

  async function onFindMinimumFlip() {
    try {
      setMinimumFlipLoading(true);
      setSimError('');
      const result = await findMinimumFlip({
        auditId: audit.id,
        values: sampleRow,
        threshold: audit.threshold,
        maxChanges: 3,
      });
      setMinimumFlipResult(result);
    } catch (e: any) {
      setSimError(e?.message || 'Failed to find minimum flip');
    } finally {
      setMinimumFlipLoading(false);
    }
  }

  function onCopyExplainUrl() {
    if (!explainUrl) return;
    navigator.clipboard.writeText(explainUrl).then(() => {
      setCopyMsg('Copied');
      setTimeout(() => setCopyMsg(''), 1500);
    }).catch(() => {
      setCopyMsg('Copy failed');
      setTimeout(() => setCopyMsg(''), 1500);
    });
  }

  return (
    <div className="space-y-3">
      <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Adversarial Applicant Simulator</div>
            <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
              Edit the profile and test model decisions. Use minimum flip to find the smallest non-protected changes.
            </div>
          </div>
        </div>

        {!rowLoaded ? (
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading sample row...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {editableFields.map(([feature, value]) => (
                <div key={feature}>
                  <label className="label-text block mb-1" style={{ color: 'var(--muted)' }}>{feature}</label>
                  <input
                    className="input"
                    value={value == null ? '' : String(value)}
                    onChange={(e) => setSampleRow((prev) => ({ ...prev, [feature]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button className="btn btn-outline btn-sm" onClick={onCheckDecision} disabled={decisionLoading || minimumFlipLoading}>
                {decisionLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                Check Decision
              </button>
              <button className="btn btn-primary btn-sm" onClick={onFindMinimumFlip} disabled={decisionLoading || minimumFlipLoading}>
                {minimumFlipLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                Find Minimum Flip
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={!explainEnabled || !explainUrl || explainLoading}
                onClick={() => window.open(explainUrl, '_blank', 'noopener,noreferrer')}
              >
                Open Explain Page
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={!explainEnabled || !explainUrl || explainLoading}
                onClick={onCopyExplainUrl}
              >
                Copy Explain URL
              </button>
              {simError && <span className="text-xs" style={{ color: 'var(--danger)' }}>{simError}</span>}
              {!simError && copyMsg && <span className="text-xs" style={{ color: 'var(--success)' }}>{copyMsg}</span>}
            </div>

            <div className="mt-2 text-xs" style={{ color: 'var(--placeholder)' }}>
              {explainLoading
                ? 'Checking Explain My Rejection setting...'
                : explainEnabled
                  ? `Public explanation is enabled. This link points to sample row ${sampleRowIndex ?? '-'}.`
                  : 'Explain My Rejection is currently disabled in Settings.'}
            </div>

            {decisionResult && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>Predicted outcome</div>
                <div className="text-sm font-semibold" style={{ color: decisionResult.decision === 'ACCEPT' ? 'var(--success)' : 'var(--danger)' }}>
                  {decisionResult.decision}
                </div>
                <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
                  Score: {decisionResult.score} (threshold {decisionResult.threshold})
                </div>
              </div>
            )}

            {minimumFlipResult && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Current Profile</div>
                  <div className="space-y-1 text-xs">
                    {Object.entries(minimumFlipResult.currentProfile || {}).slice(0, 12).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span style={{ color: 'var(--placeholder)' }}>{k}</span>
                        <span style={{ color: changedFeatures.has(k) ? 'var(--danger)' : 'var(--fg)' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: minimumFlipResult.flipped ? 'var(--success)' : 'var(--accent)' }}>
                    {minimumFlipResult.flipped ? 'Accepted Profile' : 'Best Profile Found'}
                  </div>
                  <div className="space-y-1 text-xs">
                    {Object.entries(minimumFlipResult.acceptedProfile || minimumFlipResult.currentProfile || {}).slice(0, 12).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span style={{ color: 'var(--placeholder)' }}>{k}</span>
                        <span style={{ color: changedFeatures.has(k) ? 'var(--success)' : 'var(--fg)' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                    {minimumFlipResult.changedFields?.length || 0} fields changed
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Counterfactual flip rates */}
      {Object.entries(modelBias).filter(([k]) => k !== '_equalized_odds').map(([attr, data]: [string, any]) => {
        const flips = Object.entries(data.flip_rates || {}).filter(([, r]: [string, any]) => r > 0);
        const totalTested = data.total_transitions_tested || Object.keys(data.flip_rates || {}).length;
        return (
          <div key={attr} className="card" style={{ padding: 0 }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Flip Rates - {attr}</span>
                <span className="text-xs" style={{ color: 'var(--placeholder)' }}>
                  ({flips.length} non-zero of {totalTested} tested)
                </span>
              </div>
              <span className={`badge ${sevBadge(data.verdict)}`}>{data.verdict}</span>
            </div>
            {flips.length > 0 ? (
              <table>
                <thead><tr><th>Transition</th><th>Flip Rate</th><th>Indicator</th></tr></thead>
                <tbody>
                  {flips.slice(0, 10).map(([trans, rate]: [string, any]) => (
                    <tr key={trans}>
                      <td className="font-medium">{trans}</td>
                      <td style={{ color: rate > 0.1 ? 'var(--danger)' : 'var(--success)' }}>{(rate * 100).toFixed(1)}%</td>
                      <td>
                        <div className="w-20 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(rate * 100, 100)}%`, background: rate > 0.1 ? 'var(--danger)' : 'var(--success)' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-xs" style={{ color: 'var(--placeholder)' }}>
                No prediction flips detected - model treats all {attr} groups equally.
              </div>
            )}
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--placeholder)', borderTop: '1px solid var(--border)' }}>
              Max: {(data.max_flip_rate * 100).toFixed(1)}% | Mean: {(data.mean_flip_rate * 100).toFixed(1)}%
              {flips.length > 10 && <span> | Showing top 10 of {flips.length}</span>}
            </div>
          </div>
        );
      })}

      {/* Equalized Odds Chart */}
      {Object.keys(eqOdds).length > 0 && (
        <EqualizedOddsChart equalizedOdds={eqOdds} />
      )}

      {/* Predictive Parity Chart */}
      {Object.keys(eqOdds).length > 0 && (
        <PredictiveParityChart equalizedOdds={eqOdds} />
      )}

      {/* Equalized Odds - collapsible by attribute */}
      {Object.keys(eqOdds).length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            Equalized Odds - FPR / FNR per Group
          </div>
          {Object.entries(eqOdds).map(([attr, groups]: [string, any]) => (
            <EqOddsGroup key={attr} attr={attr} groups={groups} />
          ))}
        </div>
      )}

      {/* Flip sensitivity */}
      {flip && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Flip Sensitivity</span>
          </div>
          <div className="text-sm mb-2">{flip.explanation}</div>
          <div className="flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
            <span>Mean: {flip.mean_flip_count}</span>
            <span>Median: {flip.median_flip_count}</span>
            <span style={{ color: 'var(--danger)' }}>{flip.most_vulnerable_count} vulnerable ({flip.most_vulnerable_percentage}%)</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* Collapsible Intersection group */
function IntersectionGroup({ intersectionKey, items }: { intersectionKey: string; items: any[] }) {
  const [open, setOpen] = useState(false);
  const criticalCount = items.filter((d: any) => d.severity === 'CRITICAL').length;
  const highCount = items.filter((d: any) => d.severity === 'HIGH').length;
  
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[var(--surface-2)] transition-colors"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--placeholder)', transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▶</span>
          <span className="text-xs font-semibold">{intersectionKey}</span>
          <span className="text-xs" style={{ color: 'var(--placeholder)' }}>{items.length} groups tested</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {criticalCount > 0 ? (
            <span className="badge badge-critical" style={{ fontSize: '9px', padding: '1px 6px' }}>{criticalCount} CRITICAL</span>
          ) : highCount > 0 ? (
            <span className="badge badge-high" style={{ fontSize: '9px', padding: '1px 6px' }}>{highCount} HIGH</span>
          ) : (
            <span className="badge badge-pass" style={{ fontSize: '9px', padding: '1px 6px' }}>PASS</span>
          )}
        </div>
      </button>
      {open && (
        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          <table>
            <thead className="sticky top-0 sticky-header" style={{ background: 'var(--surface-2)', zIndex: 10 }}>
              <tr><th>Group</th><th>n</th><th>Pos Rate</th><th>DI vs Overall</th><th>Severity</th></tr>
            </thead>
            <tbody>
              {items.map((d: any, i: number) => (
                <tr key={i}>
                  <td className="font-medium text-xs">
                    {d.group}
                    {d.low_confidence && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-[#2A3040] text-[#5A6478]" title={d.statistical_note}>
                        n&lt;30
                      </span>
                    )}
                  </td>
                  <td>{d.sample_size}</td>
                  <td>{(d.positive_rate * 100).toFixed(1)}%</td>
                  <td style={{ color: d.di_vs_overall < 0.8 && !d.low_confidence ? 'var(--danger)' : d.di_vs_overall >= 0.8 ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
                    {d.di_vs_overall?.toFixed(2)}</td>
                  <td><span className={`badge ${sevBadge(d.severity)}`}>{d.severity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ==================== INTERSECTIONAL ==================== */
function IntersectionalTab({ audit }: { audit: any }) {
  const data = audit.intersectional || [];

  if (data.length === 0) return (
    <div className="card text-center py-8 text-sm" style={{ color: 'var(--placeholder)' }}>
      No intersectional data. Requires 2+ protected attributes.
    </div>
  );

  const critical = data.filter((d: any) => d.severity === 'CRITICAL');

  const groups: Record<string, any[]> = {};
  data.forEach((d: any) => {
    const key = `${d.col_a} × ${d.col_b}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  });

  return (
    <div className="space-y-3">
      {critical.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255, 22, 93, 0.3)', background: 'var(--danger-dim)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
              {critical.length} CRITICAL intersectional violations
            </span>
          </div>
          {critical.slice(0, 5).map((c: any, i: number) => (
            <div key={i} className="text-sm mb-1" style={{ color: 'var(--fg)' }}>
              <strong style={{ color: 'var(--accent)' }}>{c.group}</strong> - DI: {c.di_vs_overall?.toFixed(2)}, n={c.sample_size}
            </div>
          ))}
        </div>
      )}

      {/* Intersectional Heatmap */}
      <IntersectionalHeatmap data={data} />

      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
          Intersectional Groups Analyzed
        </div>
        {Object.entries(groups).map(([key, items]: [string, any[]]) => (
          <IntersectionGroup key={key} intersectionKey={key} items={items} />
        ))}
      </div>
    </div>
  );
}

/* ==================== EXPLAINABILITY ==================== */
function ExplainabilityTab({ audit }: { audit: any }) {
  const laundering = audit.featureLaundering || [];
  const explainability = audit.explainability || {};

  return (
    <div className="space-y-3">
      {/* Feature Laundering */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
          Feature Laundering Detection
        </div>
        {laundering.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--placeholder)' }}>No laundering analysis available.</div>
        ) : (
          <table>
            <thead><tr><th>Protected Attribute</th><th>Reconstruction Accuracy</th><th>Baseline</th><th>Lift</th><th>Verdict</th></tr></thead>
            <tbody>
              {laundering.map((l: any, i: number) => (
                <tr key={i}>
                  <td className="font-medium">{l.protected_attribute}</td>
                  <td style={{ color: l.laundering_detected ? 'var(--danger)' : 'var(--success)' }}>
                    {(l.reconstruction_accuracy * 100).toFixed(1)}%</td>
                  <td>{(l.baseline_accuracy * 100).toFixed(1)}%</td>
                  <td style={{ color: l.lift_over_baseline > 0.4 ? 'var(--danger)' : 'var(--muted)' }}>
                    {(l.lift_over_baseline * 100).toFixed(1)}%</td>
                  <td><span className={`badge ${sevBadge(l.severity)}`}>{l.laundering_detected ? 'DETECTED' : 'PASS'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Explanations */}
      {laundering.filter((l: any) => l.laundering_detected).map((l: any, i: number) => (
        <div key={i} className="card" style={{ borderColor: 'var(--danger-dim)', background: 'var(--danger-dim)' }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: 'var(--danger)', marginTop: 2 }} />
            <div className="text-sm" style={{ color: 'var(--fg)' }}>{l.explanation}</div>
          </div>
        </div>
      ))}

      {/* SHAP Analysis */}
      {explainability && Object.keys(explainability).length > 0 ? (
        <>
          {/* SHAP Summary Chart */}
          <ShapSummaryChart explainability={explainability} />
          {/* Global Top Features */}
          {Object.values(explainability)[0] && (Object.values(explainability)[0] as any).top_features?.length > 0 && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Zap size={14} style={{ color: 'var(--primary)' }} />
                Global Top Features by Importance
              </h3>
              <div className="space-y-1">
                {(Object.values(explainability)[0] as any).top_features.slice(0, 10).map((f: any) => {
                  const maxImp = (Object.values(explainability)[0] as any).top_features[0]?.importance || 1;
                  const pct = (f.importance / maxImp) * 100;
                  return (
                    <div key={f.feature} className="flex items-center gap-2">
                      <span className="text-xs w-32 truncate" style={{ color: 'var(--muted)' }}>{f.feature}</span>
                      <div className="flex-1 h-3 rounded-full" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                      </div>
                      <span className="text-xs w-12 text-right" style={{ color: 'var(--placeholder)' }}>{f.importance.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-attribute SHAP Disparities */}
          {Object.entries(explainability).map(([attr, data]: [string, any]) => (
            <div key={attr} className="card space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap size={14} style={{ color: 'var(--primary)' }} />
                SHAP Analysis - {attr}
              </h3>

              {/* Disparity flags */}
              {data.disparity_flags?.length > 0 ? (
                <div className="card" style={{ padding: 0, borderColor: 'var(--accent-dim)' }}>
                  <div className="px-4 py-2 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--accent)' }}>
                    SHAP Disparity Flags - {data.disparity_flags.length} features
                  </div>
                  <table>
                    <thead><tr><th>Feature</th><th>Disparity Ratio</th><th>Explanation</th></tr></thead>
                    <tbody>
                      {data.disparity_flags.map((f: any, i: number) => (
                        <tr key={i}>
                          <td className="font-medium">{f.feature}</td>
                          <td style={{ color: 'var(--accent)' }}>{f.disparity_ratio}x</td>
                          <td className="text-xs" style={{ color: 'var(--muted)' }}>{f.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs" style={{ color: 'var(--placeholder)' }}>No SHAP disparity flags detected for {attr}.</div>
              )}

              {data.error && (
                <div className="text-xs" style={{ color: 'var(--accent)' }}>⚠ {data.error}</div>
              )}
            </div>
          ))}
        </>
      ) : (
        <div className="card flex items-center gap-3" style={{ background: 'var(--primary-dim)', borderColor: 'var(--primary-dim)' }}>
          <Info size={18} style={{ color: 'var(--primary)' }} />
          <div>
            <div className="text-sm font-medium">SHAP analysis unavailable</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              {audit.dataOnly ? 'Upload a model file to enable SHAP explainability analysis.' : 'SHAP data not generated for this audit.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== FIXES ==================== */
function FixesTab({ audit, stakeholderMode }: { audit: any; stakeholderMode: StakeholderMode }) {
  const dataBias = audit.dataBias || {};
  const laundering = audit.featureLaundering || [];
  const proxies = audit.proxies || [];
  const profiles = audit.profiles || [];
  const biasOrigin = audit.biasOriginTracer || [];

  const fixes: any[] = [];
  const improvementBySeverity: Record<string, number> = {
    CRITICAL: 18,
    HIGH: 12,
    MEDIUM: 7,
    PASS: 3,
  };

  const accuracyImpactByTechnique: Record<string, string> = {
    'Reweighting + Threshold Adjustment': 'Low to Medium (-1% to -3%)',
    'Feature Removal / Decorrelation': 'Medium (-2% to -5%)',
    'Feature Removal': 'Low to Medium (-1% to -4%)',
    'SMOTE Oversampling': 'Low (-0% to -2%)',
    'Adversarial Debiasing / Constraint Training': 'Medium to High (-3% to -7%)',
    'Post-Processing Calibration': 'Low (-0% to -2%)',
  };

  const projectedGain = (severity: string) => improvementBySeverity[severity] ?? 5;

  // DI fixes
  Object.values(dataBias).forEach((b: any) => {
    if (b.severity === 'CRITICAL' || b.severity === 'HIGH') {
      fixes.push({
        title: `Disparate Impact - ${b.attribute}`,
        severity: b.severity,
        technique: 'Reweighting + Threshold Adjustment',
        description: b.explanation,
        projected: `Move DI from ${b.metrics.disparate_impact?.toFixed(2)} toward 0.80+`,
        projectedImprovementPct: projectedGain(b.severity),
        accuracyImpact: accuracyImpactByTechnique['Reweighting + Threshold Adjustment'],
      });
    }
  });

  // Laundering fixes
  laundering.filter((l: any) => l.laundering_detected).forEach((l: any) => {
    fixes.push({
      title: `Feature Laundering - ${l.protected_attribute}`,
      severity: l.severity,
      technique: 'Feature Removal / Decorrelation',
      description: l.explanation,
      projected: 'Remove correlated features or apply adversarial debiasing',
      projectedImprovementPct: projectedGain(l.severity),
      accuracyImpact: accuracyImpactByTechnique['Feature Removal / Decorrelation'],
    });
  });

  // Proxy fixes
  proxies.filter((p: any) => p.risk_level === 'HIGH').forEach((p: any) => {
    fixes.push({
      title: `Proxy Variable - ${p.proxy_column}`,
      severity: 'HIGH',
      technique: 'Feature Removal',
      description: p.explanation,
      projected: `Remove or decorrelate '${p.proxy_column}'`,
      projectedImprovementPct: projectedGain('HIGH'),
      accuracyImpact: accuracyImpactByTechnique['Feature Removal'],
    });
  });

  // Imbalance fixes
  profiles.filter((p: any) => p.imbalance_warning).forEach((p: any) => {
    fixes.push({
      title: `Group Imbalance - ${p.attribute}`,
      severity: 'MEDIUM',
      technique: 'SMOTE Oversampling',
      description: `Imbalance ratio of ${p.imbalance_ratio}x detected.`,
      projected: 'Apply SMOTE to balance group representation',
      projectedImprovementPct: projectedGain('MEDIUM'),
      accuracyImpact: accuracyImpactByTechnique['SMOTE Oversampling'],
    });
  });

  // Model bias fixes - flip rates
  const modelBias = audit.modelBias || {};
  Object.entries(modelBias).forEach(([attr, data]: [string, any]) => {
    if (attr === '_equalized_odds') return;
    if (data.max_flip_rate > 0.10) {
      fixes.push({
        title: `Counterfactual Sensitivity - ${attr}`,
        severity: data.max_flip_rate > 0.25 ? 'CRITICAL' : 'HIGH',
        technique: 'Adversarial Debiasing / Constraint Training',
        description: `Changing '${attr}' flips ${(data.max_flip_rate * 100).toFixed(1)}% of predictions. Model is directly influenced by this protected attribute.`,
        projected: `Retrain with fairness constraints to reduce flip rate below 10%`,
        projectedImprovementPct: projectedGain(data.max_flip_rate > 0.25 ? 'CRITICAL' : 'HIGH'),
        accuracyImpact: accuracyImpactByTechnique['Adversarial Debiasing / Constraint Training'],
      });
    }
  });

  // Model bias fixes - equalized odds gaps
  const eqOdds = modelBias._equalized_odds || {};
  Object.entries(eqOdds).forEach(([attr, groups]: [string, any]) => {
    const fprs = Object.values(groups).map((g: any) => g.fpr);
    const fnrs = Object.values(groups).map((g: any) => g.fnr);
    const fprGap = fprs.length >= 2 ? Math.max(...fprs) - Math.min(...fprs) : 0;
    const fnrGap = fnrs.length >= 2 ? Math.max(...fnrs) - Math.min(...fnrs) : 0;
    if (fprGap > 0.1 || fnrGap > 0.1) {
      fixes.push({
        title: `Equalized Odds Gap - ${attr}`,
        severity: fprGap > 0.2 || fnrGap > 0.2 ? 'CRITICAL' : 'HIGH',
        technique: 'Post-Processing Calibration',
        description: `FPR gap: ${(fprGap * 100).toFixed(1)}%, FNR gap: ${(fnrGap * 100).toFixed(1)}% across ${attr} groups. Model errors are unevenly distributed.`,
        projected: 'Apply threshold calibration per group to equalize error rates',
        projectedImprovementPct: projectedGain(fprGap > 0.2 || fnrGap > 0.2 ? 'CRITICAL' : 'HIGH'),
        accuracyImpact: accuracyImpactByTechnique['Post-Processing Calibration'],
      });
    }
  });

  if (fixes.length === 0) return (
    <div className="space-y-3">
      {biasOrigin.length > 0 && <BiasOriginTracerCard items={biasOrigin} />}
      <ParetoFrontier auditId={audit.id} hasModel={!audit.dataOnly} />
      <div className="card flex items-center gap-3 py-8" style={{ background: 'rgba(6, 214, 160, 0.04)', borderColor: 'rgba(6, 214, 160, 0.2)' }}>
        <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--success)' }}>No critical issues requiring fixes.</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {biasOrigin.length > 0 && <BiasOriginTracerCard items={biasOrigin} />}

      {/* Pareto Frontier */}
      <ParetoFrontier auditId={audit.id} hasModel={!audit.dataOnly} />

      {stakeholderMode === 'legal' && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)', background: 'var(--accent-dim)' }}>
          <div className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
            Legal interpretation: prioritize fixes where bias is amplified by the model, as these create additional liability beyond historical data bias.
          </div>
        </div>
      )}

      {fixes.map((f, i) => (
        <FixCard key={i} fix={f} />
      ))}
    </div>
  );
}

const CODE_SNIPPETS: Record<string, string> = {
  'Reweighting + Threshold Adjustment': `from sklearn.utils.class_weight import compute_sample_weight
# Compute reweighting factors per group
weights = compute_sample_weight('balanced', y=df['protected_attr'])
model.fit(X_train, y_train, sample_weight=weights)`,
  'Feature Removal / Decorrelation': `# Remove proxy features correlated with protected attributes
features_to_drop = ['zip_code', 'neighborhood']
X_train = X_train.drop(columns=features_to_drop)
X_test = X_test.drop(columns=features_to_drop)`,
  'Feature Removal': `# Remove identified proxy variable
X_train = X_train.drop(columns=['proxy_column'])
X_test = X_test.drop(columns=['proxy_column'])`,
  'SMOTE Oversampling': `from imblearn.over_sampling import SMOTE
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)`,
  'Adversarial Debiasing / Constraint Training': `from fairlearn.reductions import ExponentiatedGradient, DemographicParity
mitigator = ExponentiatedGradient(
    estimator=base_model,
    constraints=DemographicParity()
)
mitigator.fit(X_train, y_train, sensitive_features=A_train)`,
  'Post-Processing Calibration': `from fairlearn.postprocessing import ThresholdOptimizer
postprocessor = ThresholdOptimizer(
    estimator=model,
    constraints="equalized_odds"
)
postprocessor.fit(X_val, y_val, sensitive_features=A_val)`,
};

function FixCard({ fix }: { fix: any }) {
  const [showCode, setShowCode] = useState(false);
  const snippet = CODE_SNIPPETS[fix.technique] || null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={14} style={{ color: 'var(--primary)' }} />
        <span className="text-sm font-semibold">{fix.title}</span>
        <span className={`badge ${sevBadge(fix.severity)}`}>{fix.severity}</span>
      </div>
      <div className="text-sm mb-2" style={{ color: 'var(--fg)' }}>{fix.description}</div>
      <div className="flex items-center gap-4 text-xs mb-2" style={{ color: 'var(--muted)' }}>
        <span><strong style={{ color: 'var(--primary)' }}>Technique:</strong> {fix.technique}</span>
        <span><strong style={{ color: 'var(--success)' }}>Projected:</strong> {fix.projected}</span>
      </div>
      <div className="flex items-center gap-4 text-xs mb-2" style={{ color: 'var(--muted)' }}>
        <span><strong style={{ color: 'var(--success)' }}>Projected Fairness Improvement:</strong> +{fix.projectedImprovementPct}%</span>
        <span><strong style={{ color: 'var(--accent)' }}>Estimated Accuracy Impact:</strong> {fix.accuracyImpact}</span>
      </div>
      {snippet && (
        <div>
          <button
            className="text-xs font-semibold flex items-center gap-1 mb-1"
            style={{ color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => setShowCode(!showCode)}
          >
            <span style={{ transform: showCode ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
            {showCode ? 'Hide' : 'Show'} code snippet
          </button>
          {showCode && (
            <pre className="text-xs p-3 rounded-lg overflow-x-auto" style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}>
              {snippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function BiasOriginTracerCard({ items }: { items: any[] }) {
  return (
    <div className="card" style={{ borderColor: 'var(--danger-dim)' }}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>Bias Origin Tracer</span>
      </div>
      <div className="space-y-2">
        {items.map((item: any) => {
          const amplified = item.origin === 'AMPLIFIED_BY_MODEL';
          const learned = item.origin === 'LEARNED_FROM_DATA';
          return (
            <div key={item.attribute} className="p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>{item.attribute}</span>
                <span className={`badge ${amplified ? 'badge-critical' : learned ? 'badge-medium' : 'badge-pass'}`}>
                  {item.origin}
                </span>
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Data DI: {item.dataDI} | Model DI: {item.modelDI}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--fg)' }}>{item.summary}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== LEGAL ==================== */
function LegalTab({ audit, mode }: { audit: any; mode: StakeholderMode }) {
  const regs = audit.regulationMap || [];
  const criticalCount = regs.filter((r: any) => String(r.compliance_risk || '').includes('CRITICAL')).length;
  const highCount = regs.filter((r: any) => String(r.compliance_risk || '').includes('HIGH')).length;
  const mitigations = regs.filter((r: any) => Boolean(r.recommended_mitigation)).length;
  const legalFocus = mode === 'legal';

  const downloadComplianceSheet = () => {
    const pipeline = audit.pipeline || {};
    const timeline = Object.entries(pipeline)
      .map(([step, status]) => `- ${step.replace(/_/g, ' ')}: ${String(status).toUpperCase()}`)
      .join('\n');

    const mappings = regs.map((r: any, idx: number) => {
      return `${idx + 1}. Framework: ${r.regulation || 'N/A'}\n   Clause: ${r.clause || 'N/A'}\n   Risk: ${r.compliance_risk || 'N/A'}\n   Trigger: ${r.triggered_by || r.indicator_note || r.description || 'N/A'}\n   Mitigation: ${r.recommended_mitigation || 'N/A'}`;
    }).join('\n\n');

    const legalText = [
      `Compliance Sheet - ${audit.name || 'Audit'}`,
      `Domain: ${audit.domain || 'N/A'}`,
      `Jurisdiction: ${audit.jurisdiction || 'Global'}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `Critical mappings: ${criticalCount}`,
      `High mappings: ${highCount}`,
      `Total mappings: ${regs.length}`,
      '',
      'Framework Mapping',
      mappings || 'No mappings available.',
      '',
      'Audit Trail Snapshot',
      timeline || 'No pipeline timeline available.',
    ].join('\n');

    const blob = buildSimplePdf(legalText, `${audit.name || 'Audit'} Compliance Sheet`);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `audit-${audit.id}-compliance-sheet.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Mini label="Framework Mappings" value={`${regs.length}`} sub="Total compliance links" color={regs.length > 0 ? 'var(--status-warning)' : 'var(--success)'} />
        <Mini label="Critical Risks" value={`${criticalCount}`} sub="Immediate legal escalation" color={criticalCount > 0 ? 'var(--danger)' : 'var(--success)'} />
        <Mini label="High Risks" value={`${highCount}`} sub="Priority legal remediation" color={highCount > 0 ? 'var(--status-warning)' : 'var(--success)'} />
        <Mini label="Mitigation Coverage" value={`${mitigations}/${regs.length || 0}`} sub="Findings with recommended action" color={mitigations === regs.length && regs.length > 0 ? 'var(--success)' : 'var(--status-warning)'} />
      </div>

      <div className="card flex items-center justify-between" style={{ borderColor: 'var(--primary-dim)' }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Compliance Exports</div>
          <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
            Download legal mappings and timeline for external review.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-outline btn-sm" disabled={!audit.id} onClick={() => exportLegalJSON(audit.id)}>
            <Download size={13} /> Compliance JSON
          </button>
          <button className="btn btn-outline btn-sm" disabled={!audit.id} onClick={() => exportAnonJSON(audit.id)}>
            <FileText size={13} /> Export Anonymized Report
          </button>
          <button className="btn btn-outline btn-sm" disabled={!audit.id} onClick={downloadComplianceSheet}>
            <Download size={13} /> Compliance Sheet PDF
          </button>
        </div>
      </div>

      {/* Disclaimer Banner */}
      <div className="card" style={{ background: 'rgba(255, 154, 0, 0.05)', borderColor: 'var(--accent-dim)' }}>
        <div className="flex items-start gap-2">
          <Info size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
          <div>
            <div className="text-xs font-bold" style={{ color: 'var(--accent)' }}>DISCLAIMER: RISK INDICATORS ONLY</div>
            <div className="text-xs mt-1" style={{ color: 'var(--fg)' }}>
              This report highlights statistical risks based on fairness metrics and maps them to relevant compliance frameworks for {audit.domain} targeting {audit.jurisdiction}. 
              It does not constitute formal legal advice, nor does it definitively declare legal liability. 
              Consult with legal counsel before making compliance determinations.
            </div>
          </div>
        </div>
      </div>

      {regs.length === 0 ? (
        <div className="card flex items-center gap-3 py-8" style={{ background: 'rgba(6, 214, 160, 0.04)', borderColor: 'rgba(6, 214, 160, 0.2)' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
          <div className="text-sm font-medium" style={{ color: 'var(--success)' }}>No regulation risk indicators triggered.</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, borderColor: legalFocus ? 'var(--primary)' : 'var(--border)' }}>
            <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
              Framework Mapping Sheet
            </div>
            <table>
              <thead>
                <tr>
                  <th>Framework</th>
                  <th>Clause</th>
                  <th>Risk</th>
                  <th>Triggered By</th>
                  <th>Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {regs.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="font-medium">{r.regulation}</td>
                    <td>{r.clause}</td>
                    <td><span className={`badge ${sevBadge(r.compliance_risk)}`}>{r.compliance_risk || 'N/A'}</span></td>
                    <td>{r.triggered_by || r.indicator_note || '-'}</td>
                    <td>{r.recommended_mitigation || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs flex items-center justify-between" style={{ color: 'var(--muted)' }}>
            <span>{regs.length} compliance risk mappings triggered</span>
            <span className="badge badge-medium">Jurisdiction: {audit.jurisdiction || 'Global'}</span>
          </div>
          {regs.map((r: any, i: number) => (
            <div key={i} className="card" style={{ borderColor: r.compliance_risk?.includes('CRITICAL') ? 'rgba(255, 22, 93, 0.3)' : 'rgba(255, 154, 0, 0.2)' }}>
              <div className="flex items-start gap-3">
                <Scale size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{r.regulation}</span>
                    <span className={`badge ${sevBadge(r.compliance_risk)}`}>{r.compliance_risk} RISK</span>
                  </div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--primary)' }}>{r.clause}</div>
                  <div className="text-xs mb-2" style={{ color: 'var(--fg)' }}>{r.indicator_note || r.description}</div>
                  <div className="flex flex-col gap-1 text-xs px-3 py-2 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div><span style={{ color: 'var(--muted)' }}>Triggered by:</span> <strong style={{ color: 'var(--danger)' }}>{r.triggered_by}</strong></div>
                    <div><span style={{ color: 'var(--muted)' }}>Mitigation:</span> <span style={{ color: 'var(--success)' }}>{r.recommended_mitigation}</span></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <AuditTrailTimeline
        pipeline={audit.pipeline}
        pipelineMeta={audit.pipelineMeta}
        createdAt={audit.createdAt}
        updatedAt={audit.updatedAt}
      />
    </div>
  );
}

/* ---- Helpers ---- */
function Mini({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="page-title" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--placeholder)' }}>{sub}</div>
    </div>
  );
}
