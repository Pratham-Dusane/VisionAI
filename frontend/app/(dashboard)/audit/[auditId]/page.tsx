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
  getOrgSettings,
  runShadowTest,
  fetchNarrative,
  fetchFeatureLaundering,
  remediateBias,
  getDownloadMitigatedUrl,
  whatifPredict,
  whatifRandomRow,
  getCausalAnalysis,
} from '@/lib/api';
import { useState, useEffect, use, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Download, AlertTriangle, Shield, BarChart3,
  Brain, Wrench, Scale, CheckCircle2, Loader2, XCircle,
  Zap, Users, Eye, FileText, Layers, Info, Sparkles, Command, ArrowRight,
  MessageSquareText, Send, MessageCircle, Trash2, Ghost, RotateCcw, RefreshCw,
  Copy, Check,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';

const CausalGraph = dynamic(() => import('@/components/charts/CausalGraph'), { ssr: false });
import ProxyNetworkGraph from '@/components/charts/ProxyNetworkGraph';
import ShapSummaryChart from '@/components/charts/ShapSummaryChart';
import IntersectionalHeatmap from '@/components/charts/IntersectionalHeatmap';
import ParetoFrontier from '@/components/charts/ParetoFrontier';
import DimensionPillToggle from '@/components/charts/DimensionPillToggle';
import MasterDetailDistributionChart from '@/components/charts/MasterDetailDistributionChart';
import DisparityDumbbellChart from '@/components/charts/DisparityDumbbellChart';
import EqualizedOddsChart from '@/components/charts/EqualizedOddsChart';
import PredictiveParityChart from '@/components/charts/PredictiveParityChart';
import AuditTrailTimeline from '@/components/audit/AuditTrailTimeline';
import StakeholderToggle, { StakeholderMode } from '@/components/audit/StakeholderToggle';
import { buildDimensionOptions, CanonicalDimensionKey, getDimensionLabel, normalizeDimensionKey, summarizeLargestGroup } from '@/lib/analysis/dimensions';
import { joinFeaturesWithProxyRisk } from '@/lib/analysis/proxy-risk';
import ProxyRiskFeatureBars from '@/components/charts/ProxyRiskFeatureBars';
import GroupImpactWaterfall from '@/components/charts/GroupImpactWaterfall';
import AuditRightSidebar from '@/components/audit/AuditRightSidebar';
import JustifiedBiasBadge from '@/components/audit/JustifiedBiasBadge';
import Image from 'next/image';

const BASE_TABS = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'data', label: 'Data Analysis', icon: BarChart3 },
  { key: 'model', label: 'Model Analysis', icon: Brain },
  { key: 'intersectional', label: 'Intersectional', icon: Layers },
  { key: 'explainability', label: 'Explainability', icon: Zap },
  { key: 'causal', label: 'Causal Fairness', icon: Shield },
  { key: 'results', label: 'Results', icon: Command },
  { key: 'narratives', label: 'AI Narratives', icon: Sparkles },
  { key: 'fixes', label: 'Fixes', icon: Wrench },
  { key: 'whatif', label: 'What-If', icon: Zap },
  { key: 'legal', label: 'Legal', icon: Scale },
];

const MODE_TAB_KEYS: Record<StakeholderMode, string[]> = {
  technical: ['overview', 'data', 'model', 'intersectional', 'explainability', 'causal', 'results', 'narratives', 'fixes', 'whatif', 'legal'],
  executive: ['overview', 'results', 'narratives', 'legal'],
  legal: ['overview', 'intersectional', 'results', 'legal', 'narratives'],
};

const MODE_DEFAULT_TAB: Record<StakeholderMode, string> = {
  technical: 'overview',
  executive: 'overview',
  legal: 'legal',
};

const GUIDED_SANDBOX_ARMED_KEY = 'visionai-guided-sandbox-armed';
const GUIDED_SANDBOX_DISABLED_KEY = 'visionai-guided-sandbox-disabled';

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
  const [rsCollapsed, setRsCollapsed] = useState(false);
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redTeam, setRedTeam] = useState<any>(null);
  const [redTeamLoading, setRedTeamLoading] = useState(false);
  const [guidedSandboxActive, setGuidedSandboxActive] = useState(false);
  const [guidedBannerVisible, setGuidedBannerVisible] = useState(false);
  const [isFetchingLaundering, setIsFetchingLaundering] = useState(false);
  const isFetchingLaunderingRef = useRef(false);

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

  useEffect(() => {
    if (!audit?.id) return;

    try {
      const disabled = window.localStorage.getItem(GUIDED_SANDBOX_DISABLED_KEY) === '1';
      const armed = window.localStorage.getItem(GUIDED_SANDBOX_ARMED_KEY) === '1';

      if (!disabled && armed) {
        setStakeholderMode('technical');
        setTab('data');
        setGuidedSandboxActive(true);
        setGuidedBannerVisible(true);
        window.localStorage.removeItem(GUIDED_SANDBOX_ARMED_KEY);
      }
    } catch {
      // Ignore storage access issues and continue normal render flow.
    }
  }, [audit?.id]);

  useEffect(() => {
    // Lazy fetch feature laundering if missing
    if (audit && audit.status === 'COMPLETE' && audit.featureLaundering === null && !isFetchingLaunderingRef.current) {
      isFetchingLaunderingRef.current = true;
      setIsFetchingLaundering(true);
      let cancelled = false;

      (async () => {
        try {
          const data = await fetchFeatureLaundering(audit.id);
          if (!cancelled) {
            setAudit((prev: any) => ({
              ...prev,
              featureLaundering: data.featureLaundering || [],
              severity: data.severity || prev.severity,
              regulationMap: data.regulationMap || prev.regulationMap,
            }));
          }
        } catch (e) {
          console.error('Failed to load feature laundering', e);
          if (!cancelled) {
            setAudit((prev: any) => ({ ...prev, featureLaundering: [] }));
          }
        } finally {
          isFetchingLaunderingRef.current = false;
          if (!cancelled) setIsFetchingLaundering(false);
        }
      })();

      return () => { cancelled = true; };
    }
  }, [audit?.id, audit?.status, audit?.featureLaundering]);

  // Show processing state - skeleton shimmer layout
  if (loading || (audit && audit.status === 'PROCESSING')) {
    const pipeline = audit?.pipeline || {};
    const steps = Object.entries(pipeline);
    return (
      <>
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: audit?.name || 'Analyzing...' }]} />
        <div className="flex-1 p-4 sm:p-6 space-y-3 animate-fade-in">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
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
  const tabs = getTabs(stakeholderMode).filter((t) => {
    if (t.key === 'whatif' && audit?.dataOnly) return false;
    return true;
  });
  const visibleTabKeys = new Set(tabs.map((t) => t.key));

  function dismissGuidedSandbox() {
    setGuidedBannerVisible(false);
    setGuidedSandboxActive(false);
  }

  function skipGuidedSandbox() {
    setGuidedBannerVisible(false);
    setGuidedSandboxActive(false);
    try {
      window.localStorage.setItem(GUIDED_SANDBOX_DISABLED_KEY, '1');
      window.localStorage.removeItem(GUIDED_SANDBOX_ARMED_KEY);
    } catch {
      // Ignore storage write failures.
    }
  }

  function retriggerGuidedSandbox() {
    try {
      window.localStorage.removeItem(GUIDED_SANDBOX_DISABLED_KEY);
    } catch {
      // Ignore storage write failures.
    }
    setStakeholderMode('technical');
    setTab('data');
    setGuidedSandboxActive(true);
    setGuidedBannerVisible(true);
  }

  function handleGuidedMetricClick() {
    if (!guidedSandboxActive) return;

    if (visibleTabKeys.has('narratives')) {
      setTab('narratives');
    }
    setGuidedBannerVisible(false);
    setGuidedSandboxActive(false);
  }

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

      {guidedBannerVisible && (
        <div className="guided-sandbox-banner" role="status" aria-live="polite">
          <div className="guided-sandbox-banner-message">
            <Sparkles size={13} strokeWidth={2.2} />
            <span>You are viewing a simulated audit of a loan approval model. Click any metric to inspect the AI narrative.</span>
          </div>
          <div className="guided-sandbox-banner-actions">
            <button type="button" className="guided-sandbox-banner-btn" onClick={() => { setStakeholderMode('technical'); setTab('data'); }}>
              Show Metrics
            </button>
            <button type="button" className="guided-sandbox-banner-btn" onClick={dismissGuidedSandbox}>
              Dismiss
            </button>
            <button type="button" className="guided-sandbox-banner-btn guided-sandbox-banner-btn-critical" onClick={skipGuidedSandbox}>
              Skip Tour
            </button>
          </div>
        </div>
      )}

      <div className="audit-content-shell">
        <div className="audit-content-area">
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
          {isFetchingLaundering ? (
            <div className="skeleton shrink-0" style={{ width: 88, height: 88, borderRadius: '50%' }} title="Recomputing score with laundering data..." />
          ) : (
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
          )}

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
              {audit.model_identifier && (
                <>
                  <span>•</span>
                  <a
                    href={`/attestation/${encodeURIComponent(audit.model_identifier)}`}
                    className="inline-flex items-center gap-0.5 text-xs font-semibold hover:underline"
                    style={{ color: 'var(--primary)' }}
                  >
                    <Shield size={12} className="inline mr-0.5" />
                    Attestation Chain: {audit.model_identifier}
                  </a>
                </>
              )}
            </div>
            {sev.penalties?.length > 0 && (
              <div className="text-xs mt-1" style={{ color: 'var(--placeholder)' }}>
                {sev.penalties.length} penalty deductions applied
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <StakeholderToggle value={stakeholderMode} onChange={setStakeholderMode} />
            <div className="flex items-center gap-2">
              <button className="btn btn-outline btn-sm" onClick={onRunRedTeam} disabled={redTeamLoading || audit.dataOnly}>
                {redTeamLoading ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />} Red Team
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => exportPDF(auditId)}><Download size={13} /> PDF</button>
            </div>
          </div>
        </div>

        {/* Mobile Tabs fallback (hidden on desktop where right sidebar shows) */}
        <div className="tab-bar audit-mobile-tabs" style={{ overflowX: 'auto' }}>
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
        {visibleTabKeys.has('data') && tab === 'data' && (
          <DataTab
            audit={audit}
            guidedSandboxActive={guidedSandboxActive}
            onGuidedMetricClick={handleGuidedMetricClick}
          />
        )}
        {visibleTabKeys.has('model') && tab === 'model' && <ModelTab audit={audit} />}
        {visibleTabKeys.has('intersectional') && tab === 'intersectional' && <IntersectionalTab audit={audit} />}
        {visibleTabKeys.has('explainability') && tab === 'explainability' && <ExplainabilityTab audit={audit} />}
        {visibleTabKeys.has('results') && tab === 'results' && <ResultsTab audit={audit} onNavigateTab={setTab} visibleTabKeys={visibleTabKeys} />}
        {visibleTabKeys.has('narratives') && tab === 'narratives' && (
          <NarrativesTab
            audit={audit}
            mode={stakeholderMode}
            onNarrativeGenerated={(modeStr, narrativeStr) => {
              setAudit((prev: any) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  narratives: {
                    ...(prev.narratives || {}),
                    [modeStr]: narrativeStr,
                  },
                };
              });
            }}
          />
        )}
        {visibleTabKeys.has('fixes') && tab === 'fixes' && (
          <FixesTab
            audit={audit}
            stakeholderMode={stakeholderMode}
            onAuditUpdated={(updatedAudit: any) => setAudit(updatedAudit)}
          />
        )}
        {visibleTabKeys.has('causal') && tab === 'causal' && (
          <CausalTab audit={audit} />
        )}
        {visibleTabKeys.has('whatif') && tab === 'whatif' && (
          <WhatIfTab audit={audit} />
        )}
        {visibleTabKeys.has('legal') && tab === 'legal' && <LegalTab audit={audit} mode={stakeholderMode} />}
        </div>

        <AuditRightSidebar tabs={tabs} activeTab={tab} onTabChange={setTab} />
      </div>
    </>
  );
}

type ResultsSignalTone = 'success' | 'warning' | 'danger' | 'info';

type ResultsSignal = {
  title: string;
  value: string;
  detail: string;
  tone: ResultsSignalTone;
  tabKey?: string;
  tabLabel?: string;
};

type ResultsEvaluation = {
  summary: string;
  signals: ResultsSignal[];
  intent: 'flip' | 'data' | 'legal' | 'group' | 'explainability' | 'narrative' | 'readiness' | 'general';
  query: string;
};

function evaluateResultsCommand(query: string, audit: Record<string, unknown>) {
  const sev = (audit?.severity as Record<string, unknown>) || {};
  const fairnessScore = Number(sev.fairness_score ?? audit?.fairnessScore ?? 0);
  const grade = String(sev.letter_grade ?? audit?.letterGrade ?? '?');
  const thresholdScore = Number(audit?.threshold ?? 0.8) * 100;
  const proxies = (audit?.proxies as unknown[]) || [];
  const regs = (audit?.regulationMap as unknown[]) || [];
  const legalCritical = hasCriticalLegalTrigger(regs);
  const dataBias = (audit?.dataBias as Record<string, unknown>) || {};
  const dataBiasRows = Object.values(dataBias).map((raw) => {
    const row = (raw || {}) as Record<string, unknown>;
    const metrics = (row.metrics || {}) as Record<string, unknown>;
    const di = Number(metrics.disparate_impact ?? 1);
    return {
      attribute: String(row.attribute || 'unknown'),
      severity: String(row.severity || 'UNKNOWN').toUpperCase(),
      di,
      verdict: String(row.verdict || '-'),
    };
  });

  const criticalBiasRows = dataBiasRows
    .filter((row) => row.severity === 'CRITICAL' || row.severity === 'HIGH')
    .sort((a, b) => a.di - b.di);
  const topCriticalBias = criticalBiasRows[0] || null;

  const highBiasCount = Object.values(dataBias).filter((v: unknown) => {
    const severity = String((v as { severity?: string })?.severity || '').toUpperCase();
    return ['HIGH', 'CRITICAL'].includes(severity);
  }).length;

  const flipEntries = Object.entries(audit?.modelBias || {})
    .filter(([attr]) => attr !== '_equalized_odds')
    .map(([attr, data]: [string, unknown]) => ({
      attr,
      rate: Number((data as { max_flip_rate?: number })?.max_flip_rate || 0),
    }))
    .sort((a, b) => b.rate - a.rate);
  const topFlip = flipEntries[0] || null;
  const noGo = fairnessScore < thresholdScore || legalCritical;

  const q = query.trim().toLowerCase();
  const looksLikeFlip = /(flip|sensitivity|counterfactual|feature|perturb|riskiest feature|highest flip)/.test(q);
  const looksLikeData = /(proxy|distribution|dataset|column|data\s*bias|sample|bias|critical data|cirticial|alert|trigger)/.test(q);
  const looksLikeLegal = /(legal|compliance|regulation|liability|fine|clause)/.test(q);
  const looksLikeGroup = /(intersection|group|heatmap|disparate impact|equalized odds)/.test(q);
  const looksLikeExplain = /(explain|shap|importance|why)/.test(q);
  const looksLikeNarrative = /(narrative|summary|tldr|executive)/.test(q);
  const looksLikeReadiness = /(deploy|readiness|ready|go|no-go|ship|production|launch)/.test(q);

  const signals: ResultsSignal[] = [];

  signals.push({
    title: 'Fairness Baseline',
    value: `${fairnessScore.toFixed(0)}/100 (${grade})`,
    detail: `Threshold target is ${thresholdScore.toFixed(0)}.`,
    tone: fairnessScore < thresholdScore ? 'warning' : 'success',
    tabKey: 'overview',
    tabLabel: 'Overview',
  });

  if (looksLikeFlip || (!looksLikeData && !looksLikeLegal && !looksLikeGroup && !looksLikeExplain && !looksLikeNarrative)) {
    signals.push({
      title: 'Feature Flip Sensitivity',
      value: topFlip ? `${(topFlip.rate * 100).toFixed(1)}% max` : 'No flip data',
      detail: topFlip ? `${topFlip.attr} is currently the highest-risk attribute.` : 'Run a full model audit to populate flip sensitivity.',
      tone: topFlip && topFlip.rate > 0.1 ? 'danger' : 'info',
      tabKey: 'model',
      tabLabel: 'Model Analysis',
    });
  }

  if (looksLikeData || (!looksLikeFlip && !looksLikeLegal && !looksLikeGroup && !looksLikeExplain && !looksLikeNarrative)) {
    signals.push({
      title: 'Data and Proxy Pressure Test',
      value: `${proxies.length} proxies flagged`,
      detail: `${highBiasCount} high-severity data bias findings across protected attributes.`,
      tone: proxies.length > 0 || highBiasCount > 0 ? 'warning' : 'success',
      tabKey: 'data',
      tabLabel: 'Data Analysis',
    });
  }

  if (looksLikeGroup) {
    signals.push({
      title: 'Group Disparity Focus',
      value: 'Intersectional checks available',
      detail: 'Review subgroup deltas and disparity heatmap before deployment decisions.',
      tone: 'info',
      tabKey: 'intersectional',
      tabLabel: 'Intersectional',
    });
  }

  if (looksLikeExplain) {
    signals.push({
      title: 'Explainability Lens',
      value: 'SHAP and feature contributions ready',
      detail: 'Use explainability to validate whether mitigation changed causal signals, not just scores.',
      tone: 'info',
      tabKey: 'explainability',
      tabLabel: 'Explainability',
    });
  }

  if (looksLikeLegal || (!looksLikeFlip && !looksLikeData && !looksLikeGroup && !looksLikeExplain && !looksLikeNarrative)) {
    signals.push({
      title: 'Compliance Risk',
      value: legalCritical ? 'Critical trigger active' : 'No critical trigger',
      detail: `${regs.length} mapped regulation checks available for review.`,
      tone: legalCritical ? 'danger' : 'success',
      tabKey: 'legal',
      tabLabel: 'Legal',
    });
  }

  if (looksLikeNarrative) {
    signals.push({
      title: 'Narrative Briefing',
      value: 'Executive and legal narratives ready',
      detail: 'Use AI Narratives to translate score movement into business and legal language.',
      tone: 'info',
      tabKey: 'narratives',
      tabLabel: 'AI Narratives',
    });
  }

  let intent: ResultsEvaluation['intent'] = 'general';
  if (looksLikeFlip) intent = 'flip';
  else if (looksLikeData) intent = 'data';
  else if (looksLikeLegal) intent = 'legal';
  else if (looksLikeGroup) intent = 'group';
  else if (looksLikeExplain) intent = 'explainability';
  else if (looksLikeNarrative) intent = 'narrative';
  else if (looksLikeReadiness) intent = 'readiness';

  let summary = `Fairness baseline is ${fairnessScore.toFixed(0)}/100 (${grade}). Use the command bar to pressure-test by flip rate, legal risk, proxies, or subgroup gaps.`;

  if (query.trim()) {
    if (intent === 'flip') {
      summary = topFlip
        ? `Highest flip-rate risk is ${topFlip.attr} at ${(topFlip.rate * 100).toFixed(1)}%. This is the strongest sensitivity hotspot in your current audit.`
        : 'Flip-rate metrics are not available yet for this audit. Run model analysis with protected attributes to populate sensitivity results.';
    } else if (intent === 'data') {
      summary = topCriticalBias
        ? `Most critical data bias appears on ${topCriticalBias.attribute} (DI ${topCriticalBias.di.toFixed(2)}, severity ${topCriticalBias.severity}). Review this first in Data Analysis.`
        : highBiasCount > 0
          ? `There are ${highBiasCount} high-severity data bias findings. Open Data Analysis for attribute-level details.`
          : `No HIGH/CRITICAL data bias finding is currently flagged. Proxy and subgroup checks should still be reviewed before deployment.`;
    } else if (intent === 'legal') {
      summary = legalCritical
        ? `Compliance pressure is elevated: at least one critical legal trigger is active across ${regs.length} mapped checks.`
        : `No critical legal trigger is active right now across ${regs.length} mapped checks.`;
    } else if (intent === 'readiness') {
      summary = noGo
        ? `Deployment readiness: NO-GO for now. Fairness/legal guardrails are not fully satisfied.`
        : 'Deployment readiness: GO under current thresholds, with ongoing drift and subgroup monitoring.';
    } else {
      summary = `For \"${query.trim()}\", the strongest signal is fairness ${fairnessScore.toFixed(0)}/100 (${grade}) with ${legalCritical ? 'active legal escalation pressure.' : 'no critical legal trigger currently active.'}`;
    }
  }

  return { summary, signals, intent, query: query.trim() } as ResultsEvaluation;
}

function toneStyles(tone: ResultsSignalTone) {
  if (tone === 'success') {
    return { borderColor: 'color-mix(in srgb, var(--success) 28%, var(--border))', badge: 'var(--success)' };
  }
  if (tone === 'warning') {
    return { borderColor: 'color-mix(in srgb, var(--status-warning) 30%, var(--border))', badge: 'var(--status-warning)' };
  }
  if (tone === 'danger') {
    return { borderColor: 'color-mix(in srgb, var(--danger) 30%, var(--border))', badge: 'var(--danger)' };
  }
  return { borderColor: 'color-mix(in srgb, var(--primary) 24%, var(--border))', badge: 'var(--primary)' };
}

function ResultsTab({ audit, onNavigateTab, visibleTabKeys }: { audit: Record<string, unknown>; onNavigateTab: (tabKey: string) => void; visibleTabKeys: Set<string> }) {
  const [commandText, setCommandText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [runLoading, setRunLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [result, setResult] = useState<ResultsEvaluation>(() => evaluateResultsCommand('', audit));

  const quickPrompts = [
    'Show me the highest flip-rate risk',
    'What is my legal pressure right now?',
    'Where are the strongest subgroup disparities?',
    'Summarize deployment readiness',
  ];

  const runCommand = (raw: string) => {
    const query = raw.trim();
    if (!query) return;
    setRunLoading(true);
    window.setTimeout(() => {
      setResult(evaluateResultsCommand(query, audit));
      setHistory((prev) => [query, ...prev.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 5));
      setLastRunAt(Date.now());
      setRunLoading(false);
    }, 180);
  };

  return (
    <div className="space-y-4">
      <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--primary) 20%, var(--border))', background: 'color-mix(in srgb, var(--surface) 90%, transparent)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Command size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Results Command Bar</span>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--placeholder)' }}>Frontend-only local evaluator</span>
        </div>

        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runCommand(commandText);
          }}
        >
          <input
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            className="input flex-1"
            placeholder="Ask: Show me the flip rate for female applicants over 40"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!commandText.trim()}>
            {runLoading ? <Loader2 size={13} className="animate-spin" /> : null}
            {runLoading ? 'Running...' : 'Run'}
          </button>
        </form>

        {lastRunAt && (
          <div className="text-[11px] mt-2" style={{ color: 'var(--placeholder)' }}>
            Executed at {new Date(lastRunAt).toLocaleTimeString()} {result.query ? `for "${result.query}"` : ''}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="text-xs px-2.5 py-1.5 rounded-full"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              onClick={() => {
                setCommandText(prompt);
                runCommand(prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                className="text-[11px] px-2 py-1 rounded-md"
                style={{ background: 'var(--surface-2)', color: 'var(--placeholder)' }}
                onClick={() => {
                  setCommandText(item);
                  runCommand(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          {result.query ? (
            <>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>Question</div>
              <div className="text-sm mt-1" style={{ color: 'var(--fg)' }}>{result.query}</div>
              <div className="text-[11px] font-semibold mt-3" style={{ color: 'var(--primary)' }}>Answer</div>
              <div className="text-sm mt-1" style={{ color: 'var(--fg)' }}>{result.summary}</div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--placeholder)' }}>
                Intent detected: {result.intent}
              </div>
            </>
          ) : (
            <div className="text-sm" style={{ color: 'var(--muted)' }}>
              Run a question above to see the answer inline here.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {result.signals.map((signal) => {
          const style = toneStyles(signal.tone);
          return (
            <div
              key={`${signal.title}-${signal.value}`}
              className="card"
              style={{ borderColor: style.borderColor, background: 'color-mix(in srgb, var(--surface) 94%, transparent)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: style.badge }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{signal.title}</span>
              </div>
              <div className="text-lg font-black" style={{ color: 'var(--fg)' }}>{signal.value}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{signal.detail}</div>

              {signal.tabKey && visibleTabKeys.has(signal.tabKey) && (
                <button
                  type="button"
                  className="mt-3 btn btn-outline btn-sm"
                  onClick={() => onNavigateTab(signal.tabKey as string)}
                >
                  Open {signal.tabLabel || signal.tabKey}
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

  const primaryMetricLabel = 'Primary Compliance Signal';
  const primaryMetricValue = regs.length > 0 ? `${regs.length}` : '0';
  const primaryMetricSub = legalHeadline;
  const primaryMetricColor = regs.length > 0 ? 'var(--accent)' : 'var(--success)';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <Mini label="Fairness Score" value={`${sev.fairness_score ?? 0}`} sub={`Grade: ${sev.letter_grade ?? '?'}`}
          color={scoreColor(sev.fairness_score ?? 0)} />
        <Mini label={primaryMetricLabel} value={String(primaryMetricValue)}
          sub={primaryMetricSub} color={primaryMetricColor} />
        <Mini label="Proxy Variables" value={String(proxies.length)}
          sub={`${proxies.filter((p: any) => p.risk_level === 'HIGH').length} HIGH risk`}
          color={proxies.length > 0 ? 'var(--accent)' : 'var(--success)'} />
        <Mini label="Feature Laundering" 
          value={audit.featureLaundering === null ? '...' : String(laundering.filter((l: any) => l.laundering_detected).length)}
          sub={audit.featureLaundering === null ? 'Loading...' : `of ${laundering.length} tested`}
          color={audit.featureLaundering === null ? 'var(--muted)' : laundering.some((l: any) => l.laundering_detected) ? 'var(--danger)' : 'var(--success)'} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-sm">
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
function DataTab({
  audit,
  guidedSandboxActive = false,
  onGuidedMetricClick,
}: {
  audit: any;
  guidedSandboxActive?: boolean;
  onGuidedMetricClick?: () => void;
}) {
  const dataBias = audit.dataBias || {};
  const justifiedBias = audit.justifiedBias || {};
  const schema = audit.schema;
  const proxies = audit.proxies || [];
  const profiles = audit.profiles || [];
  const blindSpots = audit.blindSpots || [];
  const [activePanel, setActivePanel] = useState<'disparate' | 'distribution' | 'proxy' | 'schema' | 'blindspots'>('disparate');
  const dimensionOptions = useMemo(() => buildDimensionOptions(profiles, dataBias), [profiles, dataBias]);
  const [selectedDimensionKey, setSelectedDimensionKey] = useState<CanonicalDimensionKey | null>(null);

  useEffect(() => {
    if (dimensionOptions.length === 0) {
      setSelectedDimensionKey(null);
      return;
    }

    if (!selectedDimensionKey || !dimensionOptions.some((opt) => opt.key === selectedDimensionKey)) {
      setSelectedDimensionKey(dimensionOptions[0].key);
    }
  }, [dimensionOptions, selectedDimensionKey]);

  const selectedDimension = useMemo(() => {
    if (dimensionOptions.length === 0) return null;
    return dimensionOptions.find((opt) => opt.key === selectedDimensionKey) || dimensionOptions[0];
  }, [dimensionOptions, selectedDimensionKey]);

  const highestDisparityDimension = useMemo(() => {
    const ranked = dimensionOptions
      .filter((opt) => opt.disparateImpact != null)
      .sort((a, b) => Number(a.disparateImpact) - Number(b.disparateImpact));
    return ranked[0] || null;
  }, [dimensionOptions]);

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
          const isGuidedTarget = guidedSandboxActive && card.key === 'disparate';
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setActivePanel(card.key);
                if (guidedSandboxActive) {
                  onGuidedMetricClick?.();
                }
              }}
              className={`card text-left ${isGuidedTarget ? 'guided-sandbox-target-card' : ''}`}
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
        <div className="space-y-4">
          {dimensionOptions.length === 0 ? (
            <div className="card">
              <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>No supported dimensions available</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Expected one of: Age, Gender, Race, or Zip Code in the current audit payload.
              </div>
            </div>
          ) : (
            <>
              <DimensionPillToggle
                options={dimensionOptions.map((opt) => ({ key: opt.key, label: opt.label }))}
                selectedKey={selectedDimension?.key || null}
                onChange={setSelectedDimensionKey}
              />

              {selectedDimension && (
                <>
                  <MasterDetailDistributionChart
                    dimensionKey={selectedDimension.key}
                    dimensionLabel={selectedDimension.label}
                    profile={selectedDimension.profile}
                    disparateImpact={selectedDimension.disparateImpact}
                    severity={selectedDimension.severity}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="card" style={{ padding: '14px 16px' }}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                        Imbalance Warning
                      </div>
                      <div className="text-xs mt-1" style={{ color: selectedDimension.profile.imbalance_warning ? 'var(--status-warning)' : 'var(--muted)' }}>
                        {selectedDimension.profile.imbalance_warning
                          ? `Skew detected (${String(selectedDimension.profile.imbalance_ratio ?? '?')}x ratio).`
                          : 'No major imbalance warning detected in this lens.'}
                      </div>
                    </div>

                    <div className="card" style={{ padding: '14px 16px' }}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                        Group Count Summary
                      </div>
                      {(() => {
                        const largest = summarizeLargestGroup(selectedDimension.profile);
                        return (
                          <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                            {largest.totalGroups} groups tracked. Largest group is {largest.name} ({largest.percentage.toFixed(1)}%).
                          </div>
                        );
                      })()}
                    </div>

                    <div className="card" style={{ padding: '14px 16px' }}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                        Highest Disparity Hint
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                        {highestDisparityDimension?.disparateImpact == null
                          ? 'No severe disparate-impact hotspot detected across available dimensions.'
                          : highestDisparityDimension.key === selectedDimension.key
                            ? `Highest disparity is currently visible in this lens (DI ${highestDisparityDimension.disparateImpact.toFixed(2)}).`
                            : `Highest disparity appears in ${highestDisparityDimension.label} (DI ${highestDisparityDimension.disparateImpact.toFixed(2)}).`}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {activePanel === 'disparate' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            Disparate Impact Analysis
          </div>
          <table>
            <thead><tr>
              <th>Attribute</th><th>Privileged Group</th><th>DI Ratio</th><th>SPD</th><th>Pos Rate (Priv)</th><th>Pos Rate (Unpriv)</th><th>Verdict</th><th>Classification</th>
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
                  <td>
                    {justifiedBias[b.attribute] ? (
                      <JustifiedBiasBadge
                        classification={justifiedBias[b.attribute].classification}
                        rationale={justifiedBias[b.attribute].rationale}
                        confidence={justifiedBias[b.attribute].confidence}
                      />
                    ) : null}
                  </td>
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
            <span className="text-xs ml-auto inline-flex items-center gap-1 gemini-powered-label">
              <GeminiGlyph size={11} />
              Powered by Gemini
            </span>
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
function NarrativeTypewriter({ text, speedMs = 24, step = 2 }: { text: string; speedMs?: number; step?: number }) {
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    if (!text) return;
    const ticker = window.setInterval(() => {
      setVisibleChars((prev) => {
        const next = Math.min(prev + step, text.length);
        if (next >= text.length) window.clearInterval(ticker);
        return next;
      });
    }, speedMs);

    return () => window.clearInterval(ticker);
  }, [text, speedMs, step]);

  const done = visibleChars >= text.length;

  return (
    <div className="text-sm leading-relaxed ai-narrative-typewriter" style={{ color: 'var(--fg)' }}>
      {text.slice(0, visibleChars)}
      {!done && <span className="ai-narrative-caret" aria-hidden>|</span>}
    </div>
  );
}

function GeminiGlyph({ size = 14 }: { size?: number }) {
  return (
    <span className="gemini-glyph" style={{ width: size, height: size }} aria-hidden>
      <Image src="/gemini.png" alt="" width={size} height={size} />
    </span>
  );
}

function buildAuditChatContext(audit: any) {
  const sev = audit?.severity || {};
  const fairnessScore = Number(sev.fairness_score ?? audit?.fairnessScore ?? 0);
  const thresholdScore = Number(audit?.threshold ?? 0.8) * 100;
  const dataBiasRows = Object.values(audit?.dataBias || {}).map((raw: any) => ({
    attribute: String(raw?.attribute || 'unknown'),
    severity: String(raw?.severity || 'UNKNOWN').toUpperCase(),
    disparateImpact: Number(raw?.metrics?.disparate_impact ?? 1),
    verdict: String(raw?.verdict || '-'),
  }));
  const topCriticalBias = [...dataBiasRows]
    .filter((row) => row.severity === 'CRITICAL' || row.severity === 'HIGH')
    .sort((a, b) => a.disparateImpact - b.disparateImpact)[0] || null;

  const proxies = (audit?.proxies || []).map((p: any) => ({
    proxyColumn: p.proxy_column,
    protectedColumn: p.protected_column,
    score: Number(p.association_score || 0),
    riskLevel: p.risk_level,
  }));

  const topProxy = [...proxies].sort((a, b) => b.score - a.score)[0] || null;

  const topFlip = Object.entries(audit?.modelBias || {})
    .filter(([attr]) => attr !== '_equalized_odds')
    .map(([attr, data]: [string, any]) => ({ attr, rate: Number(data?.max_flip_rate || 0) }))
    .sort((a, b) => b.rate - a.rate)[0] || null;

  const legalChecks = (audit?.regulationMap || []).map((r: any) => ({
    regulation: r?.regulation,
    clause: r?.clause,
    complianceRisk: r?.compliance_risk,
    liability: r?.liability,
  }));

  const legalCritical = hasCriticalLegalTrigger(legalChecks);
  const noGo = fairnessScore < thresholdScore || legalCritical;

  const contextData = {
    auditName: audit?.name,
    domain: audit?.domain,
    fairnessScore,
    thresholdScore,
    noGo,
    topCriticalBias,
    topProxy,
    topFlip,
    legalCritical,
    legalChecks: legalChecks.slice(0, 6),
    protectedColumns: audit?.protectedCols || [],
  };

  const systemPrompt = `You are an AI compliance auditor. Answer strictly based on this audit context JSON: ${JSON.stringify(contextData)}. If asked for mitigations, reference the bias metrics in this context.`;

  return { contextData, systemPrompt };
}

function buildChatSuggestedPrompts(context: ReturnType<typeof buildAuditChatContext>, mode: StakeholderMode) {
  const topBiasAttr = context.contextData.topCriticalBias?.attribute || context.contextData.topFlip?.attr || 'the highest-risk variable';
  const modePrompt = mode === 'legal'
    ? 'Draft a legal mitigation ticket for JIRA from this audit.'
    : 'Draft a mitigation ticket for JIRA based on this audit.';

  return [
    `Why did ${topBiasAttr} trigger an alert?`,
    'What is the critical data bias here and what should we fix first?',
    modePrompt,
  ];
}

function buildNarrativeAssistantReply(question: string, audit: any, mode: StakeholderMode) {
  const { contextData, systemPrompt } = buildAuditChatContext(audit);
  const lower = question.toLowerCase();

  // Keep the scoped prompt available for future API calls and clearly enforced in local mode.
  const scoped = systemPrompt.length > 0;
  if (!scoped) {
    return {
      reply: 'I do not have audit context available yet. Please reopen this audit narrative and try again.',
      continuePrompt: 'Summarize current fairness and top risk once context is loaded.',
    };
  }

  if (/(change|update|edit).*(date)|date.*(change|update|edit)|20 april 2026/.test(lower)) {
    return {
      reply: 'I cannot directly edit stored audit artifacts from this chat panel. I can draft the exact update note: "Change internal audit report date to 20 April 2026" and you can keep it as a comment/ticket for follow-through.',
      continuePrompt: 'Draft the final comment text for this date change with owner and due date.',
    };
  }

  if (/(critical|cirticial|bias|data\s*bias|alert|trigger)/.test(lower)) {
    if (contextData.topCriticalBias) {
      return {
        reply: `Critical data bias is centered on ${contextData.topCriticalBias.attribute} with DI ${contextData.topCriticalBias.disparateImpact.toFixed(2)} (${contextData.topCriticalBias.severity}). Verdict: ${contextData.topCriticalBias.verdict}. ${contextData.topProxy ? `Top proxy pressure is ${contextData.topProxy.proxyColumn} -> ${contextData.topProxy.protectedColumn} (${contextData.topProxy.score.toFixed(2)}).` : ''}`,
        continuePrompt: `Give me 3 concrete mitigations for ${contextData.topCriticalBias.attribute} with validation checks.`,
      };
    }
    return {
      reply: 'No HIGH/CRITICAL data bias entry is currently flagged in this audit context. Continue monitoring subgroup DI and proxy behavior before deployment.',
      continuePrompt: 'Show me the next strongest non-critical bias risk in this audit.',
    };
  }

  if (/(jira|mitigation\s*ticket|ticket|remediation)/.test(lower)) {
    const target = contextData.topCriticalBias?.attribute || contextData.topFlip?.attr || 'highest-risk attribute';
    const di = contextData.topCriticalBias?.disparateImpact;
    return {
      reply: `JIRA Draft: Title: Mitigate fairness risk for ${target}. Description: Audit ${contextData.auditName} detected elevated bias${Number.isFinite(di) ? ` (DI ${Number(di).toFixed(2)})` : ''}. Tasks: (1) review feature encoding and proxy leakage, (2) retrain with fairness constraints, (3) re-run audit and confirm DI >= 0.80 and reduced flip sensitivity.`,
      continuePrompt: `Expand this JIRA ticket with acceptance criteria and rollback plan.`,
    };
  }

  if (/(flip|sensitivity|counterfactual|feature)/.test(lower)) {
    if (!contextData.topFlip) {
      return {
        reply: 'No flip sensitivity metrics are available yet for this audit context.',
        continuePrompt: 'Explain what inputs are needed to compute flip sensitivity.',
      };
    }
    return {
      reply: `Top flip sensitivity is ${contextData.topFlip.attr} at ${(contextData.topFlip.rate * 100).toFixed(1)}%. This is the most unstable decision feature in the current audit context.`,
      continuePrompt: `What mitigation should we try first for ${contextData.topFlip.attr}?`,
    };
  }

  if (/(legal|compliance|liability|fine|regulation|clause)/.test(lower)) {
    return {
      reply: contextData.legalCritical
        ? `Legal pressure is elevated in this audit context: at least one critical mapped regulation trigger is active. Fairness is ${contextData.fairnessScore.toFixed(0)} vs threshold ${contextData.thresholdScore.toFixed(0)}.`
        : `No critical legal trigger is active in this audit context. Fairness is ${contextData.fairnessScore.toFixed(0)} vs threshold ${contextData.thresholdScore.toFixed(0)}.`,
      continuePrompt: 'List the legal checks and the exact evidence we should attach for compliance review.',
    };
  }

  if (/(deploy|go|no-go|ship|release|production|readiness)/.test(lower)) {
    return {
      reply: contextData.noGo
        ? 'Deployment recommendation is NO-GO for this audit context. Fairness and/or legal guardrails are not fully met.'
        : 'Deployment recommendation is GO under current thresholds, with continued drift and subgroup monitoring.',
      continuePrompt: 'Give me a final pre-deployment checklist from this audit context.',
    };
  }

  if (mode === 'executive') {
    return {
      reply: `Executive summary from current audit context: fairness ${contextData.fairnessScore.toFixed(0)}/100. ${contextData.legalCritical ? 'Critical legal attention required.' : 'No critical legal trigger.'}`,
      continuePrompt: 'Condense this into a 3-line board update.',
    };
  }

  if (mode === 'legal') {
    return {
      reply: `Legal summary from current audit context: fairness ${contextData.fairnessScore.toFixed(0)}/100 vs threshold ${contextData.thresholdScore.toFixed(0)}. ${contextData.legalCritical ? 'Critical mapped compliance signal present.' : 'No critical mapped compliance signal present.'}`,
      continuePrompt: 'Draft a legal memo stub citing the top compliance concern.',
    };
  }

  return {
    reply: `Technical summary from current audit context: fairness ${contextData.fairnessScore.toFixed(0)}/100, ${contextData.topFlip ? `highest flip ${contextData.topFlip.attr} ${(contextData.topFlip.rate * 100).toFixed(1)}%` : 'flip metrics limited'}, and ${contextData.legalCritical ? 'critical legal pressure active.' : 'no critical legal trigger.'}`,
    continuePrompt: 'Would you like me to keep talking and walk through mitigation priorities step-by-step?',
  };
}

function NarrativesTab({
  audit,
  mode,
  onNarrativeGenerated,
}: {
  audit: any;
  mode: StakeholderMode;
  onNarrativeGenerated?: (mode: string, narrative: string) => void;
}) {
  const narratives = audit.narratives || {};
  const [fullNarrativeOpen, setFullNarrativeOpen] = useState(false);
  const [fullNarrativeLoading, setFullNarrativeLoading] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<'chat' | 'comments'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [continuePrompt, setContinuePrompt] = useState('');
  const [commentFeedback, setCommentFeedback] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ id: number; role: 'user' | 'assistant'; text: string; createdAt: number }>>([
    {
      id: 1,
      role: 'assistant',
      text: 'Ask me anything about this audit narrative. I answer strictly from this audit context only.',
      createdAt: Date.now(),
    },
  ]);
  const [commentInput, setCommentInput] = useState('');
  const fullNarrativeTimerRef = useRef<number | null>(null);
  const chatReplyTimerRef = useRef<number | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const commentsStorageKey = `visionai-narrative-comments-${audit?.id || 'unknown'}`;
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: number }>>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(commentsStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const MODES = {
    executive: { label: 'Executive', desc: 'Board-ready summary' },
    technical: { label: 'Technical', desc: 'ML engineer deep-dive' },
    legal: { label: 'Legal', desc: 'Compliance assessment' },
  } as const;

  const [currentNarrative, setCurrentNarrative] = useState<string>(narratives[mode] || '');
  const [isFetchingNarrative, setIsFetchingNarrative] = useState(false);
  const isFetchingNarrativeRef = useRef(false);
  const fetchedNarratives = useRef<Record<string, string>>({});

  useEffect(() => {
    setCurrentNarrative(fetchedNarratives.current[mode] || audit.narratives?.[mode] || '');
    // Reset the ref when mode changes so a new fetch can happen
    isFetchingNarrativeRef.current = false;
  }, [mode, audit.narratives]);

  useEffect(() => {
    // If we don't have the narrative for this mode, fetch it lazy
    const alreadyHave = fetchedNarratives.current[mode] || audit.narratives?.[mode];
    if (!alreadyHave && !isFetchingNarrativeRef.current && audit?.id && audit?.status === 'COMPLETE') {
      isFetchingNarrativeRef.current = true;
      setIsFetchingNarrative(true);
      let cancelled = false;

      (async () => {
        try {
          const data = await fetchNarrative(audit.id, mode);
          if (!cancelled) {
            const nar = data.narrative || 'No narrative available.';
            fetchedNarratives.current[mode] = nar;
            setCurrentNarrative(nar);
            if (onNarrativeGenerated) {
              onNarrativeGenerated(mode, nar);
            }
          }
        } catch (e) {
          console.error('Failed to load narrative', e);
          if (!cancelled) {
            const errText = 'Narrative generation failed. Please try refreshing.';
            fetchedNarratives.current[mode] = errText;
            setCurrentNarrative(errText);
          }
        } finally {
          isFetchingNarrativeRef.current = false;
          if (!cancelled) setIsFetchingNarrative(false);
        }
      })();

      return () => { cancelled = true; };
    }
  }, [mode, audit?.id, audit?.status, audit.narratives]);

  const chatContext = useMemo(() => buildAuditChatContext(audit), [audit]);
  const suggestedPrompts = useMemo(() => buildChatSuggestedPrompts(chatContext, mode), [chatContext, mode]);
  const tldr = extractNarrativeTldr(currentNarrative, mode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(commentsStorageKey, JSON.stringify(comments));
  }, [comments, commentsStorageKey]);

  useEffect(() => {
    return () => {
      if (fullNarrativeTimerRef.current !== null) {
        window.clearTimeout(fullNarrativeTimerRef.current);
      }
      if (chatReplyTimerRef.current !== null) {
        window.clearTimeout(chatReplyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!chatListRef.current || drawerPanel !== 'chat') return;
    const container = chatListRef.current;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatLoading, drawerPanel]);

  const openFullNarrative = () => {
    if (fullNarrativeTimerRef.current !== null) {
      window.clearTimeout(fullNarrativeTimerRef.current);
    }
    setFullNarrativeLoading(true);
    setFullNarrativeOpen(true);
    setDrawerPanel('chat');
    fullNarrativeTimerRef.current = window.setTimeout(() => {
      setFullNarrativeLoading(false);
      fullNarrativeTimerRef.current = null;
    }, 360);
  };

  const closeFullNarrative = () => {
    if (fullNarrativeTimerRef.current !== null) {
      window.clearTimeout(fullNarrativeTimerRef.current);
      fullNarrativeTimerRef.current = null;
    }
    if (chatReplyTimerRef.current !== null) {
      window.clearTimeout(chatReplyTimerRef.current);
      chatReplyTimerRef.current = null;
    }
    setChatLoading(false);
    setFullNarrativeLoading(false);
    setFullNarrativeOpen(false);
  };

  const sendChat = async (questionOverride?: string, options?: { keepTalkingAuto?: boolean }) => {
    const question = (questionOverride ?? chatInput).trim();
    if (!question) return;
    const keepTalkingAuto = options?.keepTalkingAuto === true;

    const userMessage = { id: Date.now(), role: 'user' as const, text: question, createdAt: Date.now() };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setContinuePrompt('');
    setChatLoading(true);

    if (chatReplyTimerRef.current !== null) {
      window.clearTimeout(chatReplyTimerRef.current);
    }

    try {
      // Local overrides for UI specific actions
      const lower = question.toLowerCase();
      if (/(change|update|edit).*(date)|date.*(change|update|edit)|20 april 2026/.test(lower)) {
        setChatMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', text: 'I cannot directly edit stored audit artifacts from this chat panel. I can draft the exact update note: "Change internal audit report date to 20 April 2026" and you can keep it as a comment/ticket for follow-through.', createdAt: Date.now() }]);
        setContinuePrompt('Draft the final comment text for this date change with owner and due date.');
        setChatLoading(false);
        return;
      }

      // Format history for backend
      const historyForBackend = chatMessages.map(m => ({
        role: m.role,
        content: m.text
      }));

      // Call backend
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/audits/${audit.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          stakeholderMode: mode,
          history: historyForBackend
        })
      });

      if (!res.ok) {
        throw new Error('API Error');
      }

      const data = await res.json();
      
      setChatMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', text: data.reply, createdAt: Date.now() }]);
      setContinuePrompt(keepTalkingAuto ? '' : 'Any other questions?');
      setChatLoading(false);
    } catch (err) {
      console.error(err);
      // Fallback to local mock if backend fails
      const reply = buildNarrativeAssistantReply(question, audit, mode);
      setChatMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', text: reply.reply, createdAt: Date.now() }]);
      setContinuePrompt(keepTalkingAuto ? '' : (reply.continuePrompt || ''));
      setChatLoading(false);
    }
  };

  const askFromSelection = () => {
    const selected = window.getSelection?.()?.toString().trim() || '';
    if (!selected) return;
    const snippet = selected.length > 220 ? `${selected.slice(0, 220)}...` : selected;
    setChatInput(`Explain this excerpt: "${snippet}"`);
    setDrawerPanel('chat');
  };

  const addComment = () => {
    const text = commentInput.trim();
    if (!text) return;
    const next = { id: Date.now(), text, createdAt: Date.now() };
    setComments((prev) => [next, ...prev].slice(0, 80));
    setCommentInput('');
    setCommentFeedback('Comment saved. Note: comments annotate this audit view and do not auto-edit backend report artifacts.');
  };

  const deleteComment = (id: number) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  if (isFetchingNarrative) return (
    <div className="card text-center py-12">
      <Loader2 size={28} className="mx-auto mb-3 animate-spin" style={{ color: 'var(--primary)' }} />
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--fg)' }}>Generating AI Narrative...</div>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        Analyzing bias metrics and synthesizing the {mode} briefing. This takes about 5-15 seconds.
      </div>
    </div>
  );

  if (!currentNarrative) return (
    <div className="card text-center py-12">
      <Sparkles size={28} className="mx-auto mb-3" style={{ color: 'var(--primary)', opacity: 0.5 }} />
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--muted)' }}>No AI Narrative Available</div>
      <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
        Narratives are generated by Gemini AI. Check that your GEMINI_API_KEY is configured.
      </div>
    </div>
  );

  // Simple markdown renderer
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: any[] = [];
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
      <div className="card ai-narrative-glow" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
          Showing {MODES[mode].label} Narrative
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{MODES[mode].desc}</div>
      </div>

      <div className="card ai-narrative-glow" style={{ borderColor: 'var(--primary-dim)' }}>
        <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <GeminiGlyph size={14} />
          <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
            TLDR
          </span>
          <span className="text-xs ml-auto gemini-powered-label">Generated by Gemini AI</span>
        </div>
        <NarrativeTypewriter key={`${mode}-${tldr}`} text={tldr} />
        <div className="mt-3">
          <button className="btn btn-outline btn-sm ai-narrative-cta gap-1" disabled={!currentNarrative} onClick={openFullNarrative}>
            <Sparkles size={12} />
            View Full Audit Narrative
          </button>
        </div>
      </div>

      {fullNarrativeOpen && (
        <>
          <div
            onClick={closeFullNarrative}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }}
          />
          <aside
            className="ai-narrative-drawer"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: 'min(1120px, 100vw)',
              height: '100vh',
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 201,
              padding: '20px 20px 28px 20px',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Sparkles size={14} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                {MODES[mode].label} Full Narrative
              </span>
              <button className="btn btn-outline btn-sm ml-auto" onClick={closeFullNarrative}>Close</button>
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
              <button
                className="btn btn-outline btn-sm"
                disabled={!currentNarrative}
                onClick={askFromSelection}
              >
                Ask about selection
              </button>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
              <div className="xl:col-span-3 card ai-narrative-glow" style={{ borderColor: 'var(--primary-dim)', minHeight: '68vh' }}>
                {fullNarrativeLoading ? (
                  <div className="space-y-3 py-2">
                    <div className="ai-narrative-skeleton" style={{ width: '100%' }} />
                    <div className="ai-narrative-skeleton" style={{ width: '96%' }} />
                    <div className="ai-narrative-skeleton" style={{ width: '92%' }} />
                    <div className="ai-narrative-skeleton" style={{ width: '85%' }} />
                    <div className="ai-narrative-skeleton" style={{ width: '98%' }} />
                  </div>
                ) : currentNarrative ? renderMarkdown(currentNarrative) : (
                  <div className="text-sm text-center py-8" style={{ color: 'var(--placeholder)' }}>
                    No narrative available for {mode} mode.
                  </div>
                )}
              </div>

              <div className="xl:col-span-2 space-y-3">
                <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setDrawerPanel('chat')}
                      style={{
                        borderColor: drawerPanel === 'chat' ? 'var(--primary)' : undefined,
                        color: drawerPanel === 'chat' ? 'var(--primary)' : undefined,
                      }}
                    >
                      <MessageCircle size={13} /> Chat
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setDrawerPanel('comments')}
                      style={{
                        borderColor: drawerPanel === 'comments' ? 'var(--primary)' : undefined,
                        color: drawerPanel === 'comments' ? 'var(--primary)' : undefined,
                      }}
                    >
                      <MessageSquareText size={13} /> Comments
                    </button>
                  </div>
                </div>

                {drawerPanel === 'chat' ? (
                  <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <GeminiGlyph size={14} />
                      <div className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Gemini Follow-up Chat</div>
                      <div className="text-[11px] ml-auto gemini-powered-label">Powered by Gemini</div>
                    </div>
                    <div className="text-[11px] mb-3" style={{ color: 'var(--placeholder)' }}>
                      Chat with the audit only. Current audit context JSON is injected into the local system prompt.
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {suggestedPrompts.slice(0, 3).map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="text-[11px] px-2.5 py-1.5 rounded-full"
                          style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--surface-2))', border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))', color: 'var(--primary)' }}
                          onClick={() => sendChat(prompt)}
                          disabled={chatLoading}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>

                    <div ref={chatListRef} className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                          style={{
                            background: msg.role === 'assistant' ? 'color-mix(in srgb, var(--primary) 10%, var(--surface-2))' : 'var(--surface-2)',
                            border: `1px solid ${msg.role === 'assistant' ? 'color-mix(in srgb, var(--primary) 25%, var(--border))' : 'var(--border)'}`,
                            color: 'var(--fg)',
                          }}
                        >
                          <div className="font-semibold mb-1" style={{ color: msg.role === 'assistant' ? 'var(--primary)' : 'var(--muted)' }}>
                            {msg.role === 'assistant' ? (
                              <span className="inline-flex items-center gap-1">
                                <GeminiGlyph size={11} />
                                Gemini
                              </span>
                            ) : 'You'}
                          </div>
                          {msg.role === 'assistant' ? (
                            <div className="chat-md-content" dangerouslySetInnerHTML={{ __html: (() => {
                              const raw = msg.text || '';
                              const lines = raw.split('\n');
                              const htmlParts: string[] = [];
                              let inList = false;

                              const fmt = (t: string) => t
                                .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--fg)">$1</strong>')
                                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                                .replace(/`(.+?)`/g, '<code style="background:var(--surface-2);padding:1px 4px;border-radius:3px;font-size:11px;color:var(--primary);border:1px solid var(--border)">$1</code>');

                              for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed) {
                                  if (inList) { htmlParts.push('</ul>'); inList = false; }
                                  continue;
                                }
                                if (trimmed.startsWith('## ')) {
                                  if (inList) { htmlParts.push('</ul>'); inList = false; }
                                  htmlParts.push(`<div style="font-weight:700;color:var(--primary);margin:6px 0 3px;font-size:12px">${fmt(trimmed.slice(3))}</div>`);
                                } else if (trimmed.startsWith('# ')) {
                                  if (inList) { htmlParts.push('</ul>'); inList = false; }
                                  htmlParts.push(`<div style="font-weight:700;color:var(--fg);margin:6px 0 3px;font-size:13px">${fmt(trimmed.slice(2))}</div>`);
                                } else if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
                                  if (!inList) { htmlParts.push('<ul style="margin:4px 0;padding-left:16px;list-style:disc">'); inList = true; }
                                  const content = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
                                  htmlParts.push(`<li style="margin:2px 0">${fmt(content)}</li>`);
                                } else {
                                  if (inList) { htmlParts.push('</ul>'); inList = false; }
                                  htmlParts.push(`<p style="margin:3px 0">${fmt(trimmed)}</p>`);
                                }
                              }
                              if (inList) htmlParts.push('</ul>');
                              return htmlParts.join('');
                            })() }} />
                          ) : msg.text}
                        </div>
                      ))}

                      {chatLoading && (
                        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'color-mix(in srgb, var(--primary) 8%, var(--surface-2))', color: 'var(--primary)' }}>
                          Gemini is drafting a response...
                        </div>
                      )}
                    </div>

                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendChat();
                      }}
                    >
                      <input
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="input flex-1"
                        placeholder="Ask about risks, legal pressure, or deployment readiness"
                      />
                      <button type="submit" className="btn btn-primary btn-sm" disabled={!chatInput.trim() || chatLoading}>
                        <Send size={12} />
                        Send
                      </button>
                    </form>

                    {continuePrompt && !chatLoading && (
                      <div className="mt-3 p-2.5 rounded-lg" style={{ background: 'color-mix(in srgb, var(--primary) 8%, var(--surface-2))', border: '1px solid color-mix(in srgb, var(--primary) 24%, var(--border))' }}>
                        <div className="text-[11px] mb-2" style={{ color: 'var(--muted)' }}>
                          Do you want to keep talking?
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => sendChat(continuePrompt, { keepTalkingAuto: true })}
                          >
                            Yes, keep talking
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setChatInput(continuePrompt);
                              setContinuePrompt('');
                              chatInputRef.current?.focus();
                            }}
                          >
                            Edit next question
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card" style={{ borderColor: 'var(--primary-dim)' }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--primary)' }}>Narrative Comments</div>
                    <div className="text-[11px] mb-3" style={{ color: 'var(--placeholder)' }}>
                      Comments persist in your browser for this audit.
                    </div>

                    <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                      {comments.length === 0 && (
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>No comments yet. Add one to start brainstorming.</div>
                      )}
                      {comments.map((comment) => (
                        <div key={comment.id} className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <div className="text-[11px] mb-1" style={{ color: 'var(--placeholder)' }}>
                            {new Date(comment.createdAt).toLocaleString()}
                          </div>
                          <div className="text-xs leading-relaxed" style={{ color: 'var(--fg)' }}>{comment.text}</div>
                          <div className="mt-2">
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => deleteComment(comment.id)}>
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 space-y-2">
                      <textarea
                        className="textarea w-full"
                        rows={3}
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Capture an observation, risk hypothesis, or mitigation idea"
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={addComment} disabled={!commentInput.trim()}>
                        Add comment
                      </button>
                      {commentFeedback && (
                        <div className="text-[11px]" style={{ color: 'var(--placeholder)' }}>{commentFeedback}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
  const flipAttributeEntries = Object.entries(modelBias || {}).filter(([k]) => k !== '_equalized_odds');
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
  const [expandedFlipAttr, setExpandedFlipAttr] = useState<string | null>(null);

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

  /* ---- Phase D: dimension + metric toggles ---- */
  const [modelMetric, setModelMetric] = useState<'fpr' | 'fnr'>('fpr');

  const eqOddsDimensions = useMemo(() => {
    return Object.keys(eqOdds).filter((k) => Object.keys(eqOdds[k] || {}).length >= 2);
  }, [eqOdds]);

  const [modelDimension, setModelDimension] = useState<string>(eqOddsDimensions[0] || '');

  useEffect(() => {
    if (eqOddsDimensions.length > 0 && !eqOddsDimensions.includes(modelDimension)) {
      setModelDimension(eqOddsDimensions[0]);
    }
  }, [eqOddsDimensions, modelDimension]);

  const resolveBaseline = (dim: string) => {
    const biasEntry = Object.values(audit.dataBias || {}).find(
      (b: any) => String(b?.attribute || '').toLowerCase().replace(/[^a-z]/g, '') === dim.toLowerCase().replace(/[^a-z]/g, ''),
    ) as any;
    if (biasEntry?.privileged_group || biasEntry?.privilegedGroup) {
      return biasEntry.privileged_group || biasEntry.privilegedGroup;
    }
    const groups = Object.keys(eqOdds[dim] || {});
    return groups[0] || '';
  };

  const baselineGroup = resolveBaseline(modelDimension);

  const dumbbellRows = useMemo(() => {
    const dimData = eqOdds[modelDimension] || {};
    const baseMetrics = dimData[baselineGroup];
    if (!baseMetrics) return [];
    const baseVal = (baseMetrics[modelMetric] ?? 0) * 100;
    return Object.entries(dimData)
      .filter(([g]) => g !== baselineGroup)
      .map(([group, metrics]: [string, any]) => {
        const val = (metrics[modelMetric] ?? 0) * 100;
        return { group, baselineValue: baseVal, value: val, delta: val - baseVal };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [eqOdds, modelDimension, modelMetric, baselineGroup]);

  const validationRows = useMemo(() => {
    const dimData = eqOdds[modelDimension] || {};
    const baseMetrics = dimData[baselineGroup];
    if (!baseMetrics) return [];
    return Object.entries(dimData).map(([group, metrics]: [string, any]) => {
      const fpr = (metrics.fpr ?? 0) * 100;
      const fnr = (metrics.fnr ?? 0) * 100;
      const precision = (metrics.precision ?? 0) * 100;
      const baseFpr = (baseMetrics.fpr ?? 0) * 100;
      const baseFnr = (baseMetrics.fnr ?? 0) * 100;
      const deltaFpr = fpr - baseFpr;
      const deltaFnr = fnr - baseFnr;
      return { group, fpr, fnr, precision, deltaFpr, deltaFnr, isBaseline: group === baselineGroup };
    });
  }, [eqOdds, modelDimension, baselineGroup]);

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

  const getFlipRateBand = (rate: number) => {
    if (rate >= 0.1) return { label: 'Critical', cls: 'flip-rate-pill critical' };
    if (rate >= 0.05) return { label: 'Elevated', cls: 'flip-rate-pill warning' };
    return { label: 'Stable', cls: 'flip-rate-pill safe' };
  };

  return (
    <div className="space-y-3">
      {/* ---- Phase D: Consolidated Controls & CSS Grid of Charts ---- */}
      {eqOddsDimensions.length > 0 && (
        <>
          {/* Sticky Consolidated Control Bar */}
          <div className="card sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 p-4 shadow-sm border-[var(--border)]" style={{ background: 'var(--surface)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Dimension:</span>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Model dimension selector">
                {eqOddsDimensions.map((dim) => {
                  const active = modelDimension === dim;
                  return (
                    <button
                      key={dim}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setModelDimension(dim)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer"
                      style={{
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        background: active ? 'var(--primary-dim)' : 'var(--surface-2)',
                        color: active ? 'var(--primary)' : 'var(--muted)',
                      }}
                    >
                      {dim.charAt(0).toUpperCase() + dim.slice(1).replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Metric:</span>
              <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                {(['fpr', 'fnr'] as const).map((m) => {
                  const active = modelMetric === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModelMetric(m)}
                      className="px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer"
                      style={{
                        background: active ? 'var(--primary)' : 'var(--surface)',
                        color: active ? '#fff' : 'var(--muted)',
                        border: 'none',
                      }}
                    >
                      {m === 'fpr' ? 'False Positive Rate' : 'False Negative Rate'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-4 animate-fade-in">
            {/* Dumbbell Chart */}
            <div className="chart-card">
              <DisparityDumbbellChart
                dimensionLabel={modelDimension.charAt(0).toUpperCase() + modelDimension.slice(1).replace(/_/g, ' ')}
                metric={modelMetric}
                baselineGroup={baselineGroup}
                rows={dumbbellRows}
              />
            </div>

            {/* Phase D2: Raw Validation Table */}
            {validationRows.length > 0 && (
              <div className="chart-card flex flex-col justify-between" style={{ padding: 0, overflow: 'hidden' }}>
                <div>
                  <div className="px-5 py-4 text-xs font-bold uppercase tracking-wider border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                    FPR / FNR Validation - {modelDimension.charAt(0).toUpperCase() + modelDimension.slice(1).replace(/_/g, ' ')}
                    <span className="ml-2 text-[10px] font-normal lowercase" style={{ color: 'var(--placeholder)' }}>
                      (Baseline: {baselineGroup})
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Group</th>
                          <th>FPR</th>
                          <th>FNR</th>
                          <th>Precision</th>
                          <th>Δ FPR</th>
                          <th>Δ FNR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationRows.map((row) => {
                          const deltaColor = (d: number) => {
                            const abs = Math.abs(d);
                            if (abs >= 10) return 'var(--danger)';
                            if (abs >= 5) return 'var(--status-warning)';
                            return 'var(--muted)';
                          };
                          return (
                            <tr key={row.group}>
                              <td className="font-medium">
                                {row.group}
                                {row.isBaseline && (
                                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
                                    baseline
                                  </span>
                                )}
                              </td>
                              <td style={{ color: row.fpr > 15 ? 'var(--danger)' : 'var(--muted)' }}>{row.fpr.toFixed(1)}%</td>
                              <td style={{ color: row.fnr > 15 ? 'var(--accent)' : 'var(--muted)' }}>{row.fnr.toFixed(1)}%</td>
                              <td>{row.precision.toFixed(1)}%</td>
                              <td style={{ color: deltaColor(row.deltaFpr), fontWeight: Math.abs(row.deltaFpr) >= 5 ? 600 : 400 }}>
                                {row.isBaseline ? '-' : `${row.deltaFpr > 0 ? '+' : ''}${row.deltaFpr.toFixed(1)} pp`}
                              </td>
                              <td style={{ color: deltaColor(row.deltaFnr), fontWeight: Math.abs(row.deltaFnr) >= 5 ? 600 : 400 }}>
                                {row.isBaseline ? '-' : `${row.deltaFnr > 0 ? '+' : ''}${row.deltaFnr.toFixed(1)} pp`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Row 2: Equalized Odds Chart */}
            {Object.keys(eqOdds).length > 0 && (
              <EqualizedOddsChart equalizedOdds={eqOdds} />
            )}

            {/* Row 2: Predictive Parity Chart */}
            {Object.keys(eqOdds).length > 0 && (
              <PredictiveParityChart equalizedOdds={eqOdds} />
            )}
          </div>
        </>
      )}

      {/* ---- Adversarial Applicant Simulator (existing) ---- */}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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
      {flipAttributeEntries.map(([attr, data]: [string, any]) => {
        const flips = Object.entries(data.flip_rates || {}).filter(([, r]: [string, any]) => r > 0);
        const topPreview = [...flips]
          .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
          .slice(0, 3);
        const totalTested = data.total_transitions_tested || Object.keys(data.flip_rates || {}).length;
        const isExpanded = expandedFlipAttr === attr;
        return (
          <div key={attr} className="card" style={{ padding: 0 }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Flip Rates - {attr}</span>
                <span className="text-xs" style={{ color: 'var(--placeholder)' }}>
                  ({flips.length} non-zero of {totalTested} tested)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${sevBadge(data.verdict)}`}>{data.verdict}</span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setExpandedFlipAttr((prev) => (prev === attr ? null : attr))}
                >
                  {isExpanded ? 'Hide details' : 'Show details'}
                </button>
              </div>
            </div>

            {!isExpanded && (
              <div className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                <div className="text-xs mb-2">
                  {(flips.length || 0)} non-zero transitions detected. Quick preview below.
                </div>
                {topPreview.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {topPreview.map(([transition, rate]: [string, any]) => {
                      const pct = (Number(rate) * 100).toFixed(1);
                      return (
                        <span
                          key={transition}
                          className="text-[10px] font-semibold px-2 py-1 rounded-full"
                          style={{
                            background: Number(rate) >= 0.1 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: Number(rate) >= 0.1 ? 'var(--danger)' : 'var(--accent)',
                            border: `1px solid ${Number(rate) >= 0.1 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                          }}
                        >
                          {transition}: {pct}%
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
                    No risky transitions to preview.
                  </div>
                )}
              </div>
            )}

            {isExpanded && flips.length > 0 ? (
              <table>
                <thead><tr><th>Transition</th><th>Flip Rate</th><th>Indicator</th></tr></thead>
                <tbody>
                  {flips.slice(0, 10).map(([trans, rate]: [string, any], idx: number) => {
                    const pct = Number(rate) * 100;
                    const band = getFlipRateBand(Number(rate));
                    return (
                      <tr key={trans} className={idx % 2 === 0 ? 'flip-rate-row-even' : 'flip-rate-row-odd'}>
                        <td className="font-medium">{trans}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={band.cls}>{pct.toFixed(1)}%</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--placeholder)' }}>
                              {band.label}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="w-20 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(rate * 100, 100)}%`, background: rate > 0.1 ? 'var(--danger)' : 'var(--success)' }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : isExpanded ? (
              <div className="px-4 py-3 text-xs" style={{ color: 'var(--placeholder)' }}>
                No prediction flips detected - model treats all {attr} groups equally.
              </div>
            ) : null}
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--placeholder)', borderTop: '1px solid var(--border)' }}>
              Max: {(data.max_flip_rate * 100).toFixed(1)}% | Mean: {(data.mean_flip_rate * 100).toFixed(1)}%
              {flips.length > 10 && <span> | Showing top 10 of {flips.length}</span>}
            </div>
          </div>
        );
      })}



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

      {/* Shadow Testing */}
      {!audit.dataOnly && audit.modelStoragePath && (
        <ShadowTestingCard auditId={audit.id} />
      )}
    </div>
  );
}

function ShadowTestingCard({ auditId }: { auditId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function onRun(requestPage = 1) {
    setLoading(true);
    setError('');
    if (requestPage === 1) setResult(null);
    try {
      const data = await runShadowTest(auditId, requestPage, pageSize);
      setResult(data);
      setPage(requestPage);
    } catch (e: any) {
      const errorMsg = e?.message || 'Shadow testing failed';
      if (errorMsg.includes('disabled') || errorMsg.includes('Enable it in Settings')) {
        setError('Shadow Testing is disabled. Enable it in Settings → Preferences.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  const summary = result?.summary;
  const results = result?.results || [];
  const pagination = result?.pagination;
  const intersections = summary?.intersections || [];
  const totalRows = pagination?.totalRows || 0;
  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--primary) 25%, var(--border))' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Ghost size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Generative Shadow Testing</span>
          <span className="badge badge-neutral" style={{ fontSize: 9 }}>ZERO-SHOT v2</span>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => onRun(1)} disabled={loading}>
          {loading ? <><Loader2 size={12} className="animate-spin" /> Running...</> : <><Ghost size={12} /> Run Shadow Test</>}
        </button>
      </div>

      <div className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
        Generates 100 synthetic profiles per missing intersection using approved-applicant median baselines.
        Tests how your model treats unseen demographic groups with statistically significant sample sizes.
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3" style={{ background: 'var(--danger-dim)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' }}>
          <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />
          <span className="text-xs" style={{ color: 'var(--danger)' }}>{error}</span>
        </div>
      )}

      {summary && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Profiles Generated</div>
              <div className="text-lg font-bold" style={{ color: 'var(--fg)' }}>{summary.totalGenerated?.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Baseline Positive Rate</div>
              <div className="text-lg font-bold" style={{ color: 'var(--fg)' }}>{(summary.baselinePositiveRate * 100).toFixed(1)}%</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Shadow Accepted</div>
              <div className="text-lg font-bold" style={{ color: 'var(--success)' }}>{summary.accepts}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Shadow Rejected</div>
              <div className="text-lg font-bold" style={{ color: 'var(--danger)' }}>{summary.rejects}</div>
            </div>
            <div className="p-3 rounded-lg" style={{
              background: summary.flaggedCount > 0 ? 'var(--danger-dim)' : 'var(--surface-2)',
              border: summary.flaggedCount > 0 ? '1px solid color-mix(in srgb, var(--danger) 25%, transparent)' : 'none'
            }}>
              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Disparities Flagged</div>
              <div className="text-lg font-bold" style={{ color: summary.flaggedCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {summary.flaggedCount}
              </div>
            </div>
          </div>

          {/* Intersection Summary Table */}
          {intersections.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                Per-Intersection Disparate Impact Analysis
              </div>
              <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Intersection</th>
                      <th style={{ textAlign: 'center' }}>n</th>
                      <th style={{ textAlign: 'center' }}>Approval Rate</th>
                      <th style={{ textAlign: 'center' }}>DI vs Baseline</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intersections.map((ix: any, idx: number) => (
                      <tr key={idx}>
                        <td className="text-xs font-medium">{ix.name}</td>
                        <td className="text-xs text-center font-mono">{ix.n}</td>
                        <td className="text-xs text-center font-mono">{(ix.approvalRate * 100).toFixed(1)}%</td>
                        <td className="text-xs text-center font-mono" style={{
                          color: ix.di < 0.8 ? 'var(--danger)' : ix.di < 1.0 ? 'var(--accent)' : 'var(--success)',
                          fontWeight: 700,
                        }}>
                          {ix.di?.toFixed(3)}
                        </td>
                        <td className="text-center">
                          {ix.disparity ? (
                            <span className="badge badge-critical" style={{ fontSize: 9 }}>⚠ DISPARITY</span>
                          ) : ix.n < 30 ? (
                            <span className="badge badge-neutral" style={{ fontSize: 9 }}>LOW n</span>
                          ) : (
                            <span className="badge badge-pass" style={{ fontSize: 9 }}>PASS</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--placeholder)' }}>
                Disparity flagged only when DI &lt; 0.80 AND n ≥ 30 (statistical significance threshold).
              </div>
            </div>
          )}

          {/* Detail Table — Paginated */}
          {results.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                Individual Shadow Profiles
              </div>
              <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Demographics</th>
                      <th>Key Financials</th>
                      <th>Score</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r: any) => (
                      <tr key={r.index}>
                        <td className="text-xs">{r.index + 1}</td>
                        <td className="text-xs">
                          {r.demographics ? Object.entries(r.demographics).map(([k, v]) => (
                            <span key={k} className="badge badge-neutral" style={{ marginRight: 4, fontSize: 10 }}>{k}: {String(v)}</span>
                          )) : '-'}
                        </td>
                        <td className="text-xs">
                          {r.financials ? Object.entries(r.financials).slice(0, 3).map(([k, v]) => (
                            <span key={k} className="text-[10px] mr-2" style={{ color: 'var(--muted)' }}>
                              {k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--fg)' }}>{typeof v === 'number' ? v.toLocaleString() : String(v)}</strong>
                            </span>
                          )) : '-'}
                        </td>
                        <td className="text-xs font-mono">{r.error ? '—' : r.score?.toFixed(4)}</td>
                        <td>
                          {r.error
                            ? <span className="badge badge-neutral">Error</span>
                            : <span className={`badge ${r.decision === 'ACCEPT' ? 'badge-pass' : 'badge-critical'}`}>{r.decision}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-3 px-1">
                <div className="text-[11px]" style={{ color: 'var(--placeholder)' }}>
                  Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalRows)} of {totalRows.toLocaleString()} profiles
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={page <= 1 || loading}
                    onClick={() => onRun(page - 1)}
                    style={{ fontSize: 11, padding: '2px 10px' }}
                  >
                    ← Prev
                  </button>
                  <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => onRun(page + 1)}
                    style={{ fontSize: 11, padding: '2px 10px' }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getContrastText(bgColorHexOrVar: string, isThemeDark: boolean): string {
  const clean = bgColorHexOrVar.trim().toLowerCase();
  
  if (clean.includes('var(--status-critical-dim)') || clean.includes('rgba(217, 48, 37')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--status-warning-dim)') || clean.includes('rgba(176, 96, 0')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--status-pass-dim)') || clean.includes('rgba(24, 128, 56')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--warning-dim)')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--surface-2)')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  
  if (clean.startsWith('rgba') || clean.startsWith('rgb')) {
    const match = clean.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      let a = 1.0;
      const matchFloat = clean.match(/[\d\.]+/g);
      if (matchFloat && matchFloat.length >= 4) {
        a = parseFloat(matchFloat[3]);
      }
      
      const bgR = isThemeDark ? 18 : 255;
      const bgG = isThemeDark ? 26 : 255;
      const bgB = isThemeDark ? 42 : 255;
      
      const blendR = r * a + bgR * (1 - a);
      const blendG = g * a + bgG * (1 - a);
      const blendB = b * a + bgB * (1 - a);
      
      const luminance = (0.2126 * blendR + 0.7152 * blendG + 0.0722 * blendB) / 255;
      return luminance > 0.5 ? '#111827' : '#F9FAFB';
    }
  }
  
  if (clean.startsWith('#')) {
    const r = parseInt(clean.slice(1, 3), 16) || 0;
    const g = parseInt(clean.slice(3, 5), 16) || 0;
    const b = parseInt(clean.slice(5, 7), 16) || 0;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.5 ? '#111827' : '#F9FAFB';
  }
  
  return isThemeDark ? '#F9FAFB' : '#111827';
}

/* Collapsible Intersection group */
function IntersectionGroup({ intersectionKey, items }: { intersectionKey: string; items: any[] }) {
  const [open, setOpen] = useState(false);
  const criticalCount = items.filter((d: any) => d.severity === 'CRITICAL').length;
  const highCount = items.filter((d: any) => d.severity === 'HIGH').length;
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';

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
            <span className="badge badge-critical" style={{ fontSize: '9px', padding: '1px 6px', color: isDark ? '#F9FAFB' : '#111827' }}>{criticalCount} CRITICAL</span>
          ) : highCount > 0 ? (
            <span className="badge badge-high" style={{ fontSize: '9px', padding: '1px 6px', color: isDark ? '#F9FAFB' : '#111827' }}>{highCount} HIGH</span>
          ) : (
            <span className="badge badge-pass" style={{ fontSize: '9px', padding: '1px 6px', color: isDark ? '#F9FAFB' : '#111827' }}>PASS</span>
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
                      <span 
                        className="ml-2 px-1.5 py-0.5 rounded text-xs" 
                        title={d.statistical_note}
                        style={{
                          background: isDark ? '#2A3040' : '#E9EEF6',
                          color: isDark ? '#F9FAFB' : '#111827'
                        }}
                      >
                        n&lt;30
                      </span>
                    )}
                  </td>
                  <td>{d.sample_size}</td>
                  <td>{(d.positive_rate * 100).toFixed(1)}%</td>
                  <td style={{ color: d.di_vs_overall < 0.8 && !d.low_confidence ? 'var(--danger)' : d.di_vs_overall >= 0.8 ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
                    {d.di_vs_overall?.toFixed(2)}</td>
                  <td>
                    <span 
                      className={`badge ${sevBadge(d.severity)}`}
                      style={{
                        color: getContrastText(
                          d.severity === 'CRITICAL' ? 'var(--status-critical-dim)' :
                          d.severity === 'HIGH' ? 'var(--status-warning-dim)' : 'var(--status-pass-dim)',
                          isDark
                        )
                      }}
                    >
                      {d.severity}
                    </span>
                  </td>
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
  const data = (audit.intersectional || []).map((d: any) => {
    if (d.sample_size < 30 && d.severity !== 'PASS') {
      return {
        ...d,
        severity: 'LOW_CONFIDENCE',
        low_confidence: true,
        statistical_note: 'Sample size below statistical significance threshold (n<30).'
      };
    }
    return d;
  });

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
  const proxies = audit.proxies || [];

  /* ---- Phase E: Group waterfall state ---- */
  const availableGroups = useMemo(() => {
    const groupSet = new Set<string>();
    for (const data of Object.values(explainability) as any[]) {
      for (const group of Object.keys(data?.shap_by_group || {})) {
        groupSet.add(group);
      }
    }
    return Array.from(groupSet).sort();
  }, [explainability]);

  const [selectedGroup, setSelectedGroup] = useState<string>(availableGroups[0] || '');

  useEffect(() => {
    if (availableGroups.length > 0 && !availableGroups.includes(selectedGroup)) {
      setSelectedGroup(availableGroups[0]);
    }
  }, [availableGroups, selectedGroup]);

  /* ---- Phase E2: Proxy-risk features ---- */
  const proxyRiskFeatures = useMemo(() => {
    const firstAttr = Object.values(explainability)[0] as any;
    const topFeatures = firstAttr?.top_features;
    if (!topFeatures || topFeatures.length === 0) return [];
    return joinFeaturesWithProxyRisk(topFeatures, proxies, 10);
  }, [explainability, proxies]);

  /* ---- Phase E3: Group waterfall SHAP values ---- */
  const groupShapValues = useMemo(() => {
    const merged: Record<string, number> = {};
    for (const data of Object.values(explainability) as any[]) {
      const groupData = data?.shap_by_group?.[selectedGroup];
      if (!groupData) continue;
      for (const [feature, value] of Object.entries(groupData)) {
        const current = merged[feature] ?? 0;
        if (Math.abs(Number(value)) > Math.abs(current)) {
          merged[feature] = Number(value);
        }
      }
    }
    return merged;
  }, [explainability, selectedGroup]);

  return (
    <div className="space-y-3">
      {/* Feature Laundering */}
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
          Feature Laundering Detection
        </div>
        {audit.featureLaundering === null ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--placeholder)' }}>
            <Loader2 size={24} className="mx-auto mb-3 animate-spin" style={{ color: 'var(--primary)' }} />
            Detecting proxy reconstruction via GBM...
          </div>
        ) : laundering.length === 0 ? (
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

      {/* SHAP Analysis - Phase E restructured */}
      {explainability && Object.keys(explainability).length > 0 ? (
        <>
          {/* ===== ZONE 1: GLOBAL IMPACT ===== */}
          <div className="card">
            <ProxyRiskFeatureBars features={proxyRiskFeatures} />
          </div>

          {/* SHAP Summary Chart (existing - kept for visual depth) */}
          <ShapSummaryChart explainability={explainability} />

          {/* ===== ZONE 2: LOCAL GROUP IMPACT ===== */}
          <div className="card space-y-4">
            {/* Demographic selector */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                Select Demographic Group
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Demographic group selector">
                {availableGroups.map((g) => {
                  const active = selectedGroup === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedGroup(g)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        background: active ? 'var(--primary-dim)' : 'var(--surface)',
                        color: active ? 'var(--primary)' : 'var(--muted)',
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Waterfall */}
            {selectedGroup && (
              <GroupImpactWaterfall shapValues={groupShapValues} group={selectedGroup} />
            )}
          </div>

          {/* Per-attribute SHAP Disparities (kept for completeness) */}
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
function FixesTab({
  audit,
  stakeholderMode,
  onAuditUpdated,
}: {
  audit: any;
  stakeholderMode: StakeholderMode;
  onAuditUpdated: (updatedAudit: any) => void;
}) {
  const dataBias = audit.dataBias || {};
  const justifiedBias = audit.justifiedBias || {};
  const laundering = audit.featureLaundering || [];
  const proxies = audit.proxies || [];
  const profiles = audit.profiles || [];
  const biasOrigin = audit.biasOriginTracer || [];

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [selectedFixIdx, setSelectedFixIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (audit.protectedCols && audit.protectedCols.length > 0 && !selectedAttribute) {
      setSelectedAttribute(audit.protectedCols[0]);
    }
  }, [audit.protectedCols, selectedAttribute]);

  const handleRemediate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const res = await remediateBias(audit.id);
      if (res.success) {
        onAuditUpdated({
          ...audit,
          mitigatedStoragePath: res.mitigatedStoragePath,
          mitigatedProfiles: res.mitigatedProfiles,
          mitigatedDataBias: res.mitigatedDataBias,
        });
      } else {
        setGenerationError("Failed to generate balanced dataset.");
      }
    } catch (err: any) {
      setGenerationError(err?.message || "An error occurred during dataset bias remediation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const originalAttrData = audit.dataBias?.[selectedAttribute] || {};
  const originalDI = originalAttrData?.metrics?.disparate_impact;
  const originalSPD = originalAttrData?.metrics?.statistical_parity_difference;

  const originalProfile = audit.profiles?.find((p: any) => p.attribute === selectedAttribute) || {};
  const originalCounts = originalProfile?.group_counts || {};
  const originalPcts = originalProfile?.group_percentages || {};
  const originalLabelDist = originalProfile?.label_distribution_per_group || {};

  const mitigatedAttrData = audit.mitigatedDataBias?.[selectedAttribute] || {};
  const mitigatedDI = mitigatedAttrData?.metrics?.disparate_impact;
  const mitigatedSPD = mitigatedAttrData?.metrics?.statistical_parity_difference;

  const mitigatedProfile = audit.mitigatedProfiles?.find((p: any) => p.attribute === selectedAttribute) || {};
  const mitigatedCounts = mitigatedProfile?.group_counts || {};
  const mitigatedPcts = mitigatedProfile?.group_percentages || {};
  const mitigatedLabelDist = mitigatedProfile?.label_distribution_per_group || {};

  const allGroups = Array.from(new Set([
    ...Object.keys(originalCounts),
    ...Object.keys(mitigatedCounts)
  ])).sort();

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

  // DI fixes — skip findings classified as JUSTIFIED by Gemini
  Object.values(dataBias).forEach((b: any) => {
    if (b.severity === 'CRITICAL' || b.severity === 'HIGH') {
      const jb = justifiedBias[b.attribute];
      if (jb?.classification === 'JUSTIFIED') return; // Domain-appropriate variance, skip fix
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

  const renderRemediationSection = () => {
    const isMitigated = !!audit.mitigatedStoragePath;
    
    return (
      <div className="card space-y-4" style={{ borderColor: isMitigated ? 'var(--primary-dim)' : 'var(--border)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale size={15} style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-semibold">Dataset Bias Remediation</span>
            <span className="badge badge-medium">Generative Mitigation</span>
          </div>
          {isMitigated && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Inspect Attribute:</span>
              <select 
                value={selectedAttribute} 
                onChange={(e) => setSelectedAttribute(e.target.value)}
                className="text-xs rounded border px-2 py-1"
                style={{ 
                  background: 'var(--surface-2)', 
                  borderColor: 'var(--border)', 
                  color: 'var(--fg)',
                  outline: 'none'
                }}
              >
                {audit.protectedCols?.map((col: string) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!isMitigated ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300" style={{ color: 'var(--fg)' }}>
              Automatically mitigate representation and label bias in the original dataset using Generative Synthetic Balancing. This process identifies demographic intersections and generates synthetic samples (with controlled Gaussian noise) for underrepresented cohorts to equalize representation and positive outcomes.
            </p>
            <div className="p-3 rounded-lg border space-y-2 text-xs" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="font-semibold" style={{ color: 'var(--primary)' }}>Generative Logic & Calibration Details:</div>
              <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--muted)' }}>
                <li>Identifies demographic intersections (e.g. Race × Gender).</li>
                <li>Generates synthetic rows targeting balanced cohort counts (<code style={{ color: 'var(--accent)' }}>max_count</code>).</li>
                <li>Coerces positive/negative features using class-specific medians (with ±10% noise) and modes.</li>
                <li>Ensures outcome labels align with the highest observed positive rate to mitigate historical bias.</li>
              </ul>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button 
                className="btn btn-outline btn-sm flex items-center gap-1.5"
                disabled={isGenerating}
                onClick={handleRemediate}
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Generating Balanced Dataset...
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    Generate Balanced Dataset
                  </>
                )}
              </button>
            </div>
            {generationError && (
              <div className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
                {generationError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border" style={{ background: 'rgba(6, 214, 160, 0.04)', borderColor: 'rgba(6, 214, 160, 0.2)' }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Mitigated Dataset Ready</div>
                  <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Saved as a new dataset in the cloud storage bucket.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={getDownloadMitigatedUrl(audit.id)} 
                  className="btn btn-outline btn-sm flex items-center gap-1.5"
                  style={{ cursor: 'pointer' }}
                >
                  <Download size={13} />
                  Download Mitigated Dataset
                </a>
                <button 
                  className="btn btn-outline btn-sm text-[11px] flex items-center gap-1.5"
                  disabled={isGenerating}
                  onClick={handleRemediate}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {isGenerating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Re-generate
                </button>
              </div>
            </div>
            
            {generationError && (
              <div className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
                {generationError}
              </div>
            )}
            
            {/* Comparison panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Original Stats Card */}
              <div className="card space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <div className="text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Original Dataset</div>
                
                <div className="grid grid-cols-2 gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--placeholder)' }}>Disparate Impact</div>
                    <div className="text-base font-bold" style={{ color: originalDI && originalDI < 0.8 ? 'var(--danger)' : 'var(--success)' }}>
                      {originalDI != null ? originalDI.toFixed(3) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--placeholder)' }}>Statistical Parity Diff</div>
                    <div className="text-base font-bold" style={{ color: originalSPD && Math.abs(originalSPD) > 0.1 ? 'var(--status-warning)' : 'var(--fg)' }}>
                      {originalSPD != null ? originalSPD.toFixed(3) : '-'}
                    </div>
                  </div>
                </div>
                
                {/* Distribution List */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-semibold" style={{ color: 'var(--placeholder)' }}>Cohort Distribution:</div>
                  {allGroups.map((group) => {
                    const count = originalCounts[group] || 0;
                    const pct = originalPcts[group] || 0;
                    const posRate = originalLabelDist[group]?.positive;
                    
                    return (
                      <div key={group} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold truncate" style={{ color: 'var(--fg)' }}>{group}</span>
                          <span style={{ color: 'var(--muted)' }}>{count.toLocaleString()} rows ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                          </div>
                          <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--success)' }}>Pos Rate: {posRate != null ? `${posRate.toFixed(1)}%` : '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mitigated Stats Card */}
              <div className="card space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--primary-dim)' }}>
                <div className="text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--primary)' }}>Mitigated Dataset (Balanced)</div>
                
                <div className="grid grid-cols-2 gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--placeholder)' }}>Disparate Impact</div>
                    <div className="text-base font-bold flex items-center gap-1.5" style={{ color: mitigatedDI && mitigatedDI < 0.8 ? 'var(--danger)' : 'var(--success)' }}>
                      {mitigatedDI != null ? mitigatedDI.toFixed(3) : '-'}
                      {originalDI != null && mitigatedDI != null && mitigatedDI > originalDI && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: 'var(--success)', background: 'rgba(6, 214, 160, 0.1)' }}>
                          +{((mitigatedDI - originalDI) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--placeholder)' }}>Statistical Parity Diff</div>
                    <div className="text-base font-bold" style={{ color: mitigatedSPD && Math.abs(mitigatedSPD) > 0.1 ? 'var(--status-warning)' : 'var(--success)' }}>
                      {mitigatedSPD != null ? mitigatedSPD.toFixed(3) : '-'}
                    </div>
                  </div>
                </div>
                
                {/* Distribution List */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-semibold" style={{ color: 'var(--placeholder)' }}>Cohort Distribution:</div>
                  {allGroups.map((group) => {
                    const count = mitigatedCounts[group] || 0;
                    const pct = mitigatedPcts[group] || 0;
                    const posRate = mitigatedLabelDist[group]?.positive;
                    
                    return (
                      <div key={group} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold truncate" style={{ color: 'var(--fg)' }}>{group}</span>
                          <span style={{ color: 'var(--muted)' }}>{count.toLocaleString()} rows ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                          </div>
                          <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--success)' }}>Pos Rate: {posRate != null ? `${posRate.toFixed(1)}%` : '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  if (fixes.length === 0) return (
    <div className="space-y-3">
      {biasOrigin.length > 0 && <BiasOriginTracerCard items={biasOrigin} />}
      {renderRemediationSection()}
      <ParetoFrontier auditId={audit.id} hasModel={!audit.dataOnly} initialParetoData={audit.paretoData} />
      <div className="card flex items-center gap-3 py-8" style={{ background: 'rgba(6, 214, 160, 0.04)', borderColor: 'rgba(6, 214, 160, 0.2)' }}>
        <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--success)' }}>No critical issues requiring fixes.</div>
      </div>
    </div>
  );

  const currentFix = fixes[selectedFixIdx] || fixes[0];
  const matchingTracer = currentFix ? biasOrigin.find((item: any) => 
    currentFix.title.toLowerCase().includes(item.attribute.toLowerCase()) || 
    currentFix.description.toLowerCase().includes(item.attribute.toLowerCase())
  ) : null;

  const handleCopyCode = () => {
    const snippet = CODE_SNIPPETS[currentFix?.technique];
    if (!snippet) return;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-3">
      {renderRemediationSection()}

      {/* Pareto Frontier */}
      <ParetoFrontier auditId={audit.id} hasModel={!audit.dataOnly} initialParetoData={audit.paretoData} />

      {stakeholderMode === 'legal' && (
        <div className="card" style={{ borderColor: 'var(--accent-dim)', background: 'var(--accent-dim)' }}>
          <div className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
            Legal interpretation: prioritize fixes where bias is amplified by the model, as these create additional liability beyond historical data bias.
          </div>
        </div>
      )}

      {/* Refactored Sidebar Layout */}
      <div className="card flex flex-col md:flex-row h-[560px] p-0 overflow-hidden border rounded-xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {/* Left Sidebar */}
        <div className="w-full md:w-72 flex flex-col border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--surface-2)] shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-[var(--border)] text-xs font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5 bg-[var(--surface-3)]">
            <Wrench size={13} className="text-[var(--primary)]" />
            Remediation Menu
          </div>
          <div className="flex-1 divide-y divide-[var(--border)]">
            {fixes.map((f, idx) => {
              const active = idx === selectedFixIdx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedFixIdx(idx)}
                  className={`w-full text-left p-3.5 transition-all flex flex-col gap-1 focus:outline-none ${
                    active 
                      ? 'bg-[var(--sidebar-active-bg)] border-l-4 border-[var(--sidebar-active-border)] text-[var(--sidebar-active-text)]' 
                      : 'hover:bg-[var(--border-light)] text-[var(--fg)]'
                  }`}
                  style={{ background: active ? 'var(--sidebar-active-bg)' : 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold leading-tight">{f.title}</span>
                    <span className={`badge ${sevBadge(f.severity)} text-[9px] px-1.5 py-0.5 rounded uppercase shrink-0`}>
                      {f.severity}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--muted)] truncate">{f.technique}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Content Area */}
        {currentFix ? (
          <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--fg)]">{currentFix.title}</h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">Remediation Strategy</p>
              </div>
              <span className={`badge ${sevBadge(currentFix.severity)}`}>
                {currentFix.severity} Severity
              </span>
            </div>

            {/* Description */}
            <div className="text-xs text-[var(--fg)] leading-relaxed bg-[var(--surface-2)] p-3.5 rounded-lg border border-[var(--border)]">
              {currentFix.description}
            </div>

            {/* KPIs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[10px] text-[var(--muted)] font-semibold uppercase block">Mitigation Technique</span>
                <span className="text-xs font-bold text-[var(--primary)] block mt-1">{currentFix.technique}</span>
              </div>
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[10px] text-[var(--muted)] font-semibold uppercase block">Projected Outcome</span>
                <span className="text-xs font-bold text-[var(--fg)] block mt-1">{currentFix.projected}</span>
              </div>
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[10px] text-[var(--muted)] font-semibold uppercase block">Projected Improvement</span>
                <span className="text-xs font-bold text-[var(--success)] block mt-1">+{currentFix.projectedImprovementPct}%</span>
              </div>
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[10px] text-[var(--muted)] font-semibold uppercase block">Estimated Accuracy Impact</span>
                <span className="text-xs font-bold text-[var(--accent)] block mt-1">{currentFix.accuracyImpact}</span>
              </div>
            </div>

            {/* Warnings (Bias Origin Tracer Integration) */}
            {matchingTracer && (
              <div 
                className="p-3.5 rounded-lg border flex gap-3 text-xs" 
                style={{ 
                  background: matchingTracer.origin === 'AMPLIFIED_BY_MODEL' ? 'rgba(255, 49, 95, 0.05)' : 'rgba(255, 181, 71, 0.05)',
                  borderColor: matchingTracer.origin === 'AMPLIFIED_BY_MODEL' ? 'rgba(255, 49, 95, 0.2)' : 'rgba(255, 181, 71, 0.2)' 
                }}
              >
                <AlertTriangle size={16} className={matchingTracer.origin === 'AMPLIFIED_BY_MODEL' ? 'text-[var(--danger)] shrink-0' : 'text-[var(--accent)] shrink-0'} />
                <div>
                  <strong className="block mb-1 font-bold" style={{ color: matchingTracer.origin === 'AMPLIFIED_BY_MODEL' ? 'var(--danger)' : 'var(--accent)' }}>
                    Bias Origin Tracer Alert: {matchingTracer.origin === 'AMPLIFIED_BY_MODEL' ? 'Model Amplification Detected' : 'Learned from Historical Data'}
                  </strong>
                  <span style={{ color: 'var(--fg)' }}>{matchingTracer.summary}</span>
                  <div className="text-[10px] text-[var(--muted)] mt-1.5 font-semibold">
                    Original Dataset DI: {matchingTracer.dataDI} | Model Predicted DI: {matchingTracer.modelDI}
                  </div>
                </div>
              </div>
            )}

            {/* Code Snippet */}
            {CODE_SNIPPETS[currentFix.technique] && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider block">Remediation Snippet (Python)</span>
                <div className="code-block-pro shadow-inner">
                  <div className="code-block-pro-header flex justify-between items-center px-3 py-1.5 bg-[var(--surface-3)] border-b border-[var(--border)]">
                    <span className="font-mono text-[10px] text-[var(--muted)]">python • {currentFix.technique}</span>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--surface-3)] hover:bg-[var(--border)] border border-[var(--border)] text-[10px] font-semibold transition-colors cursor-pointer text-[var(--muted)] hover:text-[var(--fg)]"
                      style={{ cursor: 'pointer' }}
                    >
                      {copied ? (
                        <>
                          <Check size={11} className="text-[var(--success)]" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 overflow-x-auto font-mono text-[11px] leading-relaxed bg-[var(--code-bg)] text-[var(--code-fg)]" style={{ margin: 0 }}>
                    <code>{highlightPython(CODE_SNIPPETS[currentFix.technique])}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted)]">
            Select a technique on the left to view mitigation steps.
          </div>
        )}
      </div>
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

function highlightPython(code: string) {
  const regex = /(#[^\n]*)|("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')|(\b(?:def|class|import|from|return|as|in|for|if|else|elif|try|except|and|or|not)\b)|(\b\w+(?=\())|([=+\-*\/%<>!&|^~]+)/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIdx = 0;
  
  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(code.substring(lastIndex, match.index));
    }
    
    if (match[1]) {
      // Comment
      parts.push(<span key={`c-${keyIdx++}`} className="cmt">{match[1]}</span>);
    } else if (match[2]) {
      // String
      parts.push(<span key={`s-${keyIdx++}`} className="str">{match[2]}</span>);
    } else if (match[3]) {
      // Keyword
      parts.push(<span key={`k-${keyIdx++}`} className="kw">{match[3]}</span>);
    } else if (match[4]) {
      // Function call/definition
      parts.push(<span key={`f-${keyIdx++}`} className="fn">{match[4]}</span>);
    } else if (match[5]) {
      // Operator
      parts.push(<span key={`o-${keyIdx++}`} className="op">{match[5]}</span>);
    }
    
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < code.length) {
    parts.push(code.substring(lastIndex));
  }
  
  return parts;
}

function FixCard({ fix }: { fix: any }) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippet = CODE_SNIPPETS[fix.technique] || null;

  const handleCopy = () => {
    if (!snippet) return;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="card animate-fade-in">
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
            <div className="code-block-pro mt-2 shadow-inner">
              <div className="code-block-pro-header">
                <span className="font-mono text-[10px]">python • {fix.technique}</span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--surface-3)] hover:bg-[var(--border)] border border-[var(--border)] text-[10px] font-semibold transition-colors cursor-pointer text-[var(--muted)] hover:text-[var(--fg)]"
                >
                  {copied ? (
                    <>
                      <Check size={11} className="text-[var(--success)]" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre>
                <code>{highlightPython(snippet)}</code>
              </pre>
            </div>
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

/* ==================== WHAT-IF SIMULATOR ==================== */
function WhatIfTab({ audit }: { audit: any }) {
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [mirroredProfile, setMirroredProfile] = useState<Record<string, any> | null>(null);
  const [mirroredResult, setMirroredResult] = useState<any>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const prevResultRef = useRef<any>(null);

  const loadRepresentative = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getSampleRow(audit.id);
      const row = data.sampleRow || {};
      setFeatures(row);
      setMirroredProfile(null);
      setMirroredResult(null);
      prevResultRef.current = null;
    } catch (err: any) {
      setError(err.message || 'Failed to load representative row');
    } finally {
      setLoading(false);
    }
  };

  const loadRandom = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await whatifRandomRow(audit.id);
      const row = data.features || {};
      setFeatures(row);
      setMirroredProfile(null);
      setMirroredResult(null);
      prevResultRef.current = null;
    } catch (err: any) {
      setError(err.message || 'Failed to load random row');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepresentative();
  }, [audit.id]);

  useEffect(() => {
    if (Object.keys(features).length === 0) return;

    const timer = setTimeout(async () => {
      try {
        setPredicting(true);
        setError('');
        const res = await whatifPredict(audit.id, features);
        if (result) {
          prevResultRef.current = result;
        }
        setResult(res);

        // Add to history
        setHistory((prev) => {
          const match = prev.find((h) => JSON.stringify(h.profile) === JSON.stringify(res.profile));
          if (match) return prev;
          return [res, ...prev].slice(0, 5);
        });

        // Update mirror comparison if active
        if (mirroredProfile) {
          const dataBias = audit.dataBias || {};
          const protectedCols = audit.config?.protectedCols || audit.protectedCols || [];
          const updatedMirrorProfile = { ...features };
          protectedCols.forEach((col: string) => {
            const biasRow: any = Object.values(dataBias).find((b: any) => b.attribute?.toLowerCase() === col.toLowerCase());
            if (biasRow && biasRow.privileged_group) {
              updatedMirrorProfile[col] = biasRow.privileged_group;
            } else if (biasRow && biasRow.privilegedGroup) {
              updatedMirrorProfile[col] = biasRow.privilegedGroup;
            }
          });
          setMirroredProfile(updatedMirrorProfile);
          try {
            setMirrorLoading(true);
            const mRes = await whatifPredict(audit.id, updatedMirrorProfile);
            setMirroredResult(mRes);
          } catch (e) {
            console.error('Failed to update mirror', e);
          } finally {
            setMirrorLoading(false);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to calculate prediction');
      } finally {
        setPredicting(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [features, audit.id]);

  const triggerMirror = async () => {
    if (Object.keys(features).length === 0) return;
    try {
      setMirrorLoading(true);
      const dataBias = audit.dataBias || {};
      const protectedCols = audit.config?.protectedCols || audit.protectedCols || [];
      const mirror = { ...features };
      protectedCols.forEach((col: string) => {
        const biasRow: any = Object.values(dataBias).find((b: any) => b.attribute?.toLowerCase() === col.toLowerCase());
        if (biasRow && biasRow.privileged_group) {
          mirror[col] = biasRow.privileged_group;
        } else if (biasRow && biasRow.privilegedGroup) {
          mirror[col] = biasRow.privilegedGroup;
        }
      });
      setMirroredProfile(mirror);
      const res = await whatifPredict(audit.id, mirror);
      setMirroredResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate mirror prediction');
    } finally {
      setMirrorLoading(false);
    }
  };

  const schema = audit.schema || {};
  const columns = schema.columns || [];
  const labelCol = audit.labelCol || audit.config?.labelCol || '';
  const protectedCols = audit.config?.protectedCols || audit.protectedCols || [];
  const featureColumns = columns.filter((c: any) => c.name !== labelCol);

  const isNumeric = (dtype: string) => {
    const d = String(dtype).toLowerCase();
    return d.includes('int') || d.includes('float') || d.includes('num') || d.includes('double');
  };

  // Sort contributions
  const contribs = Object.entries(result?.featureContributions || {}) as [string, number][];
  const sortedContribs = [...contribs]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8);
  const maxContrib = Math.max(...sortedContribs.map(([_, val]) => Math.abs(val)), 0.01);

  // Intersectional check
  const dataBias = audit.dataBias || {};
  const intersectional = audit.intersectional || [];
  const criticalIntersections = intersectional.filter((item: any) => {
    const colA = item.col_a || item.colA || '';
    const valA = item.val_a || item.valA || '';
    const colB = item.col_b || item.colB || '';
    const valB = item.val_b || item.valB || '';
    const severity = item.severity || '';

    return String(features[colA]) === String(valA) &&
           String(features[colB]) === String(valB) &&
           (severity === 'CRITICAL' || severity === 'HIGH');
  });

  return (
    <div className="whatif-container">
      {/* Left Panel - Dynamic Form */}
      <div className="whatif-left">
        <div className="whatif-section-header">Applicant Profile</div>
        <div className="whatif-toolbar">
          <button
            type="button"
            className="btn btn-outline btn-sm flex items-center gap-1.5"
            onClick={loadRepresentative}
            disabled={loading}
          >
            <RotateCcw size={13} /> Reset to Average
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm flex items-center gap-1.5"
            onClick={loadRandom}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Load Random Row
          </button>
        </div>

        {error && (
          <div className="card text-xs p-3 mb-2" style={{ color: 'var(--danger)', borderColor: 'rgba(255,22,93,0.2)', background: 'rgba(255,22,93,0.03)' }}>
            {error}
          </div>
        )}

        <div className="whatif-form-scroll card" style={{ padding: '16px' }}>
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-2">
              <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
              <span className="text-xs text-muted">Loading schema attributes...</span>
            </div>
          ) : featureColumns.length === 0 ? (
            <div className="whatif-empty-state">No schema columns available.</div>
          ) : (
            featureColumns.map((c: any) => {
              const isProtected = protectedCols.includes(c.name);
              const uniqueCount = c.unique_count ?? c.uniqueCount ?? 0;
              const sampleValues = c.sample_values ?? c.sampleValues ?? [];

              return (
                <div
                  key={c.name}
                  className={`whatif-field ${isProtected ? 'whatif-field-protected' : ''}`}
                >
                  <label className="whatif-field-label">
                    <span>{c.name}</span>
                    {isProtected && (
                      <span title="Protected Attribute under assessment">
                        <AlertTriangle
                          size={12}
                          className="whatif-protected-icon"
                        />
                      </span>
                    )}
                  </label>
                  {isNumeric(c.dtype) ? (
                    <input
                      type="number"
                      value={features[c.name] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setFeatures((prev) => ({ ...prev, [c.name]: val }));
                      }}
                    />
                  ) : uniqueCount <= 10 ? (
                    <select
                      value={features[c.name] ?? ''}
                      onChange={(e) => {
                        setFeatures((prev) => ({ ...prev, [c.name]: e.target.value }));
                      }}
                    >
                      <option value="">Select...</option>
                      {Array.from(new Set([...sampleValues, features[c.name]].filter(Boolean))).map((v: any) => (
                        <option key={v} value={v}>{String(v)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={features[c.name] ?? ''}
                      onChange={(e) => {
                        setFeatures((prev) => ({ ...prev, [c.name]: e.target.value }));
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Result Cards */}
      <div className="whatif-right">
        {/* Card 1: Prediction Result */}
        <div className={`whatif-prediction-card ${result?.decision === 'APPROVED' ? 'approved' : 'rejected'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="whatif-section-header" style={{ marginBottom: 0 }}>Prediction Result</span>
            {predicting && <Loader2 className="animate-spin" size={16} style={{ color: 'var(--primary)' }} />}
          </div>
          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={20} /></div>
          ) : !result ? (
            <div className="whatif-empty-state">Construct profile to see prediction</div>
          ) : (
            <>
              <div className={`whatif-prediction-label ${result.decision === 'APPROVED' ? 'approved' : 'rejected'}`}>
                {result.decision}
              </div>
              {result.confidence != null ? (
                <div className="whatif-confidence">
                  Confidence: {(result.confidence * 100).toFixed(1)}%
                </div>
              ) : (
                <div className="whatif-confidence">
                  Decision probability score: {result.rawScore?.toFixed(4)} (Threshold: {result.threshold})
                </div>
              )}

              {history.length > 0 && (
                <div className="whatif-history">
                  <span className="whatif-history-label">History:</span>
                  {history.map((h, index) => (
                    <div
                      key={index}
                      className={`whatif-history-dot ${h.decision === 'APPROVED' ? 'approved' : 'rejected'}`}
                      title={`Score: ${h.rawScore} - Click to load`}
                      onClick={() => {
                        setFeatures(h.profile);
                        setMirroredProfile(null);
                        setMirroredResult(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Card 2: Feature Influence */}
        <div className="whatif-contrib-card">
          <div className="whatif-section-header">Feature Influence</div>
          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={20} /></div>
          ) : sortedContribs.length === 0 ? (
            <div className="whatif-empty-state">No contribution statistics available.</div>
          ) : (
            <div className="space-y-3">
              {sortedContribs.map(([name, val]) => {
                const isPos = val > 0;
                const pct = maxContrib > 0 ? (Math.abs(val) / maxContrib) * 100 : 0;
                const valStr = isPos ? `+${val.toFixed(4)}` : val.toFixed(4);

                const prevVal = prevResultRef.current?.featureContributions?.[name];
                const hasPrev = prevVal !== undefined && prevVal !== null;
                const prevIsPos = prevVal > 0;
                const prevPct = hasPrev && maxContrib > 0 ? (Math.abs(prevVal) / maxContrib) * 100 : 0;

                return (
                  <div key={name} className="whatif-contrib-row">
                    <div className="whatif-contrib-name" title={name}>{name}</div>
                    <div className="whatif-contrib-track" style={{ position: 'relative' }}>
                      {/* Ghost bar (underneath, absolutely positioned) */}
                      {hasPrev && (
                        <div
                          className={`whatif-contrib-bar ${prevIsPos ? 'positive' : 'negative'}`}
                          style={{
                            width: `${prevPct}%`,
                            opacity: 0.22,
                            position: 'absolute',
                            top: 0,
                            zIndex: 1,
                            pointerEvents: 'none',
                          }}
                          title={`Previous value: ${prevVal.toFixed(4)}`}
                        />
                      )}
                      {/* Solid bar (current value, relatively positioned to layer on top) */}
                      <div
                        className={`whatif-contrib-bar ${isPos ? 'positive' : 'negative'}`}
                        style={{ width: `${pct}%`, position: 'relative', zIndex: 2 }}
                      />
                    </div>
                    <div className={`whatif-contrib-value ${isPos ? 'positive' : 'negative'}`}>
                      {valStr}
                    </div>
                  </div>
                );
              })}
              {prevResultRef.current && (
                <div className="text-[10px] text-center mt-2" style={{ color: 'var(--placeholder)' }}>
                  <span className="inline-block w-2.5 h-1.5 rounded mr-1" style={{ background: 'color-mix(in srgb, var(--muted) 35%, transparent)' }} />
                  Ghost = previous value, Solid = current value
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 3: Fairness Implication */}
        <div className="whatif-fairness-card">
          <div className="whatif-section-header">Fairness & Demographic Insights</div>
          
          {protectedCols.length === 0 ? (
            <div className="whatif-empty-state">No protected attributes configured.</div>
          ) : (
            <div className="space-y-3">
              {protectedCols.map((col: string) => {
                const currentVal = features[col];
                const biasRow: any = Object.values(dataBias).find((b: any) => b.attribute?.toLowerCase() === col.toLowerCase());
                if (!biasRow) return null;

                const privGroup = biasRow.privileged_group || biasRow.privilegedGroup;
                const isPrivileged = String(currentVal) === String(privGroup);
                const positiveRate = isPrivileged 
                  ? (biasRow.metrics?.positive_rate_privileged ?? biasRow.metrics?.positiveRatePrivileged)
                  : (biasRow.metrics?.positive_rate_unprivileged ?? biasRow.metrics?.positiveRateUnprivileged);
                const disparateImpact = biasRow.metrics?.disparate_impact ?? biasRow.metrics?.disparateImpact;

                return (
                  <div key={col} className="whatif-fairness-group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold uppercase">{col} ({currentVal || 'N/A'})</span>
                      <span className={`badge ${isPrivileged ? 'badge-pass' : 'badge-neutral'}`}>
                        {isPrivileged ? 'Privileged Group' : 'Unprivileged Group'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span style={{ color: 'var(--muted)' }}>Historical Approval:</span>{' '}
                        <strong>{positiveRate != null ? `${(positiveRate * 100).toFixed(1)}%` : 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)' }}>DI Ratio:</span>{' '}
                        <strong style={{ color: biasRow.verdict === 'FAIL' ? 'var(--danger)' : 'var(--success)' }}>
                          {disparateImpact != null ? disparateImpact.toFixed(2) : 'N/A'}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}

              {criticalIntersections.map((item: any, idx: number) => {
                const colA = item.col_a || item.colA;
                const colB = item.col_b || item.colB;
                const valA = item.val_a || item.valA;
                const valB = item.val_b || item.valB;
                const di = item.di_vs_overall ?? item.diVsOverall;
                return (
                  <div key={idx} className="whatif-fairness-group critical flex items-start gap-2">
                    <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                    <div className="text-xs">
                      <strong>Intersectional Risk Alert:</strong> Profile matches intersectional group{' '}
                      <span className="font-semibold">{valA} ({colA})</span> &{' '}
                      <span className="font-semibold">{valB} ({colB})</span> which has a critical bias rating{' '}
                      (DI: {di != null ? di.toFixed(2) : 'N/A'}).
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                className="btn btn-outline btn-sm w-full mt-2"
                onClick={triggerMirror}
                disabled={mirrorLoading || Object.keys(features).length === 0}
              >
                {mirrorLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Calculating Mirror...
                  </>
                ) : (
                  'Mirror to Privileged Group'
                )}
              </button>

              {mirroredResult && (
                <div className="whatif-mirror-grid">
                  <div className="whatif-mirror-cell">
                    <div className="text-[10px] font-bold uppercase text-muted mb-1" style={{ color: 'var(--muted)' }}>Current Profile</div>
                    <div className={`whatif-prediction-label ${result?.decision === 'APPROVED' ? 'approved' : 'rejected'}`}>
                      {result?.decision || 'REJECTED'}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--placeholder)' }}>
                      Score: {result?.rawScore?.toFixed(4)}
                    </div>
                  </div>
                  <div className="whatif-mirror-cell">
                    <div className="text-[10px] font-bold uppercase text-muted mb-1" style={{ color: 'var(--muted)' }}>Privileged Mirror</div>
                    <div className={`whatif-prediction-label ${mirroredResult.decision === 'APPROVED' ? 'approved' : 'rejected'}`}>
                      {mirroredResult.decision}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--placeholder)' }}>
                      Score: {mirroredResult.rawScore?.toFixed(4)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== CAUSAL FAIRNESS ==================== */
function CausalTab({ audit }: { audit: any }) {
  const [data, setData] = useState<any>(audit.causalFairness || null);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAttribute, setSelectedAttribute] = useState('');

  async function loadCausal(force = false) {
    try {
      if (force) {
        setRecomputing(true);
      } else {
        setLoading(true);
      }
      setError('');
      const res = await getCausalAnalysis(audit.id, force);
      setData(res);
      
      const attrs = Object.keys(res.per_attribute || {});
      if (attrs.length > 0) {
        if (!selectedAttribute || force || !attrs.includes(selectedAttribute)) {
          setSelectedAttribute(attrs[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Causal analysis execution failed');
    } finally {
      setLoading(false);
      setRecomputing(false);
    }
  }

  useEffect(() => {
    if (!data) {
      loadCausal(false);
    } else {
      const attrs = Object.keys(data.per_attribute || {});
      if (attrs.length > 0 && !selectedAttribute) {
        setSelectedAttribute(attrs[0]);
      }
    }
  }, [audit.id]);

  const protectedCols = audit.config?.protectedCols || audit.protectedCols || [];
  const labelCol = audit.labelCol || audit.config?.labelCol || '';

  if (loading) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 gap-3 min-h-[400px]">
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        <div className="text-sm font-semibold">Running Causal Inference Model...</div>
        <div className="text-xs text-muted max-w-sm text-center">
          Building causal DAG, querying Gemini, and running DoWhy path estimation on-demand. This may take 10-15 seconds.
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <XCircle size={40} style={{ color: 'var(--danger)', marginBottom: 12 }} />
        <h3 className="text-base font-semibold mb-1">Causal Inference Failed</h3>
        <p className="text-sm text-muted max-w-md">{error || 'Unable to retrieve causal graph findings.'}</p>
        <button
          className="btn btn-outline btn-sm mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  const selectedRes = data.per_attribute?.[selectedAttribute];
  const allAttributes = Object.keys(data.per_attribute || {});
  
  // Build chart data
  const chartData = allAttributes.map((attr) => {
    const res = data.per_attribute[attr];
    if (res?.error) return null;
    return {
      name: attr,
      Direct: Math.abs(res.direct_effect || 0),
      Indirect: Math.abs(res.indirect_effect || 0),
    };
  }).filter(Boolean);

  const getDiscBadge = (type: string) => {
    switch (type) {
      case 'DIRECT_DISCRIMINATION':
        return <span className="badge badge-critical">Direct Discrimination (High Risk)</span>;
      case 'INDIRECT_DISCRIMINATION':
        return <span className="badge badge-medium">Indirect Discrimination (Medium Risk)</span>;
      case 'MIXED_DISCRIMINATION':
        return <span className="badge badge-critical">Mixed Discrimination (High Risk)</span>;
      case 'NO_CAUSAL_EFFECT':
        return <span className="badge badge-pass">No Causal Disparity (Low Risk)</span>;
      default:
        return <span className="badge badge-neutral">Unknown Status</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in" style={{ animation: 'fade-in 0.3s ease-out' }}>
      {/* Top Row: Left (Decomposition Chart), Right (Estimation details & assessment) */}
      <div className="flex flex-wrap gap-6 w-full">
        {/* Left Column: Causal Effect Decomposition */}
        <div style={{ flex: '1 1 450px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="whatif-section-header">Causal Effect Decomposition</div>
            {chartData.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted flex-1 flex items-center justify-center">No estimation metrics computed.</div>
            ) : (
              <div className="w-full flex-1 min-h-[200px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis type="number" stroke="var(--muted)" fontSize={10} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={10} width={80} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                      labelStyle={{ color: 'var(--fg)', fontWeight: 600, fontSize: 11 }}
                      itemStyle={{ fontSize: 11 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Direct" name="Direct Causal Effect" stackId="a" fill="#34A853" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Indirect" name="Indirect Causal Effect" stackId="a" fill="#FBBC05" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Attribute Selector & Details / Assessment */}
        <div style={{ flex: '1 1 450px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Selector & Recalculate */}
          <div className="flex items-center justify-between flex-wrap gap-3 w-full">
            <div className="flex gap-1.5 flex-wrap">
              {allAttributes.map((attr) => (
                <button
                  key={attr}
                  type="button"
                  className={`btn btn-sm ${selectedAttribute === attr ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSelectedAttribute(attr)}
                >
                  {attr}
                </button>
              ))}
            </div>
            
            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-1.5 ml-auto"
              disabled={recomputing || loading}
              onClick={() => loadCausal(true)}
            >
              {recomputing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Recalculating...
                </>
              ) : (
                <>
                  <RefreshCw size={13} />
                  Force Recalculate
                </>
              )}
            </button>
          </div>

          {selectedRes ? (
            <div className="space-y-3">
              {/* Implication Details */}
              {selectedRes.error ? (
                <div className="card text-xs p-4" style={{ borderColor: 'rgba(255,22,93,0.3)', background: 'rgba(255,22,93,0.03)' }}>
                  <div className="font-semibold text-red-500 mb-1">Estimation Error</div>
                  <div style={{ color: 'var(--muted)' }}>{selectedRes.error}</div>
                  <div className="mt-2 text-[10px] text-muted italic">{selectedRes.fallback_note}</div>
                </div>
              ) : (
                <>
                  {/* Implication Card */}
                  <div className="card space-y-2" style={{ padding: '20px' }}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="whatif-section-header" style={{ marginBottom: 0 }}>Causal Assessment</span>
                      {getDiscBadge(selectedRes.discrimination_type)}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 text-center py-2.5 my-1 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div>
                        <div className="text-[10px] uppercase text-muted font-bold">Total Effect</div>
                        <div className="text-base font-extrabold">{selectedRes.total_causal_effect?.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted font-bold">Direct Effect</div>
                        <div className="text-base font-extrabold text-green-600" style={{ color: '#34A853' }}>
                          {selectedRes.direct_effect?.toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted font-bold">Indirect Effect</div>
                        <div className="text-base font-extrabold text-yellow-600" style={{ color: '#FBBC05' }}>
                          {selectedRes.indirect_effect?.toFixed(4)}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs pt-1">
                      <strong>Legal Standing:</strong>{' '}
                      <span style={{ color: 'var(--fg)' }}>{selectedRes.legal_implication}</span>
                    </div>
                  </div>

                  {/* Intervention Card */}
                  <div className="card" style={{ padding: '16px', borderColor: 'rgba(6, 214, 160, 0.2)', background: 'rgba(6, 214, 160, 0.03)' }}>
                    <div className="flex items-start gap-2.5 text-xs">
                      <Shield size={16} className="text-emerald-500 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                      <div>
                        <strong className="text-emerald-600 block mb-0.5" style={{ color: 'var(--success)' }}>Recommended Causal Intervention</strong>
                        <span style={{ color: 'var(--fg)' }}>{selectedRes.recommended_intervention}</span>
                      </div>
                    </div>
                  </div>

                  {/* Paths traced */}
                  {((selectedRes.direct_paths?.length || 0) > 0 || (selectedRes.indirect_paths?.length || 0) > 0) && (
                    <div className="card space-y-2.5" style={{ padding: '16px' }}>
                      <div className="whatif-section-header" style={{ marginBottom: 0 }}>Causal Pathways Traced</div>
                      <div className="space-y-2 text-xs">
                        {selectedRes.direct_paths?.length > 0 && (
                          <div>
                            <span className="font-semibold block text-[11px] text-muted">Direct Paths (Direct Discrimination risk):</span>
                            <div className="font-mono bg-gray-50 dark:bg-black/20 p-1.5 rounded mt-1 overflow-x-auto" style={{ background: 'var(--surface-2)' }}>
                              {selectedRes.direct_paths.map((p: string, idx: number) => (
                                <div key={idx}>{p}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedRes.indirect_paths?.length > 0 && (
                          <div>
                            <span className="font-semibold block text-[11px] text-muted">Indirect Paths (Indirect/Systemic Discrimination risk):</span>
                            <div className="font-mono bg-gray-50 dark:bg-black/20 p-1.5 rounded mt-1 overflow-x-auto" style={{ background: 'var(--surface-2)' }}>
                              {selectedRes.indirect_paths.map((p: string, idx: number) => (
                                <div key={idx}>{p}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="card py-8 text-center text-xs text-muted">Select an attribute to display detail analysis.</div>
          )}
        </div>
      </div>

      {/* Bottom Row: Graph Visualization */}
      <div className="w-full flex flex-col gap-3">
        <div className="whatif-section-header" style={{ marginBottom: 0 }}>Causal Graph (DAG)</div>
        <div className="card flex flex-col w-full" style={{ padding: '24px' }}>
          <CausalGraph
            dotString={data.causal_graph_dot}
            protectedCols={protectedCols}
            mediators={selectedRes?.mediators || []}
            labelCol={labelCol}
          />
          <div className="text-[11px] text-muted mt-3">
            * The Directed Acyclic Graph represents structural causal assumptions proposed by Gemini. Path effects are estimated using linear mediation models in DoWhy.
          </div>
        </div>
      </div>
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
