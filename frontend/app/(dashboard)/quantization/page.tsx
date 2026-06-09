'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TopNav from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { uploadDatasetFile, uploadModelFile } from '@/lib/storage';
import {
  runQuantizationProfile,
  listQuantizationProfiles,
  getQuantizationProfile,
  deleteQuantizationProfile,
  listAudits,
} from '@/lib/api';
import type {
  QuantizationProfile,
  QuantizationProfileDetail,
  QDIResults,
  QDIGroupResult,
  QDIFlaggedGroup,
} from '@/lib/api';
import {
  Cpu,
  Upload,
  FileText,
  Trash2,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  Plus,
  Eye,
  Clock,
  Layers,
  Zap,
  Shield,
  Info,
  BarChart3,
  Database,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

type PageView = 'list' | 'new' | 'results';
type UploadMode = 'upload' | 'audit';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const full = payload.find((p: any) => p.name === 'fullAcc')?.value;
    const quant = payload.find((p: any) => p.name === 'quantAcc')?.value;
    const isFlagged = payload.find((p: any) => p.name === 'quantAcc')?.payload?.flagged;
    return (
      <div className="card" style={{ padding: '12px 16px', borderRadius: 12, fontSize: 13, border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--fg)' }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--muted)' }}>Full Precision:</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{full}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--muted)' }}>Quantized:</span>
            <span style={{ fontWeight: 600, color: isFlagged ? 'var(--danger)' : 'var(--fg)' }}>{quant}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--border-light)', paddingTop: 4, marginTop: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Accuracy Drop:</span>
            <span style={{ fontWeight: 700, color: isFlagged ? 'var(--danger)' : 'var(--success)' }}>
              {Math.max(0, (full - quant)).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function QuantizationProfilerPage() {
  const { org, orgLoading } = useAuth();

  // Navigation
  const [view, setView] = useState<PageView>('list');

  // Profile list
  const [profiles, setProfiles] = useState<QuantizationProfile[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Selected profile (results view)
  const [selectedProfile, setSelectedProfile] = useState<QuantizationProfileDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // New profile form
  const [mode, setMode] = useState<UploadMode>('upload');
  const [profileName, setProfileName] = useState('');

  // File states
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [fullModelFile, setFullModelFile] = useState<File | null>(null);
  const [quantModelFile, setQuantModelFile] = useState<File | null>(null);

  // Upload progress
  const [datasetProgress, setDatasetProgress] = useState(0);
  const [fullModelProgress, setFullModelProgress] = useState(0);
  const [quantModelProgress, setQuantModelProgress] = useState(0);

  // Column config
  const [protectedCols, setProtectedCols] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [positiveLabel, setPositiveLabel] = useState('');

  // From audit mode
  const [audits, setAudits] = useState<any[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [quantModelFileAudit, setQuantModelFileAudit] = useState<File | null>(null);
  const [quantModelProgressAudit, setQuantModelProgressAudit] = useState(0);

  // Running state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pollingId, setPollingId] = useState<string | null>(null);

  // Drag states
  const [dragOverDataset, setDragOverDataset] = useState(false);
  const [dragOverFull, setDragOverFull] = useState(false);
  const [dragOverQuant, setDragOverQuant] = useState(false);
  const [dragOverQuantAudit, setDragOverQuantAudit] = useState(false);

  const datasetRef = useRef<HTMLInputElement>(null);
  const fullRef = useRef<HTMLInputElement>(null);
  const quantRef = useRef<HTMLInputElement>(null);
  const quantAuditRef = useRef<HTMLInputElement>(null);

  // ─── Load profiles ───
  const loadProfiles = useCallback(async () => {
    if (!org?.id) return;
    setListLoading(true);
    try {
      const data = await listQuantizationProfiles(org.id);
      setProfiles(data);
    } catch (e) {
      console.error('Failed to load quantization profiles:', e);
    } finally {
      setListLoading(false);
    }
  }, [org?.id]);

  useEffect(() => {
    if (!orgLoading && org?.id) loadProfiles();
  }, [orgLoading, org?.id, loadProfiles]);

  // ─── Load audits for "from audit" mode ───
  useEffect(() => {
    if (mode !== 'audit' || !org?.id) return;
    (async () => {
      try {
        const data = await listAudits(org.id);
        // Only show audits with both dataset and model
        const modelAudits = data.filter((a: any) => a.modelStoragePath && a.status === 'COMPLETE');
        setAudits(modelAudits);
      } catch (e) {
        console.error('Failed to load audits:', e);
      }
    })();
  }, [mode, org?.id]);

  // ─── Select audit ───
  useEffect(() => {
    if (!selectedAuditId) {
      setSelectedAudit(null);
      return;
    }
    const audit = audits.find((a: any) => a.id === selectedAuditId);
    setSelectedAudit(audit || null);
  }, [selectedAuditId, audits]);

  // ─── Poll for profile completion ───
  useEffect(() => {
    if (!pollingId) return;
    const interval = setInterval(async () => {
      try {
        const profile = await getQuantizationProfile(pollingId);
        if (profile.status === 'COMPLETE' || profile.status === 'FAILED') {
          clearInterval(interval);
          setPollingId(null);
          setSubmitting(false);
          setSelectedProfile(profile);
          setView('results');
          loadProfiles();
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pollingId, loadProfiles]);

  // ─── View a profile ───
  const handleViewProfile = async (profileId: string) => {
    setProfileLoading(true);
    setError('');
    try {
      const profile = await getQuantizationProfile(profileId);
      setSelectedProfile(profile);
      setView('results');
    } catch (e: any) {
      setError(e.message || 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  };

  // ─── Delete a profile ───
  const handleDeleteProfile = async (profileId: string) => {
    try {
      await deleteQuantizationProfile(profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    } catch (e: any) {
      setError(e.message || 'Failed to delete profile');
    }
  };

  // ─── Submit new profile (upload mode) ───
  const handleSubmitUpload = async () => {
    if (!org?.id) return setError('Organization not found');
    if (!datasetFile) return setError('Please upload a dataset');
    if (!fullModelFile) return setError('Please upload a full-precision model');
    if (!protectedCols.trim()) return setError('Please specify protected columns');
    if (!labelCol.trim()) return setError('Please specify the label column');
    if (!positiveLabel.trim()) return setError('Please specify the positive label');

    setSubmitting(true);
    setError('');
    try {
      // Upload dataset
      const dsPath = await uploadDatasetFile(datasetFile, org.id, (p) => setDatasetProgress(p.progress));
      // Upload full model
      const fmPath = await uploadModelFile(fullModelFile, org.id, (p) => setFullModelProgress(p.progress));
      // Upload quantized model (optional)
      let qmPath: string | undefined;
      if (quantModelFile) {
        qmPath = await uploadModelFile(quantModelFile, org.id, (p) => setQuantModelProgress(p.progress));
      }

      const result = await runQuantizationProfile({
        orgId: org.id,
        name: profileName.trim() || `Profile — ${new Date().toLocaleDateString()}`,
        datasetStoragePath: dsPath,
        fullModelStoragePath: fmPath,
        quantizedModelStoragePath: qmPath,
        protectedCols: protectedCols.split(',').map((c) => c.trim()).filter(Boolean),
        labelCol: labelCol.trim(),
        positiveLabel: positiveLabel.trim(),
      });

      setPollingId(result.profileId);
    } catch (e: any) {
      setSubmitting(false);
      setError(e.message || 'Failed to create profile');
    }
  };

  // ─── Submit new profile (from audit mode) ───
  const handleSubmitAudit = async () => {
    if (!org?.id) return setError('Organization not found');
    if (!selectedAudit) return setError('Please select an audit');

    setSubmitting(true);
    setError('');
    try {
      let qmPath: string | undefined;
      if (quantModelFileAudit) {
        qmPath = await uploadModelFile(quantModelFileAudit, org.id, (p) => setQuantModelProgressAudit(p.progress));
      }

      const result = await runQuantizationProfile({
        orgId: org.id,
        name: profileName.trim() || `QDI — ${selectedAudit.name}`,
        datasetStoragePath: selectedAudit.storagePath,
        fullModelStoragePath: selectedAudit.modelStoragePath,
        quantizedModelStoragePath: qmPath,
        protectedCols: selectedAudit.protectedCols || [],
        labelCol: selectedAudit.labelCol,
        positiveLabel: String(selectedAudit.positiveLabel),
        sourceAuditId: selectedAudit.id,
      });

      setPollingId(result.profileId);
    } catch (e: any) {
      setSubmitting(false);
      setError(e.message || 'Failed to create profile');
    }
  };

  // ─── Reset form ───
  const resetForm = () => {
    setDatasetFile(null);
    setFullModelFile(null);
    setQuantModelFile(null);
    setQuantModelFileAudit(null);
    setProfileName('');
    setProtectedCols('');
    setLabelCol('');
    setPositiveLabel('');
    setSelectedAuditId('');
    setSelectedAudit(null);
    setDatasetProgress(0);
    setFullModelProgress(0);
    setQuantModelProgress(0);
    setQuantModelProgressAudit(0);
    setError('');
  };

  // ─── Drag handlers ───
  const handleDrop = (setter: (f: File) => void, setDrag: (d: boolean) => void) =>
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) setter(file);
    };

  const handleDragOver = (setDrag: (d: boolean) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(true);
  };

  const handleDragLeave = (setDrag: (d: boolean) => void) => () => setDrag(false);

  // ─── Chart data builder ───
  const buildChartData = (results: QDIResults) => {
    const chartData: { name: string; fullAcc: number; quantAcc: number; qdi: number; flagged: boolean; col: string }[] = [];
    for (const [col, groups] of Object.entries(results.per_group)) {
      for (const [group, data] of Object.entries(groups)) {
        chartData.push({
          name: `${group}`,
          fullAcc: Math.round(data.full_precision_accuracy * 1000) / 10,
          quantAcc: Math.round(data.quantized_accuracy * 1000) / 10,
          qdi: data.qdi,
          flagged: data.flagged,
          col,
        });
      }
    }
    return chartData;
  };

  const r = selectedProfile?.results;
  const chartData = r ? buildChartData(r) : [];

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Pipelines', href: '/pipelines' }, { label: 'Compression Pipeline' }]} />
      
      {/* ── Header Card (Full width next to left navbar) ── */}
      <div style={{ padding: '24px 32px 0', width: '100%', maxWidth: '100%', margin: '0' }}>
        <div className="quantization-header-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Cpu size={16} style={{ color: 'var(--primary)' }} />
            <span className="badge badge-low" style={{ fontSize: 10, letterSpacing: 1 }}>COMPRESSION PIPELINE</span>
          </div>
          <h1 className="page-title" style={{ marginBottom: 12, fontSize: '28px', fontWeight: 800, letterSpacing: '-0.025em' }}>
            Compare full model vs lite model
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 800, marginBottom: 20 }}>
            Upload a dataset, a primary model, and a compressed lite model. The pipeline compares
            group-level accuracy shifts and shows where compression changes the fairness profile.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            <span className="badge badge-pass" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8 }}>DIRECT UPLOAD</span>
            <span className="badge badge-neutral" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8 }}>NO AUDIT DEPENDENCY</span>
            <span className="badge badge-low" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8 }}>FULL + LITE MODEL</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px',
            borderRadius: 12, background: 'var(--warning-dim)', border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)',
            fontSize: 12, color: 'var(--warning)', lineHeight: 1.5,
          }}>
            <Sparkles size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--warning)' }} />
            <span>
              Lite model is optional. If you skip it, the backend will auto-generate a fallback
              lite artifact from the full model for comparison.
            </span>
          </div>
        </div>
      </div>

      {/* ── Bounded Main Content (Centered & bounded width for premium look) ── */}
      <div style={{ padding: '24px 32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

        {/* ── Error Banner ── */}
        {error && (
          <div className="animate-fade-in" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            borderRadius: 12, background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 13,
            marginBottom: 16,
          }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ── VIEW: LIST ── */}
        {view === 'list' && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Previous Profiles</h2>
              <button
                className="btn btn-primary"
                onClick={() => { resetForm(); setView('new'); }}
                id="new-quantization-profile-btn"
              >
                <Plus size={16} /> New Quantization Profile
              </button>
            </div>

            {listLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <Layers size={40} style={{ color: 'var(--placeholder)', marginBottom: 12 }} />
                <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
                  No quantization profiles yet. Create your first to compare model compression fairness.
                </p>
                <button className="btn btn-primary" onClick={() => { resetForm(); setView('new'); }}>
                  <Plus size={16} /> Create First Profile
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="card"
                    style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
                    onClick={() => p.status === 'COMPLETE' && handleViewProfile(p.id)}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: p.status === 'COMPLETE' ? 'var(--primary-dim)' : p.status === 'FAILED' ? 'var(--danger-dim)' : 'var(--warning-dim)',
                      flexShrink: 0,
                    }}>
                      {p.status === 'COMPLETE' ? <BarChart3 size={18} style={{ color: 'var(--primary)' }} /> :
                       p.status === 'FAILED' ? <XCircle size={18} style={{ color: 'var(--danger)' }} /> :
                       <Loader2 size={18} className="animate-spin" style={{ color: 'var(--warning)' }} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)', marginBottom: 2 }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} /> {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                        </span>
                        {p.total_samples && <span>{p.total_samples} samples</span>}
                        {p.simulated_quantization && <span className="badge badge-neutral" style={{ fontSize: 9, padding: '1px 5px' }}>SIMULATED</span>}
                      </div>
                    </div>

                    {p.status === 'COMPLETE' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: (p.overall_qdi || 0) > 0.05 ? 'var(--danger)' : 'var(--success)' }}>
                            {((p.overall_accuracy_drop_pct || 0)).toFixed(1)}%
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Acc Drop</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: (p.flagged_count || 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {p.flagged_count || 0}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Flagged</div>
                        </div>
                      </div>
                    )}

                    {p.status === 'PROCESSING' && (
                      <span className="badge badge-processing" style={{ fontSize: 11 }}>PROCESSING</span>
                    )}
                    {p.status === 'FAILED' && (
                      <span className="badge badge-critical" style={{ fontSize: 11 }}>FAILED</span>
                    )}

                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flexShrink: 0 }}
                      onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id); }}
                      title="Delete profile"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── VIEW: NEW PROFILE ── */}
        {view === 'new' && (
          <div className="animate-fade-in">
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 16 }}
              onClick={() => setView('list')}
            >
              <ArrowLeft size={14} /> Back to profiles
            </button>

            {/* Mode Toggle */}
            <div className="tab-bar" style={{ marginBottom: 24, maxWidth: 380 }}>
              <button
                className={`tab-item ${mode === 'upload' ? 'active' : ''}`}
                onClick={() => setMode('upload')}
              >
                <Upload size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Upload New
              </button>
              <button
                className={`tab-item ${mode === 'audit' ? 'active' : ''}`}
                onClick={() => setMode('audit')}
              >
                <Database size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> From Existing Audit
              </button>
            </div>

            {/* Profile Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Profile Name
              </label>
              <input
                className="input"
                placeholder="e.g. Hiring Model Q4 Compression Test"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                style={{ maxWidth: 480 }}
                id="quantization-profile-name"
              />
            </div>

            {/* ── UPLOAD MODE ── */}
            {mode === 'upload' && (
              <>
                {/* Upload Zones */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
                  {/* Dataset */}
                  <div
                    className={`upload-zone ${dragOverDataset ? 'drag-over' : ''}`}
                    onClick={() => datasetRef.current?.click()}
                    onDrop={handleDrop(setDatasetFile, setDragOverDataset)}
                    onDragOver={handleDragOver(setDragOverDataset)}
                    onDragLeave={handleDragLeave(setDragOverDataset)}
                  >
                    <input ref={datasetRef} type="file" accept=".csv,.json,.parquet" hidden onChange={(e) => e.target.files?.[0] && setDatasetFile(e.target.files[0])} />
                    <FileText size={28} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Dataset CSV</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {datasetFile ? datasetFile.name : '.csv, .json, .parquet'}
                    </div>
                    {datasetFile && <span className="badge badge-pass" style={{ marginTop: 8, fontSize: 10 }}>✓ READY</span>}
                    {datasetProgress > 0 && datasetProgress < 100 && (
                      <div style={{ marginTop: 8, height: 3, width: '80%', background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${datasetProgress}%`, background: 'var(--primary)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    )}
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>REQUIRED</div>
                  </div>

                  {/* Full Model */}
                  <div
                    className={`upload-zone ${dragOverFull ? 'drag-over' : ''}`}
                    onClick={() => fullRef.current?.click()}
                    onDrop={handleDrop(setFullModelFile, setDragOverFull)}
                    onDragOver={handleDragOver(setDragOverFull)}
                    onDragLeave={handleDragLeave(setDragOverFull)}
                  >
                    <input ref={fullRef} type="file" accept=".pkl,.joblib,.onnx,.tflite" hidden onChange={(e) => e.target.files?.[0] && setFullModelFile(e.target.files[0])} />
                    <Zap size={28} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Full Precision Model</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {fullModelFile ? fullModelFile.name : '.pkl, .joblib, .onnx, .tflite'}
                    </div>
                    {fullModelFile && <span className="badge badge-pass" style={{ marginTop: 8, fontSize: 10 }}>✓ READY</span>}
                    {fullModelProgress > 0 && fullModelProgress < 100 && (
                      <div style={{ marginTop: 8, height: 3, width: '80%', background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${fullModelProgress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    )}
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>REQUIRED</div>
                  </div>

                  {/* Quantized Model */}
                  <div
                    className={`upload-zone ${dragOverQuant ? 'drag-over' : ''}`}
                    onClick={() => quantRef.current?.click()}
                    onDrop={handleDrop(setQuantModelFile, setDragOverQuant)}
                    onDragOver={handleDragOver(setDragOverQuant)}
                    onDragLeave={handleDragLeave(setDragOverQuant)}
                  >
                    <input ref={quantRef} type="file" accept=".pkl,.joblib,.onnx,.tflite" hidden onChange={(e) => e.target.files?.[0] && setQuantModelFile(e.target.files[0])} />
                    <Cpu size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Quantized Model</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {quantModelFile ? quantModelFile.name : '.pkl, .joblib, .onnx, .tflite'}
                    </div>
                    {quantModelFile && <span className="badge badge-pass" style={{ marginTop: 8, fontSize: 10 }}>✓ READY</span>}
                    {quantModelProgress > 0 && quantModelProgress < 100 && (
                      <div style={{ marginTop: 8, height: 3, width: '80%', background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${quantModelProgress}%`, background: 'var(--muted)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    )}
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--placeholder)', fontWeight: 600 }}>OPTIONAL</div>
                  </div>
                </div>

                {/* Column Config */}
                <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Column Configuration</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                        Protected Columns <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        className="input"
                        placeholder="e.g. gender, ethnicity"
                        value={protectedCols}
                        onChange={(e) => setProtectedCols(e.target.value)}
                        id="quant-protected-cols"
                      />
                      <div style={{ fontSize: 10, color: 'var(--placeholder)', marginTop: 4 }}>Comma-separated</div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                        Label Column <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        className="input"
                        placeholder="e.g. hired"
                        value={labelCol}
                        onChange={(e) => setLabelCol(e.target.value)}
                        id="quant-label-col"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                        Positive Label <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        className="input"
                        placeholder="e.g. 1"
                        value={positiveLabel}
                        onChange={(e) => setPositiveLabel(e.target.value)}
                        id="quant-positive-label"
                      />
                    </div>
                  </div>
                </div>

                {/* Run Button */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', maxWidth: '360px', borderRadius: 14 }}
                    onClick={handleSubmitUpload}
                    disabled={submitting}
                    id="run-compression-btn"
                  >
                    {submitting ? (
                      <><Loader2 size={18} className="animate-spin" /> Running compression analysis…</>
                    ) : (
                      <><Cpu size={18} /> Run compression analysis</>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── FROM AUDIT MODE ── */}
            {mode === 'audit' && (
              <>
                <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Select Audit</div>
                  <select
                    className="select"
                    style={{ width: '100%', marginBottom: 12 }}
                    value={selectedAuditId}
                    onChange={(e) => setSelectedAuditId(e.target.value)}
                    id="quant-audit-picker"
                  >
                    <option value="">— Select a completed audit with model —</option>
                    {audits.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {a.domain} ({a.status})
                      </option>
                    ))}
                  </select>

                  {selectedAudit && (
                    <div className="animate-fade-in" style={{
                      padding: '14px 16px', borderRadius: 10,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      fontSize: 12, color: 'var(--muted)', lineHeight: 1.8,
                    }}>
                      <div><strong style={{ color: 'var(--fg)' }}>Dataset:</strong> {selectedAudit.storagePath?.split('/').pop()}</div>
                      <div><strong style={{ color: 'var(--fg)' }}>Model:</strong> {selectedAudit.modelStoragePath?.split('/').pop()}</div>
                      <div><strong style={{ color: 'var(--fg)' }}>Protected:</strong> {(selectedAudit.protectedCols || []).join(', ')}</div>
                      <div><strong style={{ color: 'var(--fg)' }}>Label:</strong> {selectedAudit.labelCol} = {selectedAudit.positiveLabel}</div>
                    </div>
                  )}
                </div>

                {selectedAudit && (
                  <>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
                        Upload Quantized Model <span style={{ color: 'var(--placeholder)', fontWeight: 400 }}>(optional)</span>
                      </div>
                      <div
                        className={`upload-zone ${dragOverQuantAudit ? 'drag-over' : ''}`}
                        style={{ maxWidth: 360 }}
                        onClick={() => quantAuditRef.current?.click()}
                        onDrop={handleDrop(setQuantModelFileAudit, setDragOverQuantAudit)}
                        onDragOver={handleDragOver(setDragOverQuantAudit)}
                        onDragLeave={handleDragLeave(setDragOverQuantAudit)}
                      >
                        <input ref={quantAuditRef} type="file" accept=".pkl,.joblib,.onnx,.tflite" hidden onChange={(e) => e.target.files?.[0] && setQuantModelFileAudit(e.target.files[0])} />
                        <Cpu size={24} style={{ color: 'var(--muted)', marginBottom: 6 }} />
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {quantModelFileAudit ? quantModelFileAudit.name : 'Drop quantized model or click to browse'}
                        </div>
                        {quantModelFileAudit && <span className="badge badge-pass" style={{ marginTop: 6, fontSize: 10 }}>✓ READY</span>}
                        {quantModelProgressAudit > 0 && quantModelProgressAudit < 100 && (
                          <div style={{ marginTop: 8, height: 3, width: '80%', background: 'var(--border)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${quantModelProgressAudit}%`, background: 'var(--muted)', borderRadius: 2, transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                      <button
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%', maxWidth: '360px', borderRadius: 14 }}
                        onClick={handleSubmitAudit}
                        disabled={submitting}
                        id="run-compression-audit-btn"
                      >
                        {submitting ? (
                          <><Loader2 size={18} className="animate-spin" /> Running compression analysis…</>
                        ) : (
                          <><Cpu size={18} /> Run compression analysis</>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── VIEW: RESULTS ── */}
        {view === 'results' && selectedProfile && (
          <div className="animate-fade-in">
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 16 }}
              onClick={() => { setSelectedProfile(null); setView('list'); }}
            >
              <ArrowLeft size={14} /> Back to profiles
            </button>

            {selectedProfile.status === 'FAILED' && (
              <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                <XCircle size={40} style={{ color: 'var(--danger)', marginBottom: 12 }} />
                <h3 style={{ color: 'var(--danger)', marginBottom: 8 }}>Analysis Failed</h3>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>{selectedProfile.error}</p>
              </div>
            )}

            {selectedProfile.status === 'PROCESSING' && (
              <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
                <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: 12 }} />
                <h3 style={{ color: 'var(--fg)', marginBottom: 8 }}>Analysis in progress…</h3>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>This page will auto-update when complete.</p>
              </div>
            )}

            {r && (
              <div className="animate-fade-in">
                {/* Overall Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
                  <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Full Precision</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>
                      {(r.overall.full_precision_accuracy * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Accuracy</div>
                  </div>
                  <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Quantized</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--muted)' }}>
                      {(r.overall.quantized_accuracy * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Accuracy</div>
                  </div>
                  <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Overall QDI</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: r.overall.qdi > 0.05 ? 'var(--danger)' : 'var(--success)' }}>
                      {r.overall.qdi.toFixed(3)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.overall.accuracy_drop_pct.toFixed(1)}% drop</div>
                  </div>
                  <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Flagged Groups</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: r.flagged_groups.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {r.flagged_groups.length}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>of {Object.values(r.per_group).reduce((a, g) => a + Object.keys(g).length, 0)} total</div>
                  </div>
                </div>

                {r.overall.simulated_quantization && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    borderRadius: 10, background: 'var(--warning-dim)', fontSize: 12, color: 'var(--warning)',
                    marginBottom: 24,
                  }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span>No quantized model was provided. Results use simulated INT8 quantization noise applied to the full-precision model.</span>
                  </div>
                )}

                {/* 2-Column Dashboard Grid */}
                <div className="results-grid">
                  
                  {/* Left Column: Chart and Table */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* QDI Bar Chart */}
                    {chartData.length > 0 && (
                      <div className="card" style={{ padding: '24px 28px' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>
                          Accuracy by Demographic Group
                        </h3>
                        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 48)}>
                          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="4 4" stroke="var(--border-light)" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: 'var(--fg)' }} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                              formatter={(value) => value === 'fullAcc' ? 'Full Precision' : 'Quantized'}
                              iconType="square"
                              iconSize={10}
                              wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                            />
                            <Bar dataKey="fullAcc" name="fullAcc" radius={[0, 4, 4, 0]} barSize={12}>
                              {chartData.map((entry, idx) => (
                                <Cell key={`full-${idx}`} fill="var(--primary)" />
                              ))}
                            </Bar>
                            <Bar dataKey="quantAcc" name="quantAcc" radius={[0, 4, 4, 0]} barSize={12}>
                              {chartData.map((entry, idx) => (
                                <Cell
                                  key={`quant-${idx}`}
                                  fill={entry.flagged ? 'var(--danger)' : 'var(--placeholder)'}
                                  stroke={entry.flagged ? 'var(--danger)' : 'none'}
                                  strokeWidth={entry.flagged ? 1 : 0}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* QDI Summary Table */}
                    <div className="card quantization-table" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>QDI Details</h3>
                      </div>
                      <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Attribute</th>
                              <th>Group</th>
                              <th>Full Acc</th>
                              <th>Quant Acc</th>
                              <th>QDI</th>
                              <th>Samples</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(r.per_group).map(([col, groups]) =>
                              Object.entries(groups).map(([group, data]) => (
                                <tr key={`${col}-${group}`}>
                                  <td style={{ fontWeight: 600, color: 'var(--fg)' }}>{col}</td>
                                  <td>{group}</td>
                                  <td>{(data.full_precision_accuracy * 100).toFixed(1)}%</td>
                                  <td style={{ color: data.flagged ? 'var(--danger)' : 'var(--fg)', fontWeight: data.flagged ? 600 : 400 }}>
                                    {(data.quantized_accuracy * 100).toFixed(1)}%
                                  </td>
                                  <td style={{ fontWeight: 700, color: data.flagged ? 'var(--danger)' : 'var(--success)' }}>
                                    {data.qdi.toFixed(3)}
                                  </td>
                                  <td style={{ color: 'var(--muted)' }}>{data.sample_size}</td>
                                  <td>
                                    {data.flagged ? (
                                      <span className="badge badge-critical" style={{ fontSize: 9 }}>🔴 FLAGGED</span>
                                    ) : (
                                      <span className="badge badge-pass" style={{ fontSize: 9 }}>✅ OK</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Status & Flagged Groups */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Deployment Recommendation callout */}
                    {r.flagged_groups.length > 0 ? (
                      <div className="card" style={{
                        padding: '24px',
                        background: 'var(--danger-dim)',
                        borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <Shield size={20} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--danger)', marginBottom: 8 }}>
                              Deployment Risk — Fairness Failure
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.6, margin: 0, opacity: 0.85 }}>
                              <strong>{r.flagged_groups.length} group{r.flagged_groups.length > 1 ? 's' : ''} experienced</strong> severe,
                              disproportionate accuracy degradation after model compression. Deploying this quantized model
                              may violate fairness requirements under AI regulations (e.g. NYC Local Law 144, EU AI Act).
                              Consider retraining with quantization-aware training (QAT) or using fallback paths.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="card" style={{
                        padding: '24px',
                        background: 'var(--success-dim)',
                        borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--success)', marginBottom: 4 }}>
                              Ready for Edge Deployment
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5, margin: 0, opacity: 0.75 }}>
                              All groups maintain accuracy within the 5.0% QDI threshold. The quantized model is approved for edge deployment from a fairness perspective.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Flagged Group Alerts stack */}
                    {r.flagged_groups.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Demographic Impact Details
                        </h4>
                        {r.flagged_groups.map((fg, idx) => (
                          <div
                            key={idx}
                            className="card flagged-group-card"
                            style={{
                              padding: '16px 20px',
                              borderLeft: `4px solid ${fg.severity === 'CRITICAL' ? 'var(--danger)' : fg.severity === 'HIGH' ? 'var(--warning)' : 'var(--accent)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--fg)' }}>
                                {fg.protected_col} = {fg.group}
                              </span>
                              <span className={`badge ${fg.severity === 'CRITICAL' ? 'badge-critical' : fg.severity === 'HIGH' ? 'badge-high' : 'badge-medium'}`} style={{ fontSize: 9 }}>
                                {fg.severity}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', marginLeft: 'auto' }}>
                                -{fg.accuracy_drop_pct.toFixed(1)}% Acc
                              </span>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                              Quantization drop: QDI of <strong>{fg.qdi.toFixed(3)}</strong> (dropped from {(fg.full_acc * 100).toFixed(1)}% accuracy to {(fg.quant_acc * 100).toFixed(1)}%).
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {profileLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
          </div>
        )}
      </div>
    </>
  );
}
