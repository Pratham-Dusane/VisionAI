'use client';

import TopNav from '@/components/layout/TopNav';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  ShieldAlert,
  ActivitySquare
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { listAudits } from '@/lib/api';

export default function DashboardPage() {
  const { org, orgLoading } = useAuth();
  const [page, setPage] = useState(0);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  const completedAudits = audits.filter((a) => a.status === 'COMPLETE');
  const alertCount = audits.filter((a) => (a.proxies?.length || 0) > 0).length;
  const lastAudit = audits.length > 0 ? audits[0]?.createdAt : null;
  const avgScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((s: number, a: any) => s + (a.fairnessScore || 0), 0) / completedAudits.length)
    : 0;
  const sc = (s: number) => s >= 80 ? 'var(--severity-pass)' : s >= 65 ? 'var(--severity-low)' : s >= 50 ? 'var(--severity-medium)' : s >= 35 ? 'var(--severity-high)' : 'var(--severity-critical)';

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
  const sortedWithProxies = [...audits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

  const paged = audits.slice(page * perPage, (page + 1) * perPage);

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        
        {/* Top Section: Health Indicators & Secondary Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Critical Health Indicators */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <HealthIndicatorCard 
              title="System Fairness" 
              value={avgScore} 
              suffix="/100" 
              status={fairnessStatus} 
              trend={fairnessTrend} 
              icon={ActivitySquare}
            />
            <HealthIndicatorCard 
              title="Active Proxy Alerts" 
              value={alertCount} 
              status={proxyStatus} 
              trend={proxyTrend} 
              icon={ShieldAlert}
            />
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-rows-2 gap-6">
            <div className="card border-none shadow-sm flex items-center justify-between p-6 h-full rounded-3xl" style={{ background: 'var(--surface)' }}>
              <div>
                <div className="text-[12px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--muted)' }}>Total Audits</div>
                <div className="text-3xl font-bold" style={{ color: 'var(--fg)' }}>{audits.length}</div>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--surface-2)]">
                <BarChart3 size={24} style={{ color: 'var(--muted)' }} />
              </div>
            </div>
            
            <div className="card border-none shadow-sm flex items-center justify-between p-6 h-full rounded-3xl" style={{ background: 'var(--surface)' }}>
              <div>
                <div className="text-[12px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--muted)' }}>Last Audit</div>
                <div className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
                  {lastAudit ? new Date(lastAudit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--surface-2)]">
                <Calendar size={24} style={{ color: 'var(--muted)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card flex items-center justify-center py-12 rounded-3xl">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <span className="ml-3 text-sm" style={{ color: 'var(--muted)' }}>Loading audits...</span>
          </div>
        )}

        {/* No audits */}
        {!loading && audits.length === 0 && (
          <div
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
          <div className="card rounded-3xl overflow-hidden" style={{ padding: 0 }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-[15px] font-semibold">Recent Audits</h2>
              <Link href="/audit/new" className="btn btn-primary btn-sm">
                <PlusCircle size={14} /> New Audit
              </Link>
            </div>

            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '24px' }}>Audit Name</th>
                    <th>Domain</th>
                    <th>Date</th>
                    <th>Score</th>
                    <th>Rows</th>
                    <th>Proxies</th>
                    <th>Status</th>
                    <th style={{ width: 80, paddingRight: '24px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((audit) => (
                    <tr key={audit.id}>
                      <td style={{ paddingLeft: '24px' }}>
                        <Link
                          href={`/audit/${audit.id}`}
                          className="font-medium hover:underline"
                          style={{ color: 'var(--fg)' }}
                        >
                          {audit.name}
                        </Link>
                      </td>
                      <td>
                        <span className="text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                          {audit.domain}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {new Date(audit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td>
                        {audit.fairnessScore != null ? (
                          <span style={{ color: sc(audit.fairnessScore), fontWeight: 600 }}>
                            {audit.fairnessScore}<span className="text-[11px] font-normal" style={{ color: 'var(--placeholder)', marginLeft: '2px' }}>/ {audit.letterGrade}</span>
                          </span>
                        ) : '-'}
                      </td>
                      <td>{audit.rowCount?.toLocaleString() || '-'}</td>
                      <td>
                        {(audit.proxies?.length || 0) > 0 ? (
                          <span className="badge badge-high">{audit.proxies.length}</span>
                        ) : (
                          <span className="badge badge-pass">0</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={audit.status} />
                      </td>
                      <td style={{ paddingRight: '24px' }}>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/audit/${audit.id}`}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-3)]"
                            style={{ background: 'var(--surface-2)' }}
                            title="View"
                          >
                            <Eye size={15} style={{ color: 'var(--muted)' }} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {audits.length > perPage && (
              <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    COMPLETE: { cls: 'badge-pass', label: 'Complete' },
    PROCESSING: { cls: 'badge-processing', label: 'Processing' },
    FAILED: { cls: 'badge-critical', label: 'Failed' },
  };
  const info = map[status] || { cls: '', label: status };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

function HealthIndicatorCard({ title, value, suffix, status, trend, icon: Icon }: any) {
  let bg = 'var(--surface-2)';
  let fg = 'var(--fg)';
  
  if (status === 'pass') {
    bg = 'var(--success-dim)';
    fg = 'var(--severity-pass)';
  } else if (status === 'warning') {
    bg = 'var(--warning-dim)';
    fg = 'var(--severity-high)';
  } else if (status === 'critical') {
    bg = 'var(--danger-dim)';
    fg = 'var(--severity-critical)';
  }

  let TrendIcon = Minus;
  if (trend.val > 0) TrendIcon = TrendingUp;
  else if (trend.val < 0) TrendIcon = TrendingDown;

  return (
    <div className="flex flex-col p-6 rounded-[28px] relative transition-transform hover:-translate-y-0.5 duration-300" style={{ background: bg }}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-2" style={{ color: fg }}>
          <Icon size={22} strokeWidth={2.5} />
          <span className="text-[13px] font-bold tracking-widest uppercase opacity-90">{title}</span>
        </div>
      </div>
      
      <div className="flex items-baseline gap-1">
        <span className="text-[48px] leading-none font-extrabold tracking-tight" style={{ color: fg }}>{value}</span>
        {suffix && <span className="text-xl font-bold opacity-80" style={{ color: fg }}>{suffix}</span>}
      </div>

      <div className="mt-8 flex items-center gap-2 text-sm font-semibold" style={{ color: fg, opacity: 0.9 }}>
        <div className="flex items-center justify-center p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <TrendIcon size={16} strokeWidth={2.5} />
        </div>
        <span>{trend.label}</span>
      </div>
    </div>
  );
}

