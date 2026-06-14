'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TopNav from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { uploadDatasetFile, uploadModelFile } from '@/lib/storage';
import {
  createTransferBiasAnalysis,
  listTransferBiasAnalyses,
  getTransferBiasAnalysis,
  deleteTransferBiasAnalysis,
  listAudits,
} from '@/lib/api';
import type {
  TransferBiasAnalysis,
  TransferBiasAnalysisDetail,
  TransferBiasAnalysisRequest,
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
  TrendingUp,
  RefreshCw,
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
    const baseDi = payload.find((p: any) => p.name === 'Base Model DI')?.value;
    const ftDi = payload.find((p: any) => p.name === 'Fine-tuned Model DI')?.value;
    const delta = payload.find((p: any) => p.name === 'Fine-tuned Model DI')?.payload?.delta;
    
    return (
      <div className="card" style={{ padding: '12px 16px', borderRadius: 12, fontSize: 13, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--fg)' }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--muted)' }}>Base Model DI:</span>
            <span style={{ fontWeight: 600, color: 'var(--warning)' }}>{baseDi}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--muted)' }}>Fine-tuned Model DI:</span>
            <span style={{ fontWeight: 600, color: ftDi < 0.8 ? 'var(--danger)' : 'var(--success)' }}>{ftDi}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--border-light)', paddingTop: 4, marginTop: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Delta (Bias Change):</span>
            <span style={{ fontWeight: 700, color: delta > 0.05 ? 'var(--danger)' : delta < -0.05 ? 'var(--success)' : 'var(--fg)' }}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function TransferBiasPage() {
  const { org, orgLoading } = useAuth();

  // Navigation
  const [view, setView] = useState<PageView>('list');

  // Analysis list
  const [analyses, setAnalyses] = useState<TransferBiasAnalysis[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [backendOffline, setBackendOffline] = useState(false);

  // Selected analysis (results view)
  const [selectedAnalysis, setSelectedAnalysis] = useState<TransferBiasAnalysisDetail | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState<string | null>(null);

  // New analysis form
  const [mode, setMode] = useState<UploadMode>('upload');
  const [analysisName, setProfileName] = useState('');
  const [baseModelName, setBaseModelName] = useState('bert-base-uncased');
  const [customBaseModelName, setCustomBaseModelName] = useState('');
  const [domain, setDomain] = useState('generic');

  // File states
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [fineTunedModelFile, setFineTunedModelFile] = useState<File | null>(null);

  // Upload progress
  const [datasetProgress, setDatasetProgress] = useState(0);
  const [fineTunedModelProgress, setFineTunedModelProgress] = useState(0);

  // Column config
  const [protectedCols, setProtectedCols] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [positiveLabel, setPositiveLabel] = useState('');

  // From audit mode
  const [audits, setAudits] = useState<any[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<any>(null);

  // Running state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pollingId, setPollingId] = useState<string | null>(null);

  // Drag states
  const [dragOverDataset, setDragOverDataset] = useState(false);
  const [dragOverModel, setDragOverModel] = useState(false);

  const datasetRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  // ─── Load Analyses ───
  const loadAnalyses = useCallback(async () => {
    if (!org?.id) return;
    setListLoading(true);
    setBackendOffline(false);
    try {
      const data = await listTransferBiasAnalyses(org.id);
      setAnalyses(data);
    } catch (e) {
      console.error('Failed to load transfer bias analyses:', e);
      setBackendOffline(true);
    } finally {
      setListLoading(false);
    }
  }, [org?.id]);

  useEffect(() => {
    if (!orgLoading && org?.id) loadAnalyses();
  }, [orgLoading, org?.id, loadAnalyses]);

  // Auto-select first attribute when selectedAnalysis loads
  useEffect(() => {
    if (selectedAnalysis?.results?.delta_by_attribute) {
      const attrs = Object.keys(selectedAnalysis.results.delta_by_attribute);
      if (attrs.length > 0) {
        setSelectedAttribute((prev) => prev && attrs.includes(prev) ? prev : attrs[0]);
      } else {
        setSelectedAttribute(null);
      }
    } else {
      setSelectedAttribute(null);
    }
  }, [selectedAnalysis]);

  // ─── Load audits for "from audit" mode ───
  useEffect(() => {
    if (mode !== 'audit' || !org?.id) return;
    (async () => {
      try {
        const data = await listAudits(org.id);
        // Only show completed audits
        const completedAudits = data.filter((a: any) => a.status === 'COMPLETE');
        setAudits(completedAudits);
      } catch (e) {
        console.error('Failed to load audits:', e);
      }
    })();
  }, [mode, org?.id]);

  // ─── Select audit (pre-populate columns) ───
  useEffect(() => {
    if (!selectedAuditId) {
      setSelectedAudit(null);
      return;
    }
    const audit = audits.find((a: any) => a.id === selectedAuditId);
    setSelectedAudit(audit || null);
    if (audit) {
      setProtectedCols(audit.protectedCols ? audit.protectedCols.join(', ') : '');
      setLabelCol(audit.labelCol || '');
      setPositiveLabel(audit.positiveLabel !== undefined ? String(audit.positiveLabel) : '');
    }
  }, [selectedAuditId, audits]);

  // ─── Poll for analysis completion ───
  useEffect(() => {
    if (!pollingId) return;
    const interval = setInterval(async () => {
      try {
        const analysis = await getTransferBiasAnalysis(pollingId);
        if (analysis.status === 'COMPLETE' || analysis.status === 'FAILED') {
          clearInterval(interval);
          setPollingId(null);
          setSubmitting(false);
          setSelectedAnalysis(analysis);
          setView('results');
          loadAnalyses();
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pollingId, loadAnalyses]);

  // ─── View an analysis ───
  const handleViewAnalysis = async (analysisId: string) => {
    setAnalysisLoading(true);
    setError('');
    try {
      const analysis = await getTransferBiasAnalysis(analysisId);
      setSelectedAnalysis(analysis);
      setView('results');
    } catch (e: any) {
      setError(e.message || 'Failed to load analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  // ─── Delete an analysis ───
  const handleDeleteAnalysis = async (analysisId: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return;
    try {
      await deleteTransferBiasAnalysis(analysisId);
      setAnalyses((prev) => prev.filter((a) => a.id !== analysisId));
    } catch (e: any) {
      setError(e.message || 'Failed to delete analysis');
    }
  };

  // ─── Submit new analysis (upload mode) ───
  const handleSubmitUpload = async () => {
    if (!org?.id) return setError('Organization not found');
    if (!datasetFile) return setError('Please upload a dataset');
    if (!fineTunedModelFile) return setError('Please upload a fine-tuned model');
    if (!protectedCols.trim()) return setError('Please specify protected columns');
    if (!labelCol.trim()) return setError('Please specify the label column');
    if (!positiveLabel.trim()) return setError('Please specify the positive label');

    setSubmitting(true);
    setError('');
    try {
      // Upload dataset
      const dsPath = await uploadDatasetFile(datasetFile, org.id, (p) => setDatasetProgress(p.progress));
      // Upload fine-tuned model
      const fmPath = await uploadModelFile(fineTunedModelFile, org.id, (p) => setFineTunedModelProgress(p.progress));

      const actualBaseModel = baseModelName === 'custom' ? customBaseModelName.trim() : baseModelName;
      if (!actualBaseModel) {
        setSubmitting(false);
        return setError('Please specify a base model name');
      }

      const result = await createTransferBiasAnalysis({
        orgId: org.id,
        name: analysisName.trim() || `Transfer Bias — ${new Date().toLocaleDateString()}`,
        datasetStoragePath: dsPath,
        fineTunedModelStoragePath: fmPath,
        baseModelName: actualBaseModel,
        domain: domain,
        protectedCols: protectedCols.split(',').map((c) => c.trim()).filter(Boolean),
        labelCol: labelCol.trim(),
        positiveLabel: positiveLabel.trim(),
      });

      setPollingId(result.analysisId);
    } catch (e: any) {
      setSubmitting(false);
      setError(e.message || 'Failed to create analysis');
    }
  };

  // ─── Submit new analysis (from audit mode) ───
  const handleSubmitAudit = async () => {
    if (!org?.id) return setError('Organization not found');
    if (!selectedAudit) return setError('Please select an audit');

    setSubmitting(true);
    setError('');
    try {
      const actualBaseModel = baseModelName === 'custom' ? customBaseModelName.trim() : baseModelName;
      if (!actualBaseModel) {
        setSubmitting(false);
        return setError('Please specify a base model name');
      }

      const result = await createTransferBiasAnalysis({
        orgId: org.id,
        name: analysisName.trim() || `Transfer Bias — ${selectedAudit.name}`,
        datasetStoragePath: selectedAudit.storagePath,
        fineTunedModelStoragePath: selectedAudit.modelStoragePath || '',
        baseModelName: actualBaseModel,
        domain: domain,
        protectedCols: selectedAudit.protectedCols || [],
        labelCol: selectedAudit.labelCol,
        positiveLabel: String(selectedAudit.positiveLabel),
        sourceAuditId: selectedAudit.id,
      });

      setPollingId(result.analysisId);
    } catch (e: any) {
      setSubmitting(false);
      setError(e.message || 'Failed to create analysis');
    }
  };

  // ─── Reset form ───
  const resetForm = () => {
    setDatasetFile(null);
    setFineTunedModelFile(null);
    setProfileName('');
    setBaseModelName('bert-base-uncased');
    setCustomBaseModelName('');
    setDomain('generic');
    setProtectedCols('');
    setLabelCol('');
    setPositiveLabel('');
    setSelectedAuditId('');
    setSelectedAudit(null);
    setDatasetProgress(0);
    setFineTunedModelProgress(0);
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
  const buildChartData = (results: any) => {
    if (!results || !results.delta_by_attribute) return [];
    
    return Object.entries(results.delta_by_attribute).map(([attr, data]: [string, any]) => ({
      name: attr,
      'Base Model DI': data.base_model_di,
      'Fine-tuned Model DI': data.finetuned_model_di,
      delta: data.delta,
      source: data.source,
    }));
  };

  const chartData = selectedAnalysis?.results ? buildChartData(selectedAnalysis.results) : [];

  const getSourceBadgeClass = (source: string) => {
    switch (source) {
      case 'INHERITED_FROM_BASE':
        return 'badge-inherited';
      case 'INTRODUCED_BY_FINETUNING':
        return 'badge-introduced';
      case 'AMPLIFIED_BY_FINETUNING':
        return 'badge-amplified';
      case 'MITIGATED_BY_FINETUNING':
        return 'badge-mitigated';
      default:
        return 'badge-neutral';
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'INHERITED_FROM_BASE':
        return 'Inherited from Base';
      case 'INTRODUCED_BY_FINETUNING':
        return 'Introduced by Fine-Tuning';
      case 'AMPLIFIED_BY_FINETUNING':
        return 'Amplified by Fine-Tuning';
      case 'MITIGATED_BY_FINETUNING':
        return 'Mitigated by Fine-Tuning';
      default:
        return 'Indeterminate';
    }
  };

  const getRiskBadgeClass = (risk: string) => {
    switch (risk) {
      case 'HIGH':
        return 'badge-critical';
      case 'MODERATE':
        return 'badge-warning';
      case 'LOW':
        return 'badge-low';
      case 'MINIMAL':
        return 'badge-pass';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Pipelines', href: '/pipelines' }, { label: 'Transfer Bias Detector' }]} />
      
      {/* ── Header Card (Full width next to left navbar) ── */}
      <div style={{ padding: '24px 32px 0', width: '100%', maxWidth: '100%', margin: '0' }}>
        <div className="transfer-header-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Cpu size={16} style={{ color: 'var(--primary)' }} />
            <span className="badge badge-low" style={{ fontSize: 10, letterSpacing: 1 }}>BIAS SOURCE ISOLATION</span>
          </div>
          <h1 className="page-title" style={{ marginBottom: 12, fontSize: '28px', fontWeight: 800, letterSpacing: '-0.025em' }}>
            Bias Transfer Learning Detector
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 800, marginBottom: 20 }}>
            Organizations inherit biases built into foundation models (e.g. BERT, GPT-2) and add new bias
            during fine-tuning. This scanner compares your fine-tuned model's predictions with published pre-training baseline profiles to isolate the origin of bias.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className="badge badge-pass" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8 }}>AUDIT COMPATIBLE</span>
            <span className="badge badge-neutral" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8 }}>ZERO RECOMPUTATION OPTION</span>
            <span className="badge badge-low" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8 }}>PUBLISHED LITERATURE BASELINES</span>
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
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ── VIEW: LIST ── */}
        {view === 'list' && (
          <div className="animate-fade-in">
            {backendOffline && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                borderRadius: 12, background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 13,
                marginBottom: 20,
              }}>
                <AlertTriangle size={16} />
                <span>Backend unavailable. Please ensure the backend server is running.</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Previous Isolation Analyses</h2>
              <button
                className="btn btn-primary"
                onClick={() => { resetForm(); setView('new'); }}
                id="new-transfer-bias-btn"
              >
                <Plus size={16} /> Run Transfer Bias Analysis
              </button>
            </div>

            {listLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />
                ))}
              </div>
            ) : analyses.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <Layers size={40} style={{ color: 'var(--placeholder)', marginBottom: 12 }} />
                <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
                  No transfer bias isolation profiles created yet. Compare your model with base model baselines today.
                </p>
                <button className="btn btn-primary" onClick={() => { resetForm(); setView('new'); }}>
                  <Plus size={16} /> Run First Analysis
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analyses.map((a) => (
                  <div
                    key={a.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 24px',
                      borderRadius: 14,
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {a.name}
                          {a.status === 'COMPLETE' && a.summary && (
                            <span className={`badge ${getRiskBadgeClass(a.summary.risk_level)}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                              {a.summary.risk_level} RISK
                            </span>
                          )}
                          {a.status === 'FAILED' && (
                            <span className="badge badge-critical" style={{ fontSize: 10 }}>FAILED</span>
                          )}
                          {a.status === 'PROCESSING' && (
                            <span className="badge badge-neutral" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Loader2 size={10} className="animate-spin" /> Processing
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Cpu size={12} /> {a.baseModelName}
                          </span>
                          <span>•</span>
                          <span>Domain: {a.domain}</span>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} /> {new Date(a.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Sparkline horizontal bar chart */}
                    {a.status === 'COMPLETE' && a.summary && (() => {
                      const worstAttr = a.summary.worst_attribute || 'Unknown';
                      const baseDi = a.summary.worst_attribute_base_di ?? 0.8;
                      const ftDi = a.summary.worst_attribute_finetuned_di ?? (baseDi - a.summary.worst_delta);
                      
                      const getSeverityColor = (di: number) => {
                        if (di < 0.6) return 'var(--danger)';
                        if (di < 0.8) return 'var(--warning)';
                        return 'var(--success)';
                      };
                      const dotColor = getSeverityColor(ftDi);

                      return (
                        <div className="micro-bar-container" style={{ minWidth: 180, margin: '0 24px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ backgroundColor: dotColor }} className="severity-dot" />
                            <span style={{ color: 'var(--muted)' }}>Worst Attribute:</span>
                            <span style={{ color: 'var(--fg)' }}>{worstAttr}</span>
                          </div>
                          <div className="micro-bar-row">
                            <span className="micro-bar-label">Base</span>
                            <div className="micro-bar-track">
                              <div className="micro-bar-fill" style={{ width: `${Math.min(100, baseDi * 100)}%`, backgroundColor: 'var(--muted)' }} />
                            </div>
                            <span className="micro-bar-value">{baseDi.toFixed(2)}</span>
                          </div>
                          <div className="micro-bar-row">
                            <span className="micro-bar-label">Fine</span>
                            <div className="micro-bar-track">
                              <div className="micro-bar-fill" style={{ width: `${Math.min(100, ftDi * 100)}%`, backgroundColor: dotColor }} />
                            </div>
                            <span className="micro-bar-value">{ftDi.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {a.status === 'COMPLETE' ? (
                        <button className="btn btn-secondary" onClick={() => handleViewAnalysis(a.id)} style={{ padding: '6px 12px', fontSize: 12 }}>
                          <Eye size={14} /> View Results
                        </button>
                      ) : a.status === 'PROCESSING' ? (
                        <button className="btn btn-secondary" onClick={() => setPollingId(a.id)} style={{ padding: '6px 12px', fontSize: 12 }}>
                          <RefreshCw size={14} className="animate-spin" /> Monitor
                        </button>
                      ) : null}
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleDeleteAnalysis(a.id)}
                        style={{ padding: 8, color: 'var(--danger)' }}
                        title="Delete Analysis"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── VIEW: NEW FORM (Centered & perfectly sized) ── */}
        {view === 'new' && (
          <div className="animate-fade-in" style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <button className="btn btn-secondary" style={{ padding: 8 }} onClick={() => setView('list')}>
                <ArrowLeft size={16} />
              </button>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>Run New Isolation Analysis</h2>
            </div>

            {/* Mode Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <button
                type="button"
                className={`card p-4 flex flex-col items-center gap-2 cursor-pointer transition-all ${mode === 'upload' ? 'border-primary shadow-sm' : ''}`}
                style={{
                  borderWidth: mode === 'upload' ? '2px' : '1px',
                  background: mode === 'upload' ? 'var(--primary-glow)' : 'var(--surface)',
                }}
                onClick={() => setMode('upload')}
              >
                <Upload size={20} style={{ color: mode === 'upload' ? 'var(--primary)' : 'var(--muted)' }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>Upload New Dataset & Model</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  Analyze raw CSV dataset and fine-tuned joblib/onnx model.
                </span>
              </button>

              <button
                type="button"
                className={`card p-4 flex flex-col items-center gap-2 cursor-pointer transition-all ${mode === 'audit' ? 'border-primary shadow-sm' : ''}`}
                style={{
                  borderWidth: mode === 'audit' ? '2px' : '1px',
                  background: mode === 'audit' ? 'var(--primary-glow)' : 'var(--surface)',
                }}
                onClick={() => setMode('audit')}
              >
                <Database size={20} style={{ color: mode === 'audit' ? 'var(--primary)' : 'var(--muted)' }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>From Existing Audit</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  Reuse existing completed audits (Zero recomputation).
                </span>
              </button>
            </div>

            {/* Form Fields Card */}
            <div className="card p-6" style={{ borderRadius: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                
                {/* Analysis Name */}
                <div>
                  <label htmlFor="analysis-name" className="form-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                    Analysis Name
                  </label>
                  <input
                    type="text"
                    id="analysis-name"
                    className="form-input w-full"
                    placeholder="e.g. Hiring Model Transfer Analysis"
                    value={analysisName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>

                {/* Base Model Select */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label htmlFor="base-model-select" className="form-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                      Pre-trained Base Model
                    </label>
                    <select
                      id="base-model-select"
                      className="form-input w-full"
                      value={baseModelName}
                      onChange={(e) => setBaseModelName(e.target.value)}
                    >
                      <option value="bert-base-uncased">bert-base-uncased</option>
                      <option value="distilbert-base-uncased">distilbert-base-uncased</option>
                      <option value="roberta-base">roberta-base</option>
                      <option value="gpt2">gpt2 (GPT-2)</option>
                      <option value="albert-base-v2">albert-base-v2</option>
                      <option value="custom">Custom (Specify name)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="domain-select" className="form-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                      Application Domain
                    </label>
                    <select
                      id="domain-select"
                      className="form-input w-full"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                    >
                      <option value="generic">Generic Text/Tabular</option>
                      <option value="hiring">Hiring / HR Evaluations</option>
                      <option value="lending">Finance / Lending Decisioning</option>
                      <option value="healthcare">Healthcare Risk Allocation</option>
                    </select>
                  </div>
                </div>

                {baseModelName === 'custom' && (
                  <div className="animate-fade-in">
                    <label htmlFor="custom-base-model" className="form-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                      HuggingFace Model Name
                    </label>
                    <input
                      type="text"
                      id="custom-base-model"
                      className="form-input w-full"
                      placeholder="e.g. distilroberta-base"
                      value={customBaseModelName}
                      onChange={(e) => setCustomBaseModelName(e.target.value)}
                    />
                  </div>
                )}

                {/* MODE: SELECT EXISTING AUDIT */}
                {mode === 'audit' && (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label htmlFor="audit-select" className="form-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                        Select Completed Audit
                      </label>
                      <select
                        id="audit-select"
                        className="form-input w-full animate-pulse"
                        style={{ animationDuration: '3s' }}
                        value={selectedAuditId}
                        onChange={(e) => setSelectedAuditId(e.target.value)}
                      >
                        <option value="">-- Select Completed Audit --</option>
                        {audits.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.domain} • DI: {a.dataBias ? 'Processed' : 'No Bias Info'})
                          </option>
                        ))}
                      </select>
                      {audits.length === 0 && (
                        <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                          No completed audits with model files were found in your organization.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* MODE: DIRECT UPLOAD */}
                {mode === 'upload' && (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    
                    {/* Drag and Drop Dataset */}
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Upload Test Dataset (.csv, .json, .parquet)</span>
                      <div
                        className={`upload-zone flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragOverDataset ? 'border-primary bg-primary-glow' : 'border-border'}`}
                        onClick={() => datasetRef.current?.click()}
                        onDragOver={handleDragOver(setDragOverDataset)}
                        onDragLeave={handleDragLeave(setDragOverDataset)}
                        onDrop={handleDrop((f) => setDatasetFile(f), setDragOverDataset)}
                      >
                        <input type="file" ref={datasetRef} onChange={(e) => e.target.files?.[0] && setDatasetFile(e.target.files[0])} accept=".csv,.json,.parquet" style={{ display: 'none' }} />
                        <Upload size={24} style={{ color: datasetFile ? 'var(--primary)' : 'var(--muted)', marginBottom: 8 }} />
                        {datasetFile ? (
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textAlign: 'center' }}>
                            {datasetFile.name} ({(datasetFile.size / 1024).toFixed(1)} KB)
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                            Drag and drop file here, or <strong style={{ color: 'var(--primary)' }}>browse</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Drag and Drop Fine-tuned Model */}
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Upload Fine-tuned Model (.joblib, .pkl, .onnx)</span>
                      <div
                        className={`upload-zone flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragOverModel ? 'border-primary bg-primary-glow' : 'border-border'}`}
                        onClick={() => modelRef.current?.click()}
                        onDragOver={handleDragOver(setDragOverModel)}
                        onDragLeave={handleDragLeave(setDragOverModel)}
                        onDrop={handleDrop((f) => setFineTunedModelFile(f), setDragOverModel)}
                      >
                        <input type="file" ref={modelRef} onChange={(e) => e.target.files?.[0] && setFineTunedModelFile(e.target.files[0])} accept=".joblib,.pkl,.onnx" style={{ display: 'none' }} />
                        <FileText size={24} style={{ color: fineTunedModelFile ? 'var(--primary)' : 'var(--muted)', marginBottom: 8 }} />
                        {fineTunedModelFile ? (
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textAlign: 'center' }}>
                            {fineTunedModelFile.name} ({(fineTunedModelFile.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                            Drag and drop file here, or <strong style={{ color: 'var(--primary)' }}>browse</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Columns configuration */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label htmlFor="protected-cols" className="form-label" style={{ fontWeight: 600, fontSize: 12, display: 'block', marginBottom: 4 }}>
                          Protected Attributes
                        </label>
                        <input
                          type="text"
                          id="protected-cols"
                          className="form-input w-full"
                          placeholder="e.g. gender, ethnicity"
                          value={protectedCols}
                          onChange={(e) => setProtectedCols(e.target.value)}
                        />
                      </div>

                      <div>
                        <label htmlFor="label-col" className="form-label" style={{ fontWeight: 600, fontSize: 12, display: 'block', marginBottom: 4 }}>
                          Label Column
                        </label>
                        <input
                          type="text"
                          id="label-col"
                          className="form-input w-full"
                          placeholder="e.g. hired"
                          value={labelCol}
                          onChange={(e) => setLabelCol(e.target.value)}
                        />
                      </div>

                      <div>
                        <label htmlFor="positive-label" className="form-label" style={{ fontWeight: 600, fontSize: 12, display: 'block', marginBottom: 4 }}>
                          Positive Class Label
                        </label>
                        <input
                          type="text"
                          id="positive-label"
                          className="form-input w-full"
                          placeholder="e.g. 1 or Approved"
                          value={positiveLabel}
                          onChange={(e) => setPositiveLabel(e.target.value)}
                        />
                      </div>
                    </div>

                  </div>
                )}

                {/* Submitting Progress Indicator */}
                {submitting && (
                  <div className="animate-fade-in card p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--primary)' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>
                        {pollingId ? 'Running analysis in background...' : 'Uploading files & preparing analysis...'}
                      </span>
                    </div>
                    {mode === 'upload' && !pollingId && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>Dataset: {datasetProgress}%</span>
                          <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 2 }}>
                            <div style={{ width: `${datasetProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: 2 }} />
                          </div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>Fine-tuned Model: {fineTunedModelProgress}%</span>
                          <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 2 }}>
                            <div style={{ width: `${fineTunedModelProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: 2 }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Form Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setView('list')} disabled={submitting}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={submitting || (mode === 'audit' && !selectedAuditId)}
                    onClick={mode === 'upload' ? handleSubmitUpload : handleSubmitAudit}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Run Analysis
                      </>
                    ) : (
                      'Run Bias Source Isolation'
                    )}
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── VIEW: RESULTS DASHBOARD (Stunning design) ── */}
        {view === 'results' && selectedAnalysis && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Header / Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-secondary" style={{ padding: 8 }} onClick={() => setView('list')}>
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedAnalysis.name}
                  </h2>
                  <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                    Base: {selectedAnalysis.baseModelName} • Domain: {selectedAnalysis.domain}
                  </p>
                </div>
              </div>
            </div>

            {selectedAnalysis.results ? (
              <>
                {/* 1. Risk Level and Narrative Top Card */}
                <div className="card p-6" style={{
                  borderLeft: `6px solid ${
                    selectedAnalysis.summary.risk_level === 'HIGH' ? 'var(--danger)' :
                    selectedAnalysis.summary.risk_level === 'MODERATE' ? 'var(--warning)' :
                    'var(--success)'
                  }`,
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5 }}>OVERALL TRANSFER RISK</span>
                      <span className={`badge ${getRiskBadgeClass(selectedAnalysis.summary.risk_level)}`} style={{ fontSize: 15, padding: '6px 16px', borderRadius: 10 }}>
                        {selectedAnalysis.summary.risk_level} RISK
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>EXECUTIVE SUMMARY</span>
                      <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.6 }}>
                        {selectedAnalysis.summary.narrative}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Waterfall Bias Flow Chart */}
                <div className="card p-6">
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>Bias Waterfall Flow (Disparate Impact Comparison)</h3>
                  <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 20 }}>
                    Shows the difference in Disparate Impact (DI) between the pre-trained base model and your fine-tuned model. DI values below 0.80 indicate potential bias issues.
                  </p>
                  
                  <div style={{ width: '100%', height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                        <XAxis dataKey="name" stroke="var(--muted)" fontSize={12} tickLine={false} />
                        <YAxis stroke="var(--muted)" fontSize={12} domain={[0, 1.1]} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <ReferenceLine y={0.8} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: 'Fairness Threshold (0.8)', position: 'insideBottomLeft', fill: 'var(--danger)', fontSize: 10, fontWeight: 600 }} />
                        
                        <Bar dataKey="Base Model DI" fill="#90caf9" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, idx) => (
                            <Cell key={`cell-base-${idx}`} fill="var(--warning-dim)" stroke="var(--warning)" strokeWidth={1.5} />
                          ))}
                        </Bar>
                        
                        <Bar dataKey="Fine-tuned Model DI" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry: any, idx) => {
                            const isBiased = entry['Fine-tuned Model DI'] < 0.8;
                            return (
                              <Cell key={`cell-ft-${idx}`} fill={isBiased ? 'var(--danger-glow)' : 'var(--success-dim)'} stroke={isBiased ? 'var(--danger)' : 'var(--success)'} strokeWidth={1.5} />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Master-Detail Split View (Attributes on left, details on right) */}
                <div className="master-detail-split" style={{ marginBottom: 24 }}>
                  
                  {/* Left Pane (Master List of Attributes) */}
                  <div className="master-list-pane">
                    <div className="master-list-title">Attributes</div>
                    <div className="master-list-scroll">
                      {Object.entries(selectedAnalysis.results.delta_by_attribute).map(([attr, data]: [string, any]) => {
                        const ftDi = data.finetuned_model_di;
                        const isSelected = selectedAttribute === attr;
                        
                        let severityClass = 'pass';
                        if (ftDi < 0.6) severityClass = 'critical';
                        else if (ftDi < 0.8) severityClass = 'high';

                        return (
                          <div
                            key={attr}
                            className={`master-list-item ${isSelected ? 'is-active' : ''}`}
                            onClick={() => setSelectedAttribute(attr)}
                          >
                            <div className="master-list-item-header">
                              <span className="master-list-item-name">{attr}</span>
                              <span className={`severity-dot ${severityClass}`} />
                            </div>
                            <div>
                              <span className={`badge ${getSourceBadgeClass(data.source)}`} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4 }}>
                                {getSourceLabel(data.source)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Pane (Detail View of Selected Attribute) */}
                  {selectedAttribute && selectedAnalysis.results.delta_by_attribute[selectedAttribute] ? (() => {
                    const data = selectedAnalysis.results.delta_by_attribute[selectedAttribute];
                    
                    return (
                      <div className="detail-pane">
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>ATTRIBUTE DETAIL</span>
                          <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', marginTop: 4 }}>{selectedAttribute}</h3>
                        </div>

                        {/* Metrics comparison cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                          <div className="card" style={{ padding: '16px 20px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Base Model DI</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: data.base_model_di < 0.8 ? 'var(--warning)' : 'var(--fg)', display: 'block', marginTop: 4 }}>
                              {data.base_model_di.toFixed(3)}
                            </span>
                          </div>
                          <div className="card" style={{ padding: '16px 20px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Fine-tuned Model DI</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: data.finetuned_model_di < 0.8 ? 'var(--danger)' : 'var(--success)', display: 'block', marginTop: 4 }}>
                              {data.finetuned_model_di.toFixed(3)}
                            </span>
                          </div>
                          <div className="card" style={{ padding: '16px 20px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Delta (DI Shift)</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: data.delta > 0.05 ? 'var(--danger)' : 'var(--fg)', display: 'block', marginTop: 4 }}>
                              {data.delta > 0 ? `+${data.delta.toFixed(3)}` : data.delta.toFixed(3)}
                            </span>
                          </div>
                        </div>

                        {/* Group Approval Rates Table */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>
                            Group Approval Rates
                          </h4>
                          <div className="overflow-hidden border border-border-light rounded-xl">
                            <table className="w-full transfer-table" style={{ borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                                  <th style={{ padding: '8px 12px' }}>Group</th>
                                  <th style={{ padding: '8px 12px' }}>Approval Rate</th>
                                  <th style={{ padding: '8px 12px' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(data.group_rates || {}).map(([group, rate]: [string, any]) => {
                                  const isPriv = group === data.privileged_group;
                                  return (
                                    <tr key={group} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--fg)' }}>{group}</td>
                                      <td style={{ padding: '10px 12px', color: 'var(--fg)' }}>{(rate * 100).toFixed(1)}%</td>
                                      <td style={{ padding: '10px 12px' }}>
                                        {isPriv ? (
                                          <span className="badge badge-pass" style={{ fontSize: 10, padding: '2px 6px' }}>PRIVILEGED</span>
                                        ) : (
                                          <span className="badge badge-neutral" style={{ fontSize: 10, padding: '2px 6px' }}>UNPRIVILEGED</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Actionable recommendation */}
                        <div className="recommendation-card" style={{ borderLeftColor: data.delta > 0.05 ? 'var(--danger)' : 'var(--primary)' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <Sparkles size={14} style={{ color: data.delta > 0.05 ? 'var(--danger)' : 'var(--primary)', marginTop: 2, flexShrink: 0 }} />
                            <div>
                              <strong style={{ fontSize: 12, display: 'block', color: 'var(--fg)', marginBottom: 4 }}>Actionable Mitigations</strong>
                              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                                {data.recommendation}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="card flex items-center justify-center" style={{ minHeight: 450 }}>
                      <p style={{ color: 'var(--muted)' }}>Select an attribute on the left to inspect detailed metrics.</p>
                    </div>
                  )}

                </div>

                {/* 4. Educational Explainer Card (Full width at bottom) */}
                <div className="card p-5" style={{ borderRadius: 14, background: 'var(--surface-2)', width: '100%' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>Understanding Bias Sources</h4>
                      <ul style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, listStyleType: 'disc' }}>
                        <li>
                          <strong>Inherited:</strong> The pre-trained model has pre-existing bias, and your fine-tuning data is relatively fair. Fix this using post-processing calibration or debiased foundation models.
                        </li>
                        <li>
                          <strong>Introduced:</strong> The pre-trained model was fair, but your fine-tuning labels or skewed representation introduced new systematic bias. Audit your training annotations!
                        </li>
                        <li>
                          <strong>Amplified:</strong> The pre-trained model was biased, and fine-tuning on skewed data amplified it significantly. Both representation and model need post-processing adjustments.
                        </li>
                        <li>
                          <strong>Mitigated:</strong> Your training dataset was highly representative and balanced, helping correct the pre-trained model's original bias patterns.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ padding: 48, textAlign: 'center' }}>
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading results...</p>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
