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
  Loader2,
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

  const stats = [
    {
      label: 'Total Audits',
      value: audits.length,
      icon: BarChart3,
      color: 'var(--primary)',
      bg: 'var(--primary-dim)',
    },
    {
      label: 'Avg Fairness',
      value: avgScore,
      icon: TrendingUp,
      color: sc(avgScore),
      bg: 'var(--primary-dim)',
      suffix: '/100',
    },
    {
      label: 'Proxy Alerts',
      value: alertCount,
      icon: AlertTriangle,
      color: alertCount > 0 ? 'var(--severity-high)' : 'var(--severity-pass)',
      bg: alertCount > 0 ? 'var(--accent-dim)' : 'var(--success-dim)',
    },
    {
      label: 'Last Audit',
      value: lastAudit ? new Date(lastAudit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-',
      icon: Calendar,
      color: 'var(--muted)',
      bg: 'var(--surface-2)',
    },
  ];

  const paged = audits.slice(page * perPage, (page + 1) * perPage);

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="flex-1 p-5 space-y-4 animate-fade-in">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card card-glow flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: s.bg }}
                >
                  <Icon size={18} style={{ color: s.color }} />
                </div>
                <div>
                  <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                    {s.label}
                  </div>
                  <div className="text-xl font-bold" style={{ color: s.color }}>
                    {s.value}
                    {'suffix' in s && s.suffix && (
                      <span className="text-xs font-normal" style={{ color: 'var(--placeholder)' }}>{s.suffix}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="card flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <span className="ml-3 text-sm" style={{ color: 'var(--muted)' }}>Loading audits...</span>
          </div>
        )}

        {/* No audits */}
        {!loading && audits.length === 0 && (
          <div
            className="card flex flex-col items-center justify-center py-16 text-center"
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
          <div className="card" style={{ padding: 0 }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold">Recent Audits</h2>
              <Link href="/audit/new" className="btn btn-primary btn-sm">
                <PlusCircle size={13} /> New Audit
              </Link>
            </div>

            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Audit Name</th>
                    <th>Domain</th>
                    <th>Date</th>
                    <th>Score</th>
                    <th>Rows</th>
                    <th>Proxies</th>
                    <th>Status</th>
                    <th style={{ width: 80 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((audit) => (
                    <tr key={audit.id}>
                      <td>
                        <Link
                          href={`/audit/${audit.id}`}
                          className="font-medium hover:underline"
                          style={{ color: 'var(--fg)' }}
                        >
                          {audit.name}
                        </Link>
                      </td>
                      <td>
                        <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                          {audit.domain}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {new Date(audit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td>
                        {audit.fairnessScore != null ? (
                          <span style={{ color: sc(audit.fairnessScore), fontWeight: 600 }}>
                            {audit.fairnessScore}<span className="text-[10px] font-normal" style={{ color: 'var(--placeholder)' }}>/{audit.letterGrade}</span>
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
                      <td>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/audit/${audit.id}`}
                            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                            style={{ background: 'var(--surface-2)' }}
                            title="View"
                          >
                            <Eye size={13} style={{ color: 'var(--muted)' }} />
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
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, audits.length)} of {audits.length}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="btn btn-secondary btn-sm"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * perPage >= audits.length}
                    className="btn btn-secondary btn-sm"
                  >
                    <ChevronRight size={13} />
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
