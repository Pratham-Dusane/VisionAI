'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { listAudits, exportPDF } from '@/lib/api';
import TopNav from '@/components/layout/TopNav';
import { FileText, Download, Filter, RefreshCw, AlertCircle, CircleDot, CheckCircle2, X } from 'lucide-react';
import { getScoreColor } from '@/lib/mock-data';

function formatAuditDate(value: unknown) {
  if (!value) return 'Unknown date';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadgeClass(status: string) {
  if (status === 'COMPLETE') return 'badge-pass';
  if (status === 'PROCESSING') return 'badge-medium';
  if (status === 'FAILED') return 'badge-critical';
  return 'badge-neutral';
}

export default function ReportsPage() {
  const { org, orgLoading } = useAuth();
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDomain, setFilterDomain] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    if (orgLoading) return;
    if (!org?.id) {
      setLoading(false);
      setAudits([]);
      setError('No organization found for this account.');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function loadAudits() {
      try {
        const data = await listAudits(org!.id);
        if (cancelled) return;
        setAudits(Array.isArray(data) ? data : []);
        setError('');
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load reports');
          setAudits([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) timer = setTimeout(loadAudits, 20000);
      }
    }

    setLoading(true);
    loadAudits();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [org?.id, orgLoading]);

  // Derive available domains from audits
  const availableDomains = useMemo(() => {
    const domains = new Set<string>();
    audits.forEach((a) => { if (a.domain) domains.add(a.domain); });
    return Array.from(domains).sort();
  }, [audits]);

  // Apply filters
  const filteredAudits = useMemo(() => {
    return audits.filter((audit) => {
      if (filterDomain && audit.domain !== filterDomain) return false;
      if (filterStatus && audit.status !== filterStatus) return false;
      return true;
    });
  }, [audits, filterDomain, filterStatus]);

  const completedAudits = useMemo(
    () => filteredAudits.filter((audit) => audit.status === 'COMPLETE'),
    [filteredAudits],
  );
  const processingAudits = useMemo(
    () => filteredAudits.filter((audit) => audit.status === 'PROCESSING'),
    [filteredAudits],
  );
  const failedAudits = useMemo(
    () => filteredAudits.filter((audit) => audit.status === 'FAILED'),
    [filteredAudits],
  );

  const avgScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((sum, audit) => sum + (audit.fairnessScore || 0), 0) / completedAudits.length)
    : 0;

  const activeFilterCount = (filterDomain ? 1 : 0) + (filterStatus ? 1 : 0);

  function clearFilters() {
    setFilterDomain('');
    setFilterStatus('');
  }

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]} />
      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold">Audit Reports</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Live reports from {org?.name || 'your organization'}.
              {activeFilterCount > 0 && (
                <span style={{ color: 'var(--primary)' }}> ({filteredAudits.length} of {audits.length} shown)</span>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-outline btn-sm" onClick={() => window.location.reload()}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={activeFilterCount > 0 ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <Filter size={13} /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            {activeFilterCount > 0 && (
              <button className="btn btn-outline btn-sm" onClick={clearFilters} style={{ color: 'var(--muted)' }}>
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter panel */}
        {filterOpen && (
          <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--surface)' }}>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--muted)' }}>Domain</label>
                <select
                  className="input"
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  style={{ minWidth: 180 }}
                >
                  <option value="">All Domains</option>
                  {availableDomains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--muted)' }}>Status</label>
                <select
                  className="input"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ minWidth: 180 }}
                >
                  <option value="">All Statuses</option>
                  <option value="COMPLETE">Complete</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <button className="btn btn-outline btn-sm" onClick={clearFilters}>Reset</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card">
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Completed</div>
            <div className="text-2xl font-black mt-1">{completedAudits.length}</div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Processing</div>
            <div className="text-2xl font-black mt-1">{processingAudits.length}</div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Failed</div>
            <div className="text-2xl font-black mt-1">{failedAudits.length}</div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Average score</div>
            <div className="text-2xl font-black mt-1" style={{ color: getScoreColor(avgScore) }}>{avgScore || '-'}</div>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="card card-glow flex items-start gap-3">
                <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton" style={{ width: '42%', height: 14 }} />
                  <div className="skeleton" style={{ width: '72%', height: 12 }} />
                  <div className="skeleton" style={{ width: '52%', height: 12 }} />
                </div>
                <div className="skeleton w-14 h-8 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="card flex items-center gap-2" style={{ borderColor: 'var(--danger-dim)', background: 'var(--danger-dim)' }}>
            <AlertCircle size={14} style={{ color: 'var(--danger)' }} />
            <span className="text-sm" style={{ color: 'var(--fg)' }}>{error}</span>
          </div>
        )}

        {!loading && !error && filteredAudits.length === 0 && (
          <div className="card text-sm" style={{ color: 'var(--muted)' }}>
            {activeFilterCount > 0
              ? 'No audits match the current filters. Try adjusting or clearing filters.'
              : 'No completed audits yet. Finished audits will appear here automatically.'}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredAudits.map((audit) => {
            const score = audit.fairnessScore || audit.results?.fairnessScore || 0;
            return (
              <div key={audit.id} className="card card-glow flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--primary-dim)' }}>
                  <FileText size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <div className="text-sm font-semibold">{audit.name}</div>
                    <span className={`badge ${statusBadgeClass(audit.status)}`}>{audit.status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
                    <span>{audit.domain}</span>
                    <span>•</span>
                    <span>{formatAuditDate(audit.createdAt)}</span>
                    <span>•</span>
                    <span style={{ color: getScoreColor(score) }}>Score: {score}</span>
                  </div>
                </div>
                <button className="btn btn-outline btn-sm shrink-0" onClick={() => exportPDF(audit.id)}>
                  <Download size={12} /> PDF
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

