'use client';

import TopNav from '@/components/layout/TopNav';
import {
  Upload,
  FileSpreadsheet,
  Cpu,
  Globe,
  Link2,
  ChevronRight,
  ChevronLeft,
  Check,
  Rocket,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Calendar,
  PlusCircle,
} from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { uploadDatasetFile, uploadModelFile, type UploadProgress } from '@/lib/storage';
import { parseSchema, createAudit } from '@/lib/api';
import Papa from 'papaparse';

const DOMAINS = [
  'Hiring / Recruitment',
  'Financial Lending',
  'Healthcare / Medical Triage',
  'Criminal Justice / Risk Assessment',
  'Insurance Underwriting',
  'Education / Admissions',
  'Other',
];

const JURISDICTIONS = [
  'Global',
  'North America',
  'Europe',
  'APAC',
  'India',
];

interface ColumnInfo {
  name: string;
  dtype: string;
  unique_count: number;
  null_count: number;
  sample_values: string[];
  sensitivity_score: number;
  flagged_reason: string | null;
  auto_flagged: boolean;
}

function CustomDatePicker({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => value ? new Date(value) : new Date());

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const handleDateClick = (day: number) => {
    const fn = (n: number) => n.toString().padStart(2, '0');
    const newDate = `${currentMonth.getFullYear()}-${fn(currentMonth.getMonth() + 1)}-${fn(day)}`;
    onChange(newDate);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center input" style={{ padding: '6px 10px', minHeight: '38px', position: 'relative' }}>
        <input 
          type="text" 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          placeholder="YYYY-MM-DD"
          className="bg-transparent border-none outline-none w-full text-sm"
          style={{ color: 'var(--fg)', outline: 'none', boxShadow: 'none' }}
        />
        <button type="button" onClick={() => setOpen(!open)} className="ml-2 flex flex-shrink-0 cursor-pointer" style={{ color: 'var(--muted)', background: 'transparent', border: 'none' }}>
          <Calendar size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 p-3 rounded-lg shadow-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', width: '240px' }}>
          <div className="flex justify-between items-center mb-3">
             <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-1" style={{ color: 'var(--fg)', background: 'transparent', border: 'none', cursor: 'pointer' }}>&lt;</button>
             <span className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
             <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-1" style={{ color: 'var(--fg)', background: 'transparent', border: 'none', cursor: 'pointer' }}>&gt;</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1 font-semibold" style={{ color: 'var(--muted)' }}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`}/>)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isSelected = value === `${currentMonth.getFullYear()}-${(currentMonth.getMonth()+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
              return (
                <button 
                  key={d} type="button"
                  onClick={() => handleDateClick(d)}
                  className="p-1 rounded transition-colors text-xs"
                  style={{ 
                    background: isSelected ? 'var(--primary-dim)' : 'transparent', 
                    color: isSelected ? 'var(--primary)' : 'var(--fg)',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonUploadState({
  title,
  progress,
  tone = 'primary',
}: {
  title: string;
  progress?: number;
  tone?: 'primary' | 'warning';
}) {
  const toneColor = tone === 'warning' ? 'var(--warning)' : 'var(--primary)';
  return (
    <div className="w-full max-w-sm">
      <div className="skeleton mx-auto mb-4" style={{ width: 56, height: 56, borderRadius: '50%' }} />
      <div className="space-y-2">
        <div className="skeleton" style={{ height: 14, width: '72%', margin: '0 auto' }} />
        <div className="skeleton" style={{ height: 12, width: '44%', margin: '0 auto' }} />
      </div>
      {typeof progress === 'number' && (
        <div className="mt-4">
          <div className="flex justify-between text-xs font-semibold mb-2" style={{ color: toneColor }}>
            <span>{title}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: toneColor }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewAuditPage() {
  const { org } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 - File state
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [dataOnly, setDataOnly] = useState(false);
  const [useApi, setUseApi] = useState(false);
  const [dragOver, setDragOver] = useState<'data' | 'model' | null>(null);

  // Upload + parsing state
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [storagePath, setStoragePath] = useState<string>('');
  const [modelStoragePath, setModelStoragePath] = useState<string>('');
  const [modelUploadProgress, setModelUploadProgress] = useState<UploadProgress | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string>('');

  // Schema data from backend
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);

  // Client-side CSV preview (instant, before backend)
  const [clientPreview, setClientPreview] = useState<string[][]>([]);

  // Step 2 state
  const [auditName, setAuditName] = useState('');
  const [domain, setDomain] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [positiveLabel, setPositiveLabel] = useState('');
  const [protectedCols, setProtectedCols] = useState<string[]>([]);
  const [deployed, setDeployed] = useState(false);
  const [deployedSince, setDeployedSince] = useState('');
  const [decisionsPerMonth, setDecisionsPerMonth] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [threshold, setThreshold] = useState(0.8);
  const [jurisdiction, setJurisdiction] = useState('Global');

  // Progressive Disclosure states
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Smart Prefilling logic
  useEffect(() => {
    if (step === 2 && columns.length > 0 && !labelCol) {
      const targetNames = ['label', 'target', 'outcome', 'decision', 'approved', 'status', 'is_hired', 'hired'];
      const guessedCol = columns.find(c => targetNames.includes(c.name.toLowerCase()));
      if (guessedCol) {
        setLabelCol(guessedCol.name);
        
        // Naive guess for positive label if it has sample values
        const samples = guessedCol.sample_values || [];
        const posGuess = samples.find(v => ['1', 'true', 'yes', 'approved', 'success', 'hired'].includes(String(v).toLowerCase()));
        if (posGuess) {
          setPositiveLabel(String(posGuess));
        } else if (samples.length > 0) {
          setPositiveLabel(String(samples[0]));
        }
      }
    }
  }, [step, columns, labelCol]);

  // Parse CSV preview client-side (instant feedback)
  const parseClientPreview = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setClientPreview([]);
      return;
    }
    Papa.parse(file, {
      preview: 6, // header + 5 rows
      complete: (results) => {
        setClientPreview(results.data as string[][]);
      },
      error: () => setClientPreview([]),
    });
  };

  // Handle dataset file selection
  const handleDataFile = async (file: File) => {
    setDataFile(file);
    setAnalyzeError('');
    setColumns([]);
    setPreviewRows([]);

    // Client-side preview (instant)
    parseClientPreview(file);

    if (!org) {
      setAnalyzeError('No organization found. Please complete onboarding first.');
      return;
    }

    // Upload to Firebase Storage
    setUploadProgress({ progress: 0, state: 'uploading' });
    try {
      const path = await uploadDatasetFile(file, org.id, (p) => setUploadProgress(p));
      setStoragePath(path);

      // Now call backend to parse schema
      setAnalyzing(true);
      const result = await parseSchema(path);

      setColumns(result.schema.columns);
      setRowCount(result.schema.row_count);
      setPreviewRows(result.preview);

      // Auto-select flagged columns as protected
      const flagged = result.schema.columns
        .filter((c: ColumnInfo) => c.auto_flagged)
        .map((c: ColumnInfo) => c.name);
      setProtectedCols(flagged);
      setAnalyzing(false);
    } catch (err: any) {
      setAnalyzeError(err?.message || 'Upload or analysis failed');
      setUploadProgress({ progress: 0, state: 'error', error: err?.message });
      setAnalyzing(false);
    }
  };

  // Handle model file upload
  const handleModelFile = async (file: File) => {
    setModelFile(file);
    if (!org) return;

    setModelUploadProgress({ progress: 0, state: 'uploading' });
    try {
      const path = await uploadModelFile(file, org.id, (p) => setModelUploadProgress(p));
      setModelStoragePath(path);
    } catch (err: any) {
      setModelUploadProgress({ progress: 0, state: 'error', error: err?.message });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent, type: 'data' | 'model') => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (type === 'data') handleDataFile(file);
      else handleModelFile(file);
    }
  }, [org]);

  const toggleProtected = (col: string) => {
    setProtectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const isStep1Ready = dataFile && columns.length > 0 && !analyzing;
  const estimatedTime = Math.max(5, Math.round((rowCount / 10000) * 30));

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'New Audit' }]} />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full animate-fade-in">
        {/* Stepper */}
        <div className="flex items-center gap-0 mb-6 max-w-lg mx-auto">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}>
                {step > s ? <Check size={14} /> : s}
              </div>
              {s < 3 && <div className={`step-line ${step > s ? 'active' : ''}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between max-w-lg mx-auto mb-6 -mt-2">
          {['Upload Files', 'Define Context', 'Review & Launch'].map((l, i) => (
            <span
              key={l}
              className="text-xs font-medium"
              style={{ color: step === i + 1 ? 'var(--primary)' : 'var(--placeholder)' }}
            >
              {l}
            </span>
          ))}
        </div>

        {/* Step 1 - Upload */}
        {step === 1 && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Dataset Upload */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>
                  <FileSpreadsheet size={13} className="inline mr-1" style={{ color: 'var(--primary)' }} />
                  Dataset <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div
                  className={`upload-zone flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden ${dragOver === 'data' ? 'drag-over scale-[1.02]' : ''}`}
                  style={{ 
                    minHeight: 180,
                    background: dragOver === 'data' ? 'var(--primary-dim)' : 'var(--surface-2)',
                    borderColor: dragOver === 'data' ? 'var(--primary)' : 'var(--border)'
                  }}
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => { e.preventDefault(); setDragOver('data'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, 'data')}
                  onClick={() => {
                    if (uploadProgress?.state === 'uploading' || analyzing) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv,.json,.parquet';
                    input.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleDataFile(f);
                    };
                    input.click();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (uploadProgress?.state === 'uploading' || analyzing) return;
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.csv,.json,.parquet';
                      input.onchange = (ev) => {
                        const f = (ev.target as HTMLInputElement).files?.[0];
                        if (f) handleDataFile(f);
                      };
                      input.click();
                    }
                  }}
                >
                  {dataFile ? (
                    <div className="w-full px-6 flex flex-col items-center">
                      {uploadProgress?.state === 'uploading' ? (
                        <SkeletonUploadState title={`Uploading ${dataFile.name}`} progress={uploadProgress.progress} tone="primary" />
                      ) : analyzing ? (
                        <div className="w-full max-w-sm text-center">
                          <div className="skeleton mx-auto mb-3" style={{ width: 56, height: 56, borderRadius: '50%' }} />
                          <div className="skeleton mx-auto mb-2" style={{ width: '58%', height: 14 }} />
                          <div className="skeleton mx-auto" style={{ width: '42%', height: 12 }} />
                        </div>
                      ) : columns.length > 0 ? (
                        <div className="text-center w-full max-w-sm">
                          <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--success-dim)' }}>
                            <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
                          </div>
                          <div className="text-[15px] font-semibold" style={{ color: 'var(--fg)' }}>
                            {dataFile.name}
                          </div>
                          <div className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted)' }}>
                            {(dataFile.size / 1024 / 1024).toFixed(2)} MB • {rowCount.toLocaleString()} rows • {columns.length} columns
                          </div>
                        </div>
                      ) : (
                        <div className="text-center w-full max-w-sm">
                          <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--danger-dim)' }}>
                            <XCircle size={24} style={{ color: 'var(--danger)' }} />
                          </div>
                          <div className="text-[15px] font-semibold" style={{ color: 'var(--fg)' }}>
                            Upload Failed
                          </div>
                          <div className="text-xs mt-1.5 p-2 rounded-md" style={{ color: 'var(--danger)', background: 'var(--danger-dim)' }}>
                            {analyzeError || 'Invalid dataset schema. Please try again.'}
                          </div>
                          <div className="mt-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>Click to try again</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center pointer-events-none">
                      <Upload size={32} style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
                      <div className="text-[15px] font-semibold mb-1" style={{ color: 'var(--fg)' }}>Drag & drop your dataset</div>
                      <div className="text-xs font-medium" style={{ color: 'var(--placeholder)' }}>
                        .csv, .json, .parquet- up to 500MB
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Model Upload */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>
                  <Cpu size={13} className="inline mr-1" style={{ color: 'var(--warning)' }} />
                  Model <span className="text-xs font-normal">(optional)</span>
                </label>
                {dataOnly ? (
                  <div
                    className="upload-zone flex items-center justify-center"
                    style={{ opacity: 0.4, cursor: 'default', minHeight: 140 }}
                  >
                    <div className="text-xs" style={{ color: 'var(--placeholder)' }}>
                      Model upload disabled - data-only audit
                    </div>
                  </div>
                ) : useApi ? (
                  <div className="space-y-2 p-4" style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--muted)' }}>
                        <Globe size={11} className="inline mr-1" /> REST API Endpoint
                      </label>
                      <input className="input" placeholder="https://api.example.com/predict" />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--muted)' }}>
                        <Link2 size={11} className="inline mr-1" /> Bearer Token (optional)
                      </label>
                      <input className="input" type="password" placeholder="sk-..." />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`upload-zone flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden ${dragOver === 'model' ? 'drag-over scale-[1.02]' : ''}`}
                    style={{ 
                      minHeight: 180,
                      background: dragOver === 'model' ? 'var(--warning-dim)' : 'var(--surface-2)',
                      borderColor: dragOver === 'model' ? 'var(--warning)' : 'var(--border)'
                    }}
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => { e.preventDefault(); setDragOver('model'); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDrop(e, 'model')}
                    onClick={() => {
                      if (modelUploadProgress?.state === 'uploading') return;
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.pkl,.onnx,.joblib';
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) handleModelFile(f);
                      };
                      input.click();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (modelUploadProgress?.state === 'uploading') return;
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pkl,.onnx,.joblib';
                        input.onchange = (ev) => {
                          const f = (ev.target as HTMLInputElement).files?.[0];
                          if (f) handleModelFile(f);
                        };
                        input.click();
                      }
                    }}
                  >
                    {modelFile ? (
                      <div className="w-full px-6 flex flex-col items-center">
                        {modelUploadProgress?.state === 'uploading' ? (
                            <SkeletonUploadState title={`Uploading ${modelFile.name}`} progress={modelUploadProgress.progress} tone="warning" />
                        ) : modelUploadProgress?.state === 'error' ? (
                          <div className="text-center w-full max-w-sm">
                            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--danger-dim)' }}>
                              <XCircle size={24} style={{ color: 'var(--danger)' }} />
                            </div>
                            <div className="text-[15px] font-semibold" style={{ color: 'var(--fg)' }}>
                              Upload Failed
                            </div>
                            <div className="text-xs mt-1.5 p-2 rounded-md" style={{ color: 'var(--danger)', background: 'var(--danger-dim)' }}>
                              {modelUploadProgress.error || 'Failed to upload model file. Please try again.'}
                            </div>
                            <div className="mt-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>Click to try again</div>
                          </div>
                        ) : (
                          <div className="text-center w-full max-w-sm">
                            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--success-dim)' }}>
                              <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
                            </div>
                            <div className="text-[15px] font-semibold" style={{ color: 'var(--fg)' }}>
                              {modelFile.name}
                            </div>
                            <div className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted)' }}>
                              {(modelFile.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center pointer-events-none">
                        <Cpu size={32} style={{ color: 'var(--warning)', margin: '0 auto 12px' }} />
                        <div className="text-[15px] font-semibold mb-1" style={{ color: 'var(--fg)' }}>Upload your model</div>
                        <div className="text-xs font-medium" style={{ color: 'var(--placeholder)' }}>
                          .pkl, .onnx, .joblib- up to 500MB
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Toggles */}
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
                    <input
                      type="checkbox"
                      checked={dataOnly}
                      onChange={(e) => setDataOnly(e.target.checked)}
                      className="accent-teal"
                    />
                    Data-only audit
                  </label>
                  {!dataOnly && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
                      <input
                        type="checkbox"
                        checked={useApi}
                        onChange={(e) => setUseApi(e.target.checked)}
                        className="accent-orange"
                      />
                      Use Live API
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Preview table - from backend (or client-side CSV fallback) */}
            {(previewRows.length > 0 || clientPreview.length > 1) && (
              <div className="card" style={{ padding: 0 }}>
                <div className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  Dataset Preview - first 5 rows
                  {rowCount > 0 && (
                    <span className="ml-2 font-normal">({rowCount.toLocaleString()} total)</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        {previewRows.length > 0
                          ? columns.map((c) => <th key={c.name}>{c.name}</th>)
                          : clientPreview[0]?.map((h, i) => <th key={i}>{h}</th>)
                        }
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length > 0
                        ? previewRows.map((row, r) => (
                            <tr key={r}>
                              {columns.map((c) => (
                                <td key={c.name} className="text-xs" style={{ color: 'var(--muted)' }}>
                                  {row[c.name] ?? ''}
                                </td>
                              ))}
                            </tr>
                          ))
                        : clientPreview.slice(1, 6).map((row, r) => (
                            <tr key={r}>
                              {row.map((val, i) => (
                                <td key={i} className="text-xs" style={{ color: 'var(--muted)' }}>
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error banner */}
            {analyzeError && !analyzing && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ background: 'rgba(255, 22, 93, 0.08)', border: '1px solid rgba(255, 22, 93, 0.2)' }}>
                <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
                <span className="text-sm" style={{ color: 'var(--danger)' }}>{analyzeError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!isStep1Ready}
                style={{ opacity: isStep1Ready ? 1 : 0.4 }}
              >
                Continue <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 - Context Definition */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>
                  Audit Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  className="input"
                  placeholder="e.g., Q1 Hiring Pipeline Audit"
                  value={auditName}
                  onChange={(e) => setAuditName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>
                  Domain <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  className="select w-full"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="">Select domain...</option>
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>
                  Label Column <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  className="select w-full"
                  value={labelCol}
                  onChange={(e) => setLabelCol(e.target.value)}
                >
                  <option value="">Select the outcome column...</option>
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <span className="text-xs mt-1 block" style={{ color: 'var(--placeholder)' }}>
                  Which column is the outcome / decision? e.g., &apos;approved&apos;, &apos;hired&apos;
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>
                  Positive Outcome Value <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  className="input"
                  placeholder='e.g., 1, True, "approved"'
                  value={positiveLabel}
                  onChange={(e) => setPositiveLabel(e.target.value)}
                />
              </div>
            </div>

            {/* Protected Attributes - Progressive Disclosure */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Protected Attributes
                </label>
                {columns.length > 5 && (
                  <button 
                    className="text-xs font-semibold flex items-center gap-1 transition-colors"
                    style={{ color: 'var(--primary)' }}
                    onClick={() => setShowAllColumns(!showAllColumns)}
                  >
                    {showAllColumns ? 'Hide all columns' : `Show all ${columns.length} columns`}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(showAllColumns ? columns : columns.filter(c => c.auto_flagged || protectedCols.includes(c.name))).length > 0 ? (
                  (showAllColumns ? columns : columns.filter(c => c.auto_flagged || protectedCols.includes(c.name))).map((col) => (
                    <label
                      key={col.name}
                      className="focus-ring-wrapper flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm"
                      style={{
                        background: protectedCols.includes(col.name)
                          ? col.auto_flagged
                            ? 'var(--warning-dim)'
                            : 'var(--primary-dim)'
                          : 'var(--surface-2)',
                        border: `1px solid ${
                          protectedCols.includes(col.name)
                            ? col.auto_flagged
                              ? 'var(--warning)'
                              : 'var(--primary)'
                            : 'var(--border)'
                        }`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={protectedCols.includes(col.name)}
                        onChange={() => toggleProtected(col.name)}
                        className="accent-teal"
                      />
                      <span style={{ color: protectedCols.includes(col.name) ? 'var(--fg)' : 'var(--muted)', fontWeight: protectedCols.includes(col.name) ? 500 : 400 }}>
                        {col.name}
                      </span>
                      {col.auto_flagged && (
                        <span className="tooltip ml-auto">
                          <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />
                          <span className="tooltip-content text-xs">{col.flagged_reason}</span>
                        </span>
                      )}
                    </label>
                  ))
                ) : (
                  <div className="col-span-3 text-center py-4 text-xs font-medium" style={{ color: 'var(--placeholder)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                    No attributes auto-flagged. Click &apos;Show all columns&apos; to select manually.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-xs" style={{ color: 'var(--warning)' }}>
                <Info size={10} />
                Amber-highlighted columns were auto-detected as sensitive by VisionAI
              </div>
            </div>

            {/* Advanced Configuration Accordion */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <button 
                className="w-full flex items-center justify-between p-4 cursor-pointer text-sm font-semibold transition-colors"
                style={{ background: showAdvanced ? 'var(--surface-2)' : 'transparent', color: 'var(--fg)', border: 'none' }}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--primary-dim)' }}>
                    <PlusCircle size={14} style={{ color: 'var(--primary)', transform: showAdvanced ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </div>
                  Advanced Configuration
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  Optional
                </span>
              </button>
              
              {showAdvanced && (
                <div className="p-4 pt-2 space-y-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>
                      Jurisdiction
                    </label>
                    <select
                      className="select w-full"
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value)}
                    >
                      {JURISDICTIONS.map((j) => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                    <span className="text-xs mt-1 block" style={{ color: 'var(--placeholder)' }}>
                      Select the legal jurisdiction to filter relevant compliance frameworks
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>
                      Deployment Duration (for Historical Harm Calculator)
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={deployed}
                        onChange={(e) => setDeployed(e.target.checked)}
                        className="accent-teal"
                      />
                      This model has been deployed in production
                    </label>
                    {deployed && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div>
                          <label className="text-xs block mb-1" style={{ color: 'var(--placeholder)' }}>
                            Deployed since
                          </label>
                          <CustomDatePicker 
                            value={deployedSince}
                            onChange={setDeployedSince}
                          />
                        </div>
                        <div>
                          <label className="text-xs block mb-1" style={{ color: 'var(--placeholder)' }}>
                            Decisions per month
                          </label>
                          <input
                            type="number"
                            className="input bg-transparent"
                            placeholder="e.g., 3000"
                            value={decisionsPerMonth}
                            onChange={(e) => setDecisionsPerMonth(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                        Fairness Threshold (Disparate Impact Ratio)
                      </label>
                      <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
                        {threshold.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        min="0.6"
                        max="1.0"
                        step="0.01"
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div
                        className="absolute -top-5 text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{
                          left: `${((0.8 - 0.6) / 0.4) * 100}%`,
                          transform: 'translateX(-50%)',
                          background: 'var(--warning-dim)',
                          color: 'var(--warning)',
                        }}
                      >
                        0.80 legal
                      </div>
                    </div>
                    <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--placeholder)' }}>
                      <span>0.60</span>
                      <span>1.00</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button className="btn btn-outline" onClick={() => setStep(1)}>
                <ChevronLeft size={14} /> Back
              </button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>
                Continue <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 - Review & Launch */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                Audit Configuration Summary
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-sm">
                <span style={{ color: 'var(--muted)' }}>Name</span>
                <span>{auditName || 'Untitled Audit'}</span>
                <span style={{ color: 'var(--muted)' }}>Domain</span>
                <span>{domain || '-'}</span>
                <span style={{ color: 'var(--muted)' }}>Dataset</span>
                <span>{dataFile?.name || '-'} ({rowCount.toLocaleString()} rows)</span>
                <span style={{ color: 'var(--muted)' }}>Model</span>
                <span>{dataOnly ? 'Data-only' : modelFile?.name || (modelStoragePath ? 'Uploaded' : 'None')}</span>
                <span style={{ color: 'var(--muted)' }}>Label Column</span>
                <span>{labelCol || '-'}</span>
                <span style={{ color: 'var(--muted)' }}>Positive Value</span>
                <span>{positiveLabel || '-'}</span>
                <span style={{ color: 'var(--muted)' }}>Protected Attributes</span>
                <span>{protectedCols.join(', ') || '-'}</span>
                <span style={{ color: 'var(--muted)' }}>Jurisdiction</span>
                <span>{jurisdiction}</span>
                <span style={{ color: 'var(--muted)' }}>Fairness Threshold</span>
                <span>{threshold.toFixed(2)}</span>
                {deployed && (
                  <>
                    <span style={{ color: 'var(--muted)' }}>Deployed Since</span>
                    <span>{deployedSince || '-'}</span>
                    <span style={{ color: 'var(--muted)' }}>Monthly Decisions</span>
                    <span>{decisionsPerMonth || '-'}</span>
                  </>
                )}
              </div>
            </div>

            <div
              className="card flex items-center gap-3"
              style={{ background: 'rgba(62, 193, 211, 0.05)', borderColor: 'rgba(62, 193, 211, 0.2)' }}
            >
              <Info size={16} style={{ color: 'var(--primary)' }} />
              <div>
                <div className="text-sm font-medium">Estimated analysis time</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  ~{estimatedTime} seconds ({rowCount.toLocaleString()} rows × 10 analysis modules)
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button className="btn btn-outline" onClick={() => setStep(2)}>
                <ChevronLeft size={14} /> Back
              </button>
              <button
                className="btn btn-orange btn-lg"
                disabled={launching}
                style={{ opacity: launching ? 0.6 : 1 }}
                onClick={async () => {
                  if (!org) return;
                  setLaunching(true);
                  setLaunchError('');
                  try {
                    const result = await createAudit({
                      orgId: org.id,
                      name: auditName || 'Untitled Audit',
                      domain,
                      storagePath,
                      labelCol,
                      positiveLabel,
                      protectedCols,
                      threshold,
                      dataOnly,
                      modelStoragePath: modelStoragePath || undefined,
                      deployed,
                      deployedSince: deployedSince || undefined,
                      decisionsPerMonth: decisionsPerMonth ? parseInt(decisionsPerMonth) : undefined,
                      jurisdiction,
                    });
                    router.push(`/audit/${result.auditId}`);
                  } catch (err: any) {
                    setLaunchError(err?.message || 'Audit launch failed');
                    setLaunching(false);
                  }
                }}
              >
                {launching ? (
                  <span className="inline-flex items-center gap-2"><span className="skeleton" style={{ width: 14, height: 14, borderRadius: '50%' }} /> Analyzing...</span>
                ) : (
                  <><Rocket size={16} /> Launch Audit</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

