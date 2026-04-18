'use client';

import TopNav from '@/components/layout/TopNav';
import { FileText, Download, Calendar, Filter } from 'lucide-react';
import { MOCK_AUDITS, getScoreColor } from '@/lib/mock-data';

export default function ReportsPage() {
  const completedAudits = MOCK_AUDITS.filter((a) => a.status === 'COMPLETE');

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]} />
      <div className="flex-1 p-5 space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Audit Reports</h1>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm"><Filter size={13} /> Filter</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {completedAudits.map((audit) => (
            <div key={audit.id} className="card card-glow flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--primary-dim)' }}>
                <FileText size={18} style={{ color: 'var(--primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold mb-0.5">{audit.name}</div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                  <span>{audit.domain}</span>
                  <span>•</span>
                  <span>{audit.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>•</span>
                  <span style={{ color: getScoreColor(audit.fairnessScore || 0) }}>Score: {audit.fairnessScore}</span>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm shrink-0"><Download size={12} /> PDF</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
