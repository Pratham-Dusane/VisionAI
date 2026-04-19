'use client';

import DriftTimeline from '@/components/charts/DriftTimeline';
import TopNav from '@/components/layout/TopNav';
import { getDriftHistory, uploadDriftBatch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getScoreColor } from '@/lib/mock-data';
import type { DriftBatch } from '@/lib/types';
import { AlertTriangle, ArrowRight, Calendar, Database, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';


function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function DriftPage() {
  const router = useRouter();
  const { org, orgLoading } = useAuth();

  const [batches, setBatches] = useState<DriftBatch[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [batchDate, setBatchDate] = useState('');
  const [notes, setNotes] = useState('');
  const [labelCol, setLabelCol] = useState('approved');
  const [positiveLabel, setPositiveLabel] = useState('1');
  const [protectedCols, setProtectedCols] = useState('gender,race');
  const [formStatus, setFormStatus] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    if (!batchDate) {
      const today = new Date().toISOString().slice(0, 10);
      setBatchDate(today);
    }
  }, [batchDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (orgLoading) {
        return;
      }
      if (!org?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const payload = await getDriftHistory(org.id);
        if (!cancelled) {
          setBatches(payload.batches || []);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(e, 'Failed to load drift history.'));
          setBatches([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [org?.id, orgLoading]);

  const latest = useMemo(() => batches[batches.length - 1], [batches]);
  const previous = useMemo(() => batches[batches.length - 2], [batches]);
  const scoreDelta = useMemo(() => {
    if (!latest || !previous) {
      return 0;
    }
    return Number((latest.fairnessScore - previous.fairnessScore).toFixed(1));
  }, [latest, previous]);

  const latestBreachMetric = useMemo(() => {
    if (!latest) {
      return null;
    }
    return (latest.metrics || []).find((metric) => (metric.diRatio ?? 1) < 0.8) || null;
  }, [latest]);

  async function refreshHistory() {
    if (!org?.id) return;
    const payload = await getDriftHistory(org.id);
    setBatches(payload.batches || []);
  }

  async function submitBatch() {
    setFormStatus(null);

    if (!org?.id) {
      const message = 'Please sign in and select an organization first.';
      setError(message);
      setFormStatus({ kind: 'error', message });
      return;
    }
    if (!file) {
      const message = 'Please select a dataset file before submitting.';
      setError(message);
      setFormStatus({ kind: 'error', message });
      return;
    }
    if (!batchDate) {
      const message = 'Please select the data collection date.';
      setError(message);
      setFormStatus({ kind: 'error', message });
      return;
    }

    const parsedProtectedCols = protectedCols
      .split(',')
      .map((col) => col.trim())
      .filter(Boolean);

    if (parsedProtectedCols.length === 0) {
      const message = 'Please provide at least one protected attribute column.';
      setError(message);
      setFormStatus({ kind: 'error', message });
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await uploadDriftBatch({
        orgId: org.id,
        file,
        batchDate,
        labelCol,
        positiveLabel,
        protectedCols: parsedProtectedCols,
        notes,
      });

      await refreshHistory();
      setShowUpload(false);
      setFile(null);
      setNotes('');
      setFormStatus({ kind: 'success', message: 'Batch uploaded successfully and timeline refreshed.' });
    } catch (e: unknown) {
      const message = getErrorMessage(e, 'Failed to upload drift batch.');
      setError(message);
      setFormStatus({ kind: 'error', message });
    } finally {
      setSubmitting(false);
    }
  }

  function openBatchAudit(batchId: string) {
    const target = batches.find((item) => item.id === batchId);
    if (target?.auditId) {
      router.push(`/audit/${target.auditId}`);
    }
  }

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Drift Monitor' }]} />

      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        {error && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', background: 'var(--danger-dim)' }}>
            <div className="text-sm" style={{ color: 'var(--danger)' }}>{error}</div>
          </div>
        )}

        {/* Alert Banner */}
        {latest && latestBreachMetric && (
          <div
            className="card flex items-center gap-3"
            style={{ background: 'var(--danger-dim)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
                Fairness Drift Alert
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {latestBreachMetric.protectedAttribute} DI ratio dropped to {(latestBreachMetric.diRatio ?? 0).toFixed(2)}. Score changed by {Math.abs(scoreDelta)} points since last batch.
              </div>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (latest.auditId) {
                  router.push(`/audit/${latest.auditId}`);
                }
              }}
            >
              View Audit <ArrowRight size={12} />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6">
          <div className="card">
            <div className="label-text mb-2" style={{ color: 'var(--muted)' }}>Current Score</div>
            <div className="text-xl font-bold" style={{ color: latest ? getScoreColor(latest.fairnessScore) : 'var(--muted)' }}>
              {latest ? latest.fairnessScore : '--'}
            </div>
          </div>
          <div className="card">
            <div className="label-text mb-2" style={{ color: 'var(--muted)' }}>Change</div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold" style={{ color: scoreDelta < 0 ? 'var(--danger)' : 'var(--success)' }}>
                {latest && previous ? scoreDelta : '--'}
              </span>
            </div>
          </div>
          <div className="card">
            <div className="label-text mb-2" style={{ color: 'var(--muted)' }}>Batches</div>
            <div className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{batches.length}</div>
          </div>
          <div className="card">
            <div className="label-text mb-2" style={{ color: 'var(--muted)' }}>Latest Batch</div>
            <div className="text-xl font-bold">{latest ? latest.batchDate.slice(0, 10) : '--'}</div>
          </div>
        </div>

        {/* Chart */}
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="card-title">Fairness Score & DI Ratio Over Time</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(!showUpload)}>
              <Upload size={13} /> Upload New Batch
            </button>
          </div>
          {loading ? (
            <div className="card flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={15} className="animate-spin" /> Loading drift timeline...
            </div>
          ) : (
            <DriftTimeline batches={batches} onPointClick={openBatchAudit} />
          )}
        </div>

        {/* Upload Drawer */}
        {showUpload && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}>
            <h3 className="card-title mb-4">Upload New Data Batch</h3>
            {formStatus && (
              <div
                className="mb-4 px-3 py-2 rounded-md text-xs"
                style={{
                  background: formStatus.kind === 'error' ? 'var(--danger-dim)' : 'color-mix(in srgb, var(--success) 15%, transparent)',
                  color: formStatus.kind === 'error' ? 'var(--danger)' : 'var(--success)',
                  border: `1px solid ${formStatus.kind === 'error' ? 'color-mix(in srgb, var(--danger) 35%, transparent)' : 'color-mix(in srgb, var(--success) 35%, transparent)'}`,
                }}
              >
                {formStatus.message}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>
                  <Database size={11} className="inline mr-1" /> Data File
                </label>
                <input
                  type="file"
                  accept=".csv,.json,.parquet"
                  className="input"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                  {file ? file.name : 'CSV, JSON, or Parquet'}
                </div>
              </div>
              <div>
                <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>
                  <Calendar size={11} className="inline mr-1" /> Collection Date
                </label>
                <input type="date" className="input" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
              </div>
              <div>
                <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Notes</label>
                <textarea
                  className="input"
                  style={{ minHeight: 80 }}
                  placeholder="Optional notes about this batch..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Label Column</label>
                <input className="input" value={labelCol} onChange={(e) => setLabelCol(e.target.value)} />
              </div>
              <div>
                <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Positive Label</label>
                <input className="input" value={positiveLabel} onChange={(e) => setPositiveLabel(e.target.value)} />
              </div>
              <div>
                <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Protected Columns</label>
                <input className="input" value={protectedCols} onChange={(e) => setProtectedCols(e.target.value)} placeholder="gender,race" />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button className="btn btn-primary" onClick={submitBatch} disabled={submitting}>
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Submit Batch
              </button>
            </div>
          </div>
        )}

        {/* Batch History */}
        <div className="card" style={{ padding: 0 }}>
          <div className="px-4 py-3 card-title" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            Batch History
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fairness Score</th>
                <th>Worst DI</th>
                <th>At-Risk Attributes</th>
                <th>Batch Size</th>
              </tr>
            </thead>
            <tbody>
              {[...batches].reverse().map((b) => {
                const atRisk = (b.metrics || [])
                  .filter((metric) => (metric.diRatio ?? 1) < 0.8)
                  .map((metric) => metric.protectedAttribute);

                return (
                <tr key={b.id}>
                  <td className="font-medium">{b.batchDate.slice(0, 10)}</td>
                  <td>
                    <span style={{ color: getScoreColor(b.fairnessScore) }}>{b.fairnessScore}</span>
                  </td>
                  <td style={{ color: b.worstDi < 0.8 ? 'var(--danger)' : 'var(--success)' }}>
                    {Number(b.worstDi ?? 0).toFixed(2)}
                  </td>
                  <td style={{ color: atRisk.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {atRisk.length > 0 ? atRisk.join(', ') : 'None'}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{Number(b.rowCount ?? 0).toLocaleString()}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
