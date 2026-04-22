'use client';

import TopNav from '@/components/layout/TopNav';
import {
  Activity,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  ActivitySquare
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { listAudits } from '@/lib/api';
import dynamic from 'next/dynamic';

const GuidedTour = dynamic(() => import('@/components/tour/GuidedTour'), { ssr: false });

const SOFT_GATE_ENTRY_KEY = 'vai-softgate-entry';

export default function DashboardPage() {
  const { org, orgLoading } = useAuth();
  const [page, setPage] = useState(0);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareAId, setCompareAId] = useState('');
  const [compareBId, setCompareBId] = useState('');
  const [tourForce, setTourForce] = useState(false);

  // Listen for help button tour trigger + auto-start if first time
  useEffect(() => {
    const handler = () => setTourForce(true);
    window.addEventListener('start-tour', handler);
    
    // Auto-start check
    const hasCompleted = localStorage.getItem('vai-tour-completed');
    if (!hasCompleted) {
      // Delay slightly to let page load
      setTimeout(() => setTourForce(true), 1500);
    }
    
    return () => window.removeEventListener('start-tour', handler);
  }, []);
  const [manifestoAnimate, setManifestoAnimate] = useState(false);
  const [softGateArrival, setSoftGateArrival] = useState(false);
  const perPage = 10;

  useEffect(() => {
    async function load() {
      if (!org) {
        setLoading(false);
        return;
      }
      try {
        const data = await listAudits(org.id);
        setAudits(data);
      } catch (err) {
        console.error('Failed to load audits:', err);
      } finally {
        setLoading(false);
      }
    }
    if (!orgLoading) load();
  }, [org, orgLoading]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setManifestoAnimate(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let resetTimer: number | null = null;

    try {
      const fromSoftGate = window.sessionStorage.getItem(SOFT_GATE_ENTRY_KEY) === '1';
      if (fromSoftGate) {
        window.sessionStorage.removeItem(SOFT_GATE_ENTRY_KEY);
        setSoftGateArrival(true);
        resetTimer = window.setTimeout(() => {
          setSoftGateArrival(false);
        }, 1200);
      }
    } catch {
      // Ignore storage access errors.
    }

    return () => {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
      }
    };
  }, []);

  const orderedAudits = [...audits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const completedAudits = orderedAudits.filter((a) => a.status === 'COMPLETE');
  const alertCount = orderedAudits.filter((a) => (a.proxies?.length || 0) > 0).length;
  const lastAudit = orderedAudits.length > 0 ? orderedAudits[0]?.createdAt : null;
  const avgScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((s: number, a: any) => s + (a.fairnessScore || 0), 0) / completedAudits.length)
    : 0;

  // Calculate Trends
  const sortedCompleted = [...completedAudits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  let fairnessTrend = { val: 0, label: 'Stable trend' };
  if (sortedCompleted.length >= 2) {
    const current = sortedCompleted[0].fairnessScore || 0;
    const prev = sortedCompleted[1].fairnessScore || 0;
    const diff = current - prev;
    fairnessTrend = {
      val: diff,
      label: diff > 0 ? `+${diff} vs last audit` : diff < 0 ? `${diff} vs last audit` : 'No change'
    };
  } else if (sortedCompleted.length === 1) {
    fairnessTrend = { val: 0, label: 'Initial baseline' };
  }

  let proxyTrend = { val: 0, label: 'Stable trend' };
  const sortedWithProxies = [...orderedAudits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (sortedWithProxies.length >= 2) {
    const current = sortedWithProxies[0].proxies?.length || 0;
    const prev = sortedWithProxies[1].proxies?.length || 0;
    const diff = current - prev;
    proxyTrend = {
      val: diff,
      label: diff > 0 ? `+${diff} since last audit` : diff < 0 ? `${Math.abs(diff)} fewer since last audit` : 'No change'
    };
  } else if (sortedWithProxies.length === 1) {
    proxyTrend = { val: 0, label: 'Initial baseline' };
  }

  const fairnessStatus = avgScore >= 80 ? 'pass' : avgScore >= 60 ? 'warning' : 'critical';
  const proxyStatus = alertCount === 0 ? 'pass' : alertCount < 3 ? 'warning' : 'critical';

  const deltaByAuditId = new Map<string, number | null>();
  orderedAudits.forEach((audit, idx) => {
    const previous = orderedAudits
      .slice(idx + 1)
      .find((candidate) => candidate.domain === audit.domain && candidate.fairnessScore != null);

    const currentScore = Number(audit.fairnessScore ?? NaN);
    const previousScore = Number(previous?.fairnessScore ?? NaN);

    if (!previous || !Number.isFinite(currentScore) || !Number.isFinite(previousScore) || previousScore === 0) {
      deltaByAuditId.set(audit.id, null);
      return;
    }

    deltaByAuditId.set(audit.id, ((currentScore - previousScore) / Math.abs(previousScore)) * 100);
  });

  const paged = orderedAudits.slice(page * perPage, (page + 1) * perPage);

  useEffect(() => {
    if (completedAudits.length >= 2 && !compareAId) {
      setCompareAId(completedAudits[0].id);
      const second = completedAudits.find((a) => a.id !== completedAudits[0].id);
      if (second) setCompareBId(second.id);
    }
  }, [completedAudits, compareAId]);

  const compareA = completedAudits.find((a) => a.id === compareAId) || null;
  const compareOptionsB = compareA
    ? completedAudits.filter((a) => a.id !== compareA.id && a.domain === compareA.domain)
    : completedAudits;
  const compareB = compareOptionsB.find((a) => a.id === compareBId) || compareOptionsB[0] || null;

  const worstDI = (audit: any) => {
    const dataBias = audit?.dataBias || {};
    let worst = 1;
    Object.values(dataBias).forEach((entry: any) => {
      const di = entry?.metrics?.disparate_impact;
      if (typeof di === 'number') worst = Math.min(worst, di);
    });
    return worst;
  };

  const scoreDelta = compareA && compareB ? (compareB.fairnessScore || 0) - (compareA.fairnessScore || 0) : 0;
  const diDelta = compareA && compareB ? worstDI(compareB) - worstDI(compareA) : 0;
  const compareSummary = compareA && compareB
    ? `Switching from ${compareA.name} to ${compareB.name} ${scoreDelta >= 0 ? 'improved' : 'reduced'} fairness by ${Math.abs(scoreDelta)} points and ${diDelta >= 0 ? 'improved' : 'worsened'} worst DI by ${Math.abs(diDelta).toFixed(2)}.`
    : '';

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />
      <GuidedTour forceStart={tourForce} onComplete={() => setTourForce(false)} />

      <div className="dashboard-page flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">

        <section
          className="relative overflow-hidden px-2 sm:px-3 pt-8 pb-9"
          style={{
            background: 'transparent',
          }}
        >
          {/* Ambient gradient blob */}
          <div className="dashboard-ambient-blob" aria-hidden="true" style={{
            position: 'absolute',
            top: '-20%',
            left: '-10%',
            width: '120%',
            height: '140%',
            pointerEvents: 'none',
            zIndex: 0
          }} />
          <h1
            className={`dashboard-manifesto-line font-visionai-hero text-2xl sm:text-4xl font-semibold leading-tight relative z-10 ${manifestoAnimate ? 'manifesto-typewriter' : 'manifesto-typewriter-prep'}`}
            style={{
              letterSpacing: '-0.03em',
            }}
          >
            Because an algorithm should <span className="manifesto-highlight">not inherit</span> our
            {' '}history&apos;s <span className="manifesto-highlight">mistakes</span>.
          </h1>
        </section>

        {/* Top Section: Health Indicators & Secondary Stats */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div data-tour="fairness-score" className="lg:row-span-2 h-full">
          <HealthIndicatorCard
            title="System Fairness"
            value={avgScore}
            suffix="/100"
            status={fairnessStatus}
            trend={fairnessTrend}
            icon={ActivitySquare}
            emphasizeCritical
            className={`${softGateArrival ? 'dashboard-softgate-card dashboard-softgate-card-a' : ''}`}
          />
          </div>

          <div data-tour="proxy-alerts" className="lg:row-span-2 h-full">
          <HealthIndicatorCard
            title="Active Proxy Alerts"
            value={alertCount}
            status={proxyStatus}
            trend={proxyTrend}
            icon={ShieldAlert}
            className={`${softGateArrival ? 'dashboard-softgate-card dashboard-softgate-card-b' : ''}`}
          />
          </div>

          <div
            className="dashboard-hover-card relative overflow-hidden border flex items-center justify-between p-5 h-full rounded-[24px] lg:col-start-3 lg:row-start-1"
            style={{
              background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
              borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.08)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <div>
              <div className="text-xs font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--muted)' }}>Total Audits</div>
              <div className="dashboard-number text-2xl font-black" style={{ color: 'var(--fg)' }}>
                {orderedAudits.length}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--surface-2)]">
              <BarChart3 size={24} style={{ color: 'var(--muted)' }} />
            </div>
          </div>

          <div
            data-tour={audits.length < 2 ? "model-compare" : undefined}
            className="dashboard-hover-card relative overflow-hidden border flex items-center justify-between p-5 h-full rounded-[24px] lg:col-start-3 lg:row-start-2"
            style={{
              background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
              borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.08)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <div>
              <div className="text-xs font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--muted)' }}>Last Audit</div>
              <div className="dashboard-number text-2xl font-black" style={{ color: 'var(--fg)' }}>
                {lastAudit ? new Date(lastAudit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--surface-2)]">
              <Calendar size={24} style={{ color: 'var(--muted)' }} />
            </div>
          </div>

          {!loading && audits.length >= 2 && (
            <div className="lg:col-start-1 lg:row-start-3 self-start w-full min-h-[120px] flex items-center px-1">
              <p className="model-compare-hero-text font-lora-italic w-full text-2xl sm:text-3xl lg:text-4xl font-black leading-tight">
                Benchmarking accuracy is easy. Compare your previous and next.
              </p>
            </div>
          )}

          {!loading && audits.length >= 2 && (
            <div
              data-tour="model-compare"
              className="border rounded-[24px] flex flex-col gap-4 p-5 lg:col-start-2 lg:col-span-2 lg:row-start-3 model-compare-panel"
              style={{
                background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
                borderColor: 'color-mix(in srgb, var(--primary) 22%, var(--border))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.08)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <div>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--fg)' }}>
                  Model Comparison Mode
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  Compare audits in the same domain.
                </div>
              </div>

              {completedAudits.length >= 2 ? (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="label-text block mb-1" style={{ color: 'var(--muted)' }}>Audit A</label>
                      <select className="select model-compare-select w-full" value={compareAId} onChange={(e) => setCompareAId(e.target.value)}>
                        {completedAudits.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.domain})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-text block mb-1" style={{ color: 'var(--muted)' }}>Audit B</label>
                      <select className="select model-compare-select w-full" value={compareB?.id || ''} onChange={(e) => setCompareBId(e.target.value)}>
                        {compareOptionsB.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.domain})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {compareA && compareB && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg model-compare-metric">
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>Fairness Score</div>
                        <div className="dashboard-number text-sm mt-1" style={{ color: 'var(--fg)' }}>{compareA.fairnessScore} {'->'} <strong>{compareB.fairnessScore}</strong></div>
                      </div>
                      <div className="p-3 rounded-lg model-compare-metric">
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>Worst DI Ratio</div>
                        <div className="dashboard-number text-sm mt-1" style={{ color: diDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {worstDI(compareA).toFixed(2)} {'->'} <strong>{worstDI(compareB).toFixed(2)}</strong>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg model-compare-metric">
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>Equalized Odds Attributes</div>
                        <div className="dashboard-number text-sm mt-1" style={{ color: 'var(--fg)' }}>
                          {Object.keys(compareA.modelBias?._equalized_odds || {}).length} {'->'} <strong>{Object.keys(compareB.modelBias?._equalized_odds || {}).length}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {compareSummary && (
                    <div className="text-xs leading-relaxed model-compare-summary">{compareSummary}</div>
                  )}
                </>
              ) : (
                <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                  You have {audits.length} audit(s), but at least 2 completed audits are required to run a domain-matched comparison.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="card space-y-3 rounded-3xl">
                <div className="skeleton" style={{ width: '38%', height: 12 }} />
                <div className="skeleton" style={{ width: '62%', height: 28 }} />
                <div className="skeleton" style={{ width: '84%', height: 12 }} />
              </div>
            ))}
          </div>
        )}

        {/* No audits */}
        {!loading && audits.length === 0 && (
          <div
            data-tour="audit-timeline"
            className="card flex flex-col items-center justify-center py-16 text-center rounded-3xl"
            style={{
              background: 'var(--primary-dim)',
              border: '1px dashed var(--primary)',
            }}
          >
            <Activity size={40} style={{ color: 'var(--primary)', marginBottom: 12 }} />
            <h3 className="text-lg font-semibold mb-1">Run your first fairness audit</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Upload a dataset to get started
            </p>
            <Link href="/audit/new" className="btn btn-primary btn-lg">
              <PlusCircle size={16} /> New Audit
            </Link>
          </div>
        )}

        {/* Audits Table */}
        {!loading && audits.length > 0 && (
          <div data-tour="audit-timeline" className="card rounded-3xl overflow-hidden" style={{ padding: 0 }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-[15px] font-semibold">Recent Audits</h2>
              <Link href="/audit/new" className="btn btn-primary btn-sm">
                <PlusCircle size={14} /> New Audit
              </Link>
            </div>

            <div className="px-4 sm:px-6 py-3">
              {paged.map((audit, idx) => {
                const statusMeta = getAuditTimelineStatus(audit);
                const delta = deltaByAuditId.get(audit.id);

                return (
                  <div key={audit.id} className="audit-timeline-row relative pl-10 pr-1 py-4 rounded-2xl transition-colors group hover:bg-[var(--surface-2)]">
                    {idx < paged.length - 1 && (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 12,
                          top: 33,
                          bottom: -8,
                          width: 1,
                          background: 'var(--border)',
                        }}
                      />
                    )}
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 7,
                        top: 18,
                        width: 11,
                        height: 11,
                        borderRadius: 999,
                        background: statusMeta.dot,
                        boxShadow: `0 0 0 3px ${statusMeta.dotRing}`,
                      }}
                    />

                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                      <div className="min-w-0">
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                          style={{
                            background: statusMeta.bg,
                            color: statusMeta.fg,
                            border: `1px solid ${statusMeta.border}`,
                          }}
                        >
                          {statusMeta.label}
                        </span>

                        <div className="mt-2 text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
                          {audit.name || 'Unnamed Audit'}
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                          Target: {audit.domain || 'Unknown domain'} • {new Date(audit.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      <div className="shrink-0 text-left sm:text-right w-full sm:w-auto">
                        <div className="text-[10px] uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--placeholder)' }}>
                          Fairness delta
                        </div>
                        <span
                          className="dashboard-number inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: delta == null
                              ? 'var(--surface-2)'
                              : delta >= 0
                                ? 'rgba(24, 128, 56, 0.14)'
                                : 'rgba(217, 48, 37, 0.14)',
                            color: delta == null
                              ? 'var(--muted)'
                              : delta >= 0
                                ? 'var(--success)'
                                : 'var(--danger)',
                          }}
                        >
                          {delta == null ? 'N/A' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                        </span>

                        <div className="mt-2 flex sm:justify-end">
                          <Link
                            href={`/audit/${audit.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold"
                            style={{ color: 'var(--primary)' }}
                          >
                            View audit <ChevronRight size={13} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {audits.length > perPage && (
              <div className="flex items-center justify-between gap-3 px-6 py-4 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
                  Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, audits.length)} of {audits.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="btn btn-outline btn-sm rounded-lg"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * perPage >= audits.length}
                    className="btn btn-outline btn-sm rounded-lg"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function getAuditTimelineStatus(audit: any) {
  if (audit.status === 'PROCESSING') {
    return {
      label: 'Processing',
      bg: 'rgba(59, 130, 246, 0.12)',
      fg: '#3B82F6',
      border: 'rgba(59, 130, 246, 0.36)',
      dot: '#60A5FA',
      dotRing: 'rgba(96, 165, 250, 0.22)',
    };
  }

  if (audit.status === 'FAILED' || Number(audit.fairnessScore ?? 100) < 60) {
    return {
      label: 'Critical Bias Found',
      bg: 'rgba(239, 68, 68, 0.10)',
      fg: '#EF4444',
      border: 'rgba(239, 68, 68, 0.35)',
      dot: '#F87171',
      dotRing: 'rgba(248, 113, 113, 0.22)',
    };
  }

  if ((audit.proxies?.length || 0) > 0) {
    return {
      label: 'Anomalies Detected',
      bg: 'rgba(245, 158, 11, 0.12)',
      fg: '#F59E0B',
      border: 'rgba(245, 158, 11, 0.35)',
      dot: '#FBBF24',
      dotRing: 'rgba(251, 191, 36, 0.22)',
    };
  }

  return {
    label: 'Compliance Met',
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: '#22C55E',
    border: 'rgba(34, 197, 94, 0.35)',
    dot: '#4ADE80',
    dotRing: 'rgba(74, 222, 128, 0.22)',
  };
}

function HealthIndicatorCard({ title, value, suffix, status, trend, icon: Icon, className = '', emphasizeCritical = false }: any) {
  const isCritical = status === 'critical';
  const isWarning = status === 'warning';
  const criticalFocus = emphasizeCritical && isCritical;

  const fg = criticalFocus
    ? 'var(--danger)'
    : isCritical
      ? 'var(--severity-critical)'
      : isWarning
        ? 'var(--severity-high)'
        : 'var(--severity-pass)';

  const background = criticalFocus
    ? 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 95%, transparent) 0%, color-mix(in srgb, var(--danger-dim) 45%, var(--surface)) 100%)'
    : 'color-mix(in srgb, var(--surface) 86%, transparent)';

  let TrendIcon = Minus;
  if (trend.val > 0) TrendIcon = TrendingUp;
  else if (trend.val < 0) TrendIcon = TrendingDown;

  return (
    <div
      className={`health-indicator-card relative overflow-hidden flex flex-col p-5 rounded-[24px] transition-transform hover:-translate-y-0.5 duration-300 h-full ${className}`}
      style={{
        background,
        border: `1px solid ${criticalFocus ? 'rgba(255, 120, 120, 0.18)' : 'color-mix(in srgb, var(--border) 62%, transparent)'}`,
        boxShadow: criticalFocus
          ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 14px rgba(0,0,0,0.12)'
          : 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-2" style={{ color: fg }}>
          <Icon size={20} strokeWidth={2.35} />
          <span className="text-[12px] font-bold tracking-[0.14em] uppercase opacity-90">{title}</span>
        </div>
      </div>

      <div className="relative">
        {/* Animated SVG Ring Background */}
        {suffix === '/100' && (
          <div className="absolute right-[-10px] top-[-30px] opacity-10 pointer-events-none" style={{ color: fg }}>
            <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
              <circle
                cx="60" cy="60" r="54"
                fill="none" stroke="currentColor" strokeWidth="12"
                strokeDasharray="339.292"
                strokeDashoffset="339.292"
                style={{
                  animation: 'score-ring-animate 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards 0.2s',
                  strokeDashoffset: `calc(339.292 - (339.292 * ${Math.min(100, Math.max(0, value))} / 100))`
                }}
              />
            </svg>
          </div>
        )}

        <div className="flex items-baseline gap-1 relative z-10">
        <span
          className="dashboard-number text-[42px] leading-none font-black tracking-tight"
          style={{
            color: fg,
            textShadow: criticalFocus ? '0 0 8px color-mix(in srgb, var(--danger) 30%, transparent)' : 'none',
          }}
        >
          {value}
        </span>
        {suffix && <span className="dashboard-number text-lg font-bold opacity-80" style={{ color: fg }}>{suffix}</span>}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs font-semibold relative z-10" style={{ color: fg, opacity: 0.92 }}>
        <div className="flex items-center justify-center p-1 rounded-full" style={{ background: criticalFocus ? 'rgba(255, 120, 120, 0.16)' : 'rgba(255,255,255,0.15)' }}>
          <TrendIcon size={14} strokeWidth={2.4} />
        </div>
        <span>{trend.label}</span>
      </div>
    </div>
  );
}

