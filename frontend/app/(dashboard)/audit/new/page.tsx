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
} from 'lucide-react';
import { useState, useCallback } from 'react';

const DOMAINS = [
  'Hiring / Recruitment',
  'Financial Lending',
  'Healthcare / Medical Triage',
  'Criminal Justice / Risk Assessment',
  'Insurance Underwriting',
  'Education / Admissions',
  'Other',
];

// Mock columns after "uploading" a CSV
const MOCK_COLUMNS = [
  { name: 'applicant_id', dtype: 'int64', autoFlagged: false, reason: null },
  { name: 'gender', dtype: 'object', autoFlagged: true, reason: "Column name contains sensitive keyword 'gender'" },
  { name: 'race', dtype: 'object', autoFlagged: true, reason: "Column name contains sensitive keyword 'race'" },
  { name: 'age', dtype: 'int64', autoFlagged: true, reason: "Column name contains sensitive keyword 'age'" },
  { name: 'years_experience', dtype: 'float64', autoFlagged: false, reason: null },
  { name: 'education_level', dtype: 'object', autoFlagged: false, reason: null },
  { name: 'interview_score', dtype: 'float64', autoFlagged: false, reason: null },
  { name: 'zip_code', dtype: 'object', autoFlagged: true, reason: "Column name contains sensitive keyword 'zip'" },
  { name: 'college_tier', dtype: 'object', autoFlagged: false, reason: null },
  { name: 'hired', dtype: 'int64', autoFlagged: false, reason: null },
];

export default function NewAuditPage() {
  const [step, setStep] = useState(1);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [dataOnly, setDataOnly] = useState(false);
  const [useApi, setUseApi] = useState(false);
  const [dragOver, setDragOver] = useState<'data' | 'model' | null>(null);

  // Step 2 state
  const [auditName, setAuditName] = useState('');
  const [domain, setDomain] = useState('');
  const [labelCol, setLabelCol] = useState('');
  const [positiveLabel, setPositiveLabel] = useState('');
  const [protectedCols, setProtectedCols] = useState<string[]>(
    MOCK_COLUMNS.filter((c) => c.autoFlagged).map((c) => c.name)
  );
  const [deployed, setDeployed] = useState(false);
  const [threshold, setThreshold] = useState(0.8);

  const handleDrop = useCallback((e: React.DragEvent, type: 'data' | 'model') => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (type === 'data') setDataFile(file);
      else setModelFile(file);
    }
  }, []);

  const toggleProtected = (col: string) => {
    setProtectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

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

        {/* Step 1 — Upload */}
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
                      if (f) setDataFile(f);
                    };
                    input.click();
                  }}
                >
                  {dataFile ? (
                    <div>
                      <FileSpreadsheet size={28} style={{ color: '#06D6A0', margin: '0 auto 8px' }} />
                      <div className="text-sm font-semibold" style={{ color: '#06D6A0' }}>
                        {dataFile.name}
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#8892A5' }}>
                        {(dataFile.size / 1024).toFixed(1)} KB • 10,000 rows detected
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Upload size={28} style={{ color: '#3EC1D3', margin: '0 auto 8px' }} />
                      <div className="text-sm font-medium mb-1">Drag & drop your dataset</div>
                      <div className="text-xs" style={{ color: '#5A6478' }}>
                        .csv, .json, .parquet — up to 500MB
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
                      Model upload disabled — data-only audit
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
                        if (f) setModelFile(f);
                      };
                      input.click();
                    }}
                  >
                    {modelFile ? (
                      <div>
                        <Cpu size={28} style={{ color: '#06D6A0', margin: '0 auto 8px' }} />
                        <div className="text-sm font-semibold" style={{ color: '#06D6A0' }}>
                          {modelFile.name}
                        </div>
                        <div className="text-xs mt-1" style={{ color: '#8892A5' }}>
                          {(modelFile.size / 1024).toFixed(1)} KB
                        </div>
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

            {/* Preview table */}
            {dataFile && (
              <div className="card" style={{ padding: 0 }}>
                <div className="px-4 py-2.5 text-xs font-semibold" style={{ color: '#8892A5', borderBottom: '1px solid #2A3040' }}>
                  Dataset Preview — first 5 rows
                </div>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        {MOCK_COLUMNS.map((c) => (
                          <th key={c.name}>{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(5)].map((_, r) => (
                        <tr key={r}>
                          {MOCK_COLUMNS.map((c) => (
                            <td key={c.name} className="text-xs" style={{ color: '#8892A5' }}>
                              {c.dtype === 'int64'
                                ? Math.floor(Math.random() * 100)
                                : c.dtype === 'float64'
                                ? (Math.random() * 10).toFixed(1)
                                : ['A', 'B', 'C', 'D', 'E'][r]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!dataFile}
                style={{ opacity: dataFile ? 1 : 0.4 }}
              >
                Continue <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Context Definition */}
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
                  {MOCK_COLUMNS.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <span className="text-[10px] mt-1 block" style={{ color: '#5A6478' }}>
                  e.g., &apos;approved&apos;, &apos;hired&apos;, &apos;high_risk&apos;
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

            {/* Protected Attributes */}
            <div className="card">
              <label className="text-xs font-semibold mb-2 block" style={{ color: '#8892A5' }}>
                Protected Attributes
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MOCK_COLUMNS.map((col) => (
                  <label
                    key={col.name}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm"
                    style={{
                      background: protectedCols.includes(col.name)
                        ? col.autoFlagged
                          ? 'rgba(255, 154, 0, 0.08)'
                          : 'rgba(62, 193, 211, 0.08)'
                        : '#1A1F2B',
                      border: `1px solid ${
                        protectedCols.includes(col.name)
                          ? col.autoFlagged
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
                    {col.autoFlagged && (
                      <span className="tooltip ml-auto">
                        <AlertTriangle size={12} style={{ color: '#FF9A00' }} />
                        <span className="tooltip-content text-[10px]">{col.reason}</span>
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
                    <input type="date" className="input" />
                  </div>
                  <div>
                    <label className="text-[11px] block mb-1" style={{ color: '#5A6478' }}>
                      Decisions per month
                    </label>
                    <input type="number" className="input" placeholder="e.g., 3000" />
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

        {/* Step 3 — Review & Launch */}
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
                <span>{domain || '—'}</span>
                <span style={{ color: '#8892A5' }}>Dataset</span>
                <span>{dataFile?.name || '—'}</span>
                <span style={{ color: '#8892A5' }}>Model</span>
                <span>{dataOnly ? 'Data-only' : modelFile?.name || 'None'}</span>
                <span style={{ color: '#8892A5' }}>Label Column</span>
                <span>{labelCol || '—'}</span>
                <span style={{ color: '#8892A5' }}>Positive Value</span>
                <span>{positiveLabel || '—'}</span>
                <span style={{ color: '#8892A5' }}>Protected Attributes</span>
                <span>{protectedCols.join(', ') || '—'}</span>
                <span style={{ color: '#8892A5' }}>Fairness Threshold</span>
                <span>{threshold.toFixed(2)}</span>
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
                  ~30 seconds (10,000 rows × 10 analysis modules)
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>
                <ChevronLeft size={14} /> Back
              </button>
              <button
                className="btn btn-orange btn-lg"
                onClick={() => (window.location.href = '/audit/aud-001')}
              >
                <Rocket size={16} /> Launch Audit
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
