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
  MoreHorizontal,
  PlusCircle,
  RefreshCw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MOCK_AUDITS } from '@/lib/mock-data';
import { getScoreColor } from '@/lib/mock-data';

export default function DashboardPage() {
  const [page, setPage] = useState(0);
  const perPage = 10;
  const audits = MOCK_AUDITS;
  const completedAudits = audits.filter((a) => a.status === 'COMPLETE');
  const avgScore =
    completedAudits.length > 0
      ? Math.round(completedAudits.reduce((s, a) => s + (a.fairnessScore || 0), 0) / completedAudits.length)
      : 0;
  const alertCount = completedAudits.filter((a) => (a.fairnessScore || 100) < 50).length;
  const lastAudit = audits.length > 0 ? audits[audits.length - 1].createdAt : null;

  const stats = [
    {
      label: 'Total Audits',
      value: audits.length,
      icon: BarChart3,
      color: '#3EC1D3',
      bg: 'rgba(62, 193, 211, 0.08)',
    },
    {
      label: 'Avg Fairness Score',
      value: avgScore,
      icon: TrendingUp,
      color: getScoreColor(avgScore),
      bg: `${getScoreColor(avgScore)}15`,
      suffix: '/100',
    },
    {
      label: 'Active Alerts',
      value: alertCount,
      icon: AlertTriangle,
      color: alertCount > 0 ? '#FF9A00' : '#06D6A0',
      bg: alertCount > 0 ? 'rgba(255, 154, 0, 0.08)' : 'rgba(6, 214, 160, 0.08)',
    },
    {
      label: 'Last Audit',
      value: lastAudit ? lastAudit.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
      icon: Calendar,
      color: '#F6F7D7',
      bg: 'rgba(246, 247, 215, 0.06)',
    },
  ];

  const paged = audits.slice(page * perPage, (page + 1) * perPage);

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="flex-1 p-4 space-y-4 animate-fade-in">
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
                  <div className="text-[11px] font-medium" style={{ color: '#8892A5' }}>
                    {s.label}
                  </div>
                  <div className="text-xl font-bold" style={{ color: s.color }}>
                    {s.value}
                    {s.suffix && (
                      <span className="text-xs font-normal" style={{ color: '#5A6478' }}>
                        {s.suffix}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Start (show if no audits) */}
        {audits.length === 0 && (
          <div
            className="card flex flex-col items-center justify-center py-16 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(62, 193, 211, 0.05), rgba(255, 154, 0, 0.05))',
              border: '1px dashed #3EC1D3',
            }}
          >
            <Activity size={40} style={{ color: '#3EC1D3', marginBottom: 12 }} />
            <h3 className="text-lg font-semibold mb-1">Run your first fairness audit</h3>
            <p className="text-sm mb-4" style={{ color: '#8892A5' }}>
              Upload a dataset or model to get started
            </p>
            <Link href="/audit/new" className="btn btn-primary btn-lg">
              <PlusCircle size={16} /> New Audit
            </Link>
          </div>
        )}

        {/* Recent Audits */}
        <div className="card" style={{ padding: 0 }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #2A3040' }}>
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
                  <th>Fairness Score</th>
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
                        className="font-medium text-foreground hover:underline"
                        style={{ color: '#E8EAED' }}
                      >
                        {audit.name}
                      </Link>
                    </td>
                    <td>
                      <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: '#1A1F2B', color: '#8892A5' }}>
                        {audit.domain}
                      </span>
                    </td>
                    <td style={{ color: '#8892A5' }}>
                      {audit.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td>
                      {audit.fairnessScore !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: getScoreColor(audit.fairnessScore) }}>
                            {audit.fairnessScore}
                          </span>
                          <div className="w-16 h-1.5 rounded-full" style={{ background: '#1A1F2B' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${audit.fairnessScore}%`,
                                background: getScoreColor(audit.fairnessScore),
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#5A6478' }}>—</span>
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
                          style={{ background: '#1A1F2B' }}
                          title="View"
                        >
                          <Eye size={13} style={{ color: '#8892A5' }} />
                        </Link>
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                          style={{ background: '#1A1F2B' }}
                          title="Re-audit"
                        >
                          <RefreshCw size={13} style={{ color: '#8892A5' }} />
                        </button>
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                          style={{ background: '#1A1F2B' }}
                          title="Delete"
                        >
                          <Trash2 size={13} style={{ color: '#5A6478' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {audits.length > perPage && (
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #2A3040' }}>
              <span className="text-xs" style={{ color: '#8892A5' }}>
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

        {/* Bottom row — mini cards */}
        <div className="grid grid-cols-3 gap-3">
          {/* Worst Finding */}
          <div className="card" style={{ borderColor: 'rgba(255, 22, 93, 0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} style={{ color: '#FF165D' }} />
              <span className="text-xs font-semibold" style={{ color: '#FF165D' }}>
                Worst Finding
              </span>
            </div>
            <div className="text-sm font-medium mb-1">Race Bias — Hiring Pipeline</div>
            <div className="text-xs" style={{ color: '#8892A5' }}>
              DI Ratio: <span style={{ color: '#FF165D' }}>0.58</span> — severely below 0.80 threshold
            </div>
          </div>

          {/* Drift Alert */}
          <div className="card" style={{ borderColor: 'rgba(255, 154, 0, 0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} style={{ color: '#FF9A00' }} />
              <span className="text-xs font-semibold" style={{ color: '#FF9A00' }}>
                Drift Alert
              </span>
            </div>
            <div className="text-sm font-medium mb-1">Fairness score dropped 33pts</div>
            <div className="text-xs" style={{ color: '#8892A5' }}>
              From 75 → 42 over last 5 months
            </div>
          </div>

          {/* Quick Action */}
          <div className="card" style={{ borderColor: 'rgba(62, 193, 211, 0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Activity size={14} style={{ color: '#3EC1D3' }} />
              <span className="text-xs font-semibold" style={{ color: '#3EC1D3' }}>
                Recommended
              </span>
            </div>
            <div className="text-sm font-medium mb-2">Re-audit after SMOTE rebalancing</div>
            <Link href="/audit/new" className="btn btn-primary btn-sm">
              Start Now
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    COMPLETE: { cls: 'badge-pass', label: 'Complete' },
    PROCESSING: { cls: 'badge-processing', label: 'Processing' },
    FAILED: { cls: 'badge-critical', label: 'Failed' },
    PENDING: { cls: 'badge-medium', label: 'Pending' },
  };
  const info = map[status] || { cls: '', label: status };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}
