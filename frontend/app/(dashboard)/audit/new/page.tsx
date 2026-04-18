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
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
} from 'lucide-react';
import { useState, useCallback } from 'react';
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

      <div className="flex-1 p-4 animate-fade-in">
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
              className="text-[11px] font-medium"
              style={{ color: step === i + 1 ? '#3EC1D3' : '#5A6478' }}
            >
              {l}
            </span>
          ))}
        </div>

        {/* Step 1 - Upload */}
        {step === 1 && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              {/* Dataset Upload */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: '#8892A5' }}>
                  <FileSpreadsheet size={13} className="inline mr-1" style={{ color: '#3EC1D3' }} />
                  Dataset <span style={{ color: '#FF165D' }}>*</span>
                </label>
                <div
                  className={`upload-zone ${dragOver === 'data' ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver('data'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, 'data')}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv,.json,.parquet';
                    input.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleDataFile(f);
                    };
                    input.click();
                  }}
                >
                  {dataFile ? (
                    <div>
                      {uploadProgress?.state === 'uploading' ? (
                        <>
                          <Loader2 size={28} className="mx-auto mb-2 animate-spin" style={{ color: '#3EC1D3' }} />
                          <div className="text-sm font-medium" style={{ color: '#3EC1D3' }}>
                            Uploading... {uploadProgress.progress}%
                          </div>
                          <div className="w-48 mx-auto mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#2A3040' }}>
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress.progress}%`, background: '#3EC1D3' }}
                            />
                          </div>
                        </>
                      ) : analyzing ? (
                        <>
                          <Loader2 size={28} className="mx-auto mb-2 animate-spin" style={{ color: '#FF9A00' }} />
                          <div className="text-sm font-medium" style={{ color: '#FF9A00' }}>
                            Analyzing columns...
                          </div>
                        </>
                      ) : columns.length > 0 ? (
                        <>
                          <CheckCircle2 size={28} style={{ color: '#06D6A0', margin: '0 auto 8px' }} />
                          <div className="text-sm font-semibold" style={{ color: '#06D6A0' }}>
                            {dataFile.name}
                          </div>
                          <div className="text-xs mt-1" style={{ color: '#8892A5' }}>
                            {(dataFile.size / 1024).toFixed(1)} KB • {rowCount.toLocaleString()} rows • {columns.length} columns
                          </div>
                        </>
                      ) : (
                        <>
                          <XCircle size={28} style={{ color: '#FF165D', margin: '0 auto 8px' }} />
                          <div className="text-sm font-medium" style={{ color: '#FF165D' }}>
                            {dataFile.name}
                          </div>
                          <div className="text-xs mt-1" style={{ color: '#FF165D' }}>
                            {analyzeError || 'Upload failed'}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div>
                      <Upload size={28} style={{ color: '#3EC1D3', margin: '0 auto 8px' }} />
                      <div className="text-sm font-medium mb-1">Drag & drop your dataset</div>
                      <div className="text-xs" style={{ color: '#5A6478' }}>
                        .csv, .json, .parquet - up to 500MB
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Model Upload */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: '#8892A5' }}>
                  <Cpu size={13} className="inline mr-1" style={{ color: '#FF9A00' }} />
                  Model <span className="text-xs font-normal">(optional)</span>
                </label>
                {dataOnly ? (
                  <div
                    className="upload-zone flex items-center justify-center"
                    style={{ opacity: 0.4, cursor: 'default', minHeight: 140 }}
                  >
                    <div className="text-xs" style={{ color: '#5A6478' }}>
                      Model upload disabled - data-only audit
                    </div>
                  </div>
                ) : useApi ? (
                  <div className="space-y-2 p-4" style={{ background: '#141820', borderRadius: 12, border: '1px solid #2A3040' }}>
                    <div>
                      <label className="text-[11px] block mb-1" style={{ color: '#8892A5' }}>
                        <Globe size={11} className="inline mr-1" /> REST API Endpoint
                      </label>
                      <input className="input" placeholder="https://api.example.com/predict" />
                    </div>
                    <div>
                      <label className="text-[11px] block mb-1" style={{ color: '#8892A5' }}>
                        <Link2 size={11} className="inline mr-1" /> Bearer Token (optional)
                      </label>
                      <input className="input" type="password" placeholder="sk-..." />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`upload-zone ${dragOver === 'model' ? 'drag-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver('model'); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDrop(e, 'model')}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.pkl,.onnx,.joblib';
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) handleModelFile(f);
                      };
                      input.click();
                    }}
                  >
                    {modelFile ? (
                      <div>
                        {modelUploadProgress?.state === 'uploading' ? (
                          <>
                            <Loader2 size={28} className="mx-auto mb-2 animate-spin" style={{ color: '#FF9A00' }} />
                            <div className="text-sm font-medium" style={{ color: '#FF9A00' }}>
                              Uploading... {modelUploadProgress.progress}%
                            </div>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={28} style={{ color: '#06D6A0', margin: '0 auto 8px' }} />
                            <div className="text-sm font-semibold" style={{ color: '#06D6A0' }}>
                              {modelFile.name}
                            </div>
                            <div className="text-xs mt-1" style={{ color: '#8892A5' }}>
                              {(modelFile.size / 1024).toFixed(1)} KB
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div>
                        <Cpu size={28} style={{ color: '#FF9A00', margin: '0 auto 8px' }} />
                        <div className="text-sm font-medium mb-1">Upload your model</div>
                        <div className="text-xs" style={{ color: '#5A6478' }}>
                          .pkl, .onnx, .joblib
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Toggles */}
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: '#8892A5' }}>
                    <input
                      type="checkbox"
                      checked={dataOnly}
                      onChange={(e) => setDataOnly(e.target.checked)}
                      className="accent-teal"
                    />
                    Data-only audit
                  </label>
                  {!dataOnly && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: '#8892A5' }}>
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
                <div className="px-4 py-2.5 text-xs font-semibold" style={{ color: '#8892A5', borderBottom: '1px solid #2A3040' }}>
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
                                <td key={c.name} className="text-xs" style={{ color: '#8892A5' }}>
                                  {row[c.name] ?? ''}
                                </td>
                              ))}
                            </tr>
                          ))
                        : clientPreview.slice(1, 6).map((row, r) => (
                            <tr key={r}>
                              {row.map((val, i) => (
                                <td key={i} className="text-xs" style={{ color: '#8892A5' }}>
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
                <AlertTriangle size={16} style={{ color: '#FF165D' }} />
                <span className="text-sm" style={{ color: '#FF165D' }}>{analyzeError}</span>
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
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#8892A5' }}>
                  Audit Name <span style={{ color: '#FF165D' }}>*</span>
                </label>
                <input
                  className="input"
                  placeholder="e.g., Q1 Hiring Pipeline Audit"
                  value={auditName}
                  onChange={(e) => setAuditName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#8892A5' }}>
                  Domain <span style={{ color: '#FF165D' }}>*</span>
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

            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#8892A5' }}>
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
              <span className="text-[10px] mt-1 block" style={{ color: '#5A6478' }}>
                Select the legal jurisdiction to filter relevant compliance frameworks
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#8892A5' }}>
                  Label Column <span style={{ color: '#FF165D' }}>*</span>
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
                <span className="text-[10px] mt-1 block" style={{ color: '#5A6478' }}>
                  Which column is the outcome / decision? e.g., &apos;approved&apos;, &apos;hired&apos;
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#8892A5' }}>
                  Positive Outcome Value <span style={{ color: '#FF165D' }}>*</span>
                </label>
                <input
                  className="input"
                  placeholder='e.g., 1, True, "approved"'
                  value={positiveLabel}
                  onChange={(e) => setPositiveLabel(e.target.value)}
                />
              </div>
            </div>

            {/* Protected Attributes - from real schema */}
            <div className="card">
              <label className="text-xs font-semibold mb-2 block" style={{ color: '#8892A5' }}>
                Protected Attributes
              </label>
              <div className="grid grid-cols-3 gap-2">
                {columns.map((col) => (
                  <label
                    key={col.name}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm"
                    style={{
                      background: protectedCols.includes(col.name)
                        ? col.auto_flagged
                          ? 'rgba(255, 154, 0, 0.08)'
                          : 'rgba(62, 193, 211, 0.08)'
                        : '#1A1F2B',
                      border: `1px solid ${
                        protectedCols.includes(col.name)
                          ? col.auto_flagged
                            ? 'rgba(255, 154, 0, 0.3)'
                            : 'rgba(62, 193, 211, 0.3)'
                          : '#2A3040'
                      }`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={protectedCols.includes(col.name)}
                      onChange={() => toggleProtected(col.name)}
                      className="accent-teal"
                    />
                    <span style={{ color: protectedCols.includes(col.name) ? '#E8EAED' : '#8892A5' }}>
                      {col.name}
                    </span>
                    {col.auto_flagged && (
                      <span className="tooltip ml-auto">
                        <AlertTriangle size={12} style={{ color: '#FF9A00' }} />
                        <span className="tooltip-content text-[10px]">{col.flagged_reason}</span>
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px]" style={{ color: '#FF9A00' }}>
                <Info size={10} />
                Amber-highlighted columns were auto-detected as sensitive by VisionAI
              </div>
            </div>

            {/* Deployment */}
            <div className="card">
              <label className="text-xs font-semibold mb-2 block" style={{ color: '#8892A5' }}>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] block mb-1" style={{ color: '#5A6478' }}>
                      Deployed since
                    </label>
                    <CustomDatePicker 
                      value={deployedSince}
                      onChange={setDeployedSince}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] block mb-1" style={{ color: '#5A6478' }}>
                      Decisions per month
                    </label>
                    <input
                      type="number"
                      className="input"
                      placeholder="e.g., 3000"
                      value={decisionsPerMonth}
                      onChange={(e) => setDecisionsPerMonth(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Fairness Threshold */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: '#8892A5' }}>
                  Fairness Threshold (Disparate Impact Ratio)
                </label>
                <span className="text-sm font-bold" style={{ color: '#3EC1D3' }}>
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
                    background: 'rgba(255, 154, 0, 0.15)',
                    color: '#FF9A00',
                  }}
                >
                  0.80 legal
                </div>
              </div>
              <div className="flex justify-between text-[10px] mt-1" style={{ color: '#5A6478' }}>
                <span>0.60</span>
                <span>1.00</span>
              </div>
            </div>

            <div className="flex justify-between">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>
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
              <h3 className="text-sm font-semibold" style={{ color: '#3EC1D3' }}>
                Audit Configuration Summary
              </h3>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span style={{ color: '#8892A5' }}>Name</span>
                <span>{auditName || 'Untitled Audit'}</span>
                <span style={{ color: '#8892A5' }}>Domain</span>
                <span>{domain || '-'}</span>
                <span style={{ color: '#8892A5' }}>Dataset</span>
                <span>{dataFile?.name || '-'} ({rowCount.toLocaleString()} rows)</span>
                <span style={{ color: '#8892A5' }}>Model</span>
                <span>{dataOnly ? 'Data-only' : modelFile?.name || (modelStoragePath ? 'Uploaded' : 'None')}</span>
                <span style={{ color: '#8892A5' }}>Label Column</span>
                <span>{labelCol || '-'}</span>
                <span style={{ color: '#8892A5' }}>Positive Value</span>
                <span>{positiveLabel || '-'}</span>
                <span style={{ color: '#8892A5' }}>Protected Attributes</span>
                <span>{protectedCols.join(', ') || '-'}</span>
                <span style={{ color: '#8892A5' }}>Jurisdiction</span>
                <span>{jurisdiction}</span>
                <span style={{ color: '#8892A5' }}>Fairness Threshold</span>
                <span>{threshold.toFixed(2)}</span>
                {deployed && (
                  <>
                    <span style={{ color: '#8892A5' }}>Deployed Since</span>
                    <span>{deployedSince || '-'}</span>
                    <span style={{ color: '#8892A5' }}>Monthly Decisions</span>
                    <span>{decisionsPerMonth || '-'}</span>
                  </>
                )}
              </div>
            </div>

            <div
              className="card flex items-center gap-3"
              style={{ background: 'rgba(62, 193, 211, 0.05)', borderColor: 'rgba(62, 193, 211, 0.2)' }}
            >
              <Info size={16} style={{ color: '#3EC1D3' }} />
              <div>
                <div className="text-sm font-medium">Estimated analysis time</div>
                <div className="text-xs" style={{ color: '#8892A5' }}>
                  ~{estimatedTime} seconds ({rowCount.toLocaleString()} rows × 10 analysis modules)
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>
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
                  <><Loader2 size={16} className="animate-spin" /> Analyzing...</>
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
