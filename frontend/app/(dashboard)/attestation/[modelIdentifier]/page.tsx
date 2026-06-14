'use client';

import { useEffect, useState, use } from 'react';
import { useAuth } from '@/lib/auth-context';
import TopNav from '@/components/layout/TopNav';
import {
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Calendar,
  Layers,
  Link as LinkIcon,
  CheckCircle,
  FileText,
  Search,
  RefreshCw
} from 'lucide-react';

interface AttestationRecord {
  audit_id: string;
  org_id: string;
  model_identifier: string;
  version: number;
  fairness_score: number;
  letter_grade: string;
  issued_at: string;
  hash: string;
  previous_hash: string;
  interventions_applied: string[];
  di_worst: number;
}

interface AttestationChain {
  exists: boolean;
  org_id?: string;
  model_identifier?: string;
  latest_hash?: string;
  latest_score?: number;
  version?: number;
  history?: AttestationRecord[];
  updated_at?: string;
}

export default function AttestationChainPage({ params }: { params: Promise<{ modelIdentifier: string }> }) {
  const resolvedParams = use(params);
  const modelIdentifier = resolvedParams.modelIdentifier;

  const { org } = useAuth();
  const [chain, setChain] = useState<AttestationChain | null>(null);
  const [loading, setLoading] = useState(true);

  // Selection / Search state
  const [searchModel, setSearchModel] = useState(modelIdentifier);

  // Verification states
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    chain_length?: number;
    oldest_audit?: string;
    reason?: string;
  } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    if (org?.id && modelIdentifier) {
      loadAttestationChain();
    }
  }, [org, modelIdentifier]);

  async function loadAttestationChain() {
    setLoading(true);
    setVerificationResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/attestation/${org?.id || 'default'}/${modelIdentifier}`);
      if (res.ok) {
        const data = await res.json();
        setChain(data);
      } else {
        setChain({ exists: false });
      }
    } catch (err) {
      console.error('Failed to fetch attestation chain:', err);
      setChain({ exists: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyChain() {
    if (!org?.id || !modelIdentifier) return;
    setVerifying(true);
    setVerificationResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/attestation/${org.id}/${modelIdentifier}/verify`);
      if (res.ok) {
        const data = await res.json();
        setVerificationResult(data);
      } else {
        setVerificationResult({
          valid: false,
          reason: 'Verification server returned an error.'
        } as any);
      }
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        reason: err.message || 'Failed to contact verification API.'
      });
    } finally {
      setVerifying(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchModel.trim()) {
      window.location.href = `/attestation/${encodeURIComponent(searchModel.trim())}`;
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 60) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <>
      <TopNav breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'Attestation Chain' }
      ]} />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">

        {/* Search & Selection Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="page-title mb-1 flex items-center gap-2">
              <ShieldCheck size={24} style={{ color: 'var(--primary)' }} />
              Bias Attestation Ledger
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Verifiable cryptographic lineage of model audits across retrains.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search
                className="absolute"
                style={{
                  color: 'var(--placeholder)',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none'
                }}
                size={14}
              />
              <input
                className="input text-sm py-2"
                style={{ paddingLeft: '2.25rem' }}
                placeholder="Model Identifier..."
                value={searchModel}
                onChange={(e) => setSearchModel(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
              Load Chain
            </button>
          </form>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RefreshCw className="animate-spin" size={28} style={{ color: 'var(--primary)' }} />
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Retrieving attestation ledger...</span>
          </div>
        ) : !chain || !chain.exists ? (
          /* Empty/No Chain State */
          <div className="card text-center py-16 space-y-3 max-w-xl mx-auto">
            <Layers size={40} className="mx-auto opacity-30" style={{ color: 'var(--primary)' }} />
            <h3 className="text-lg font-bold">No Attestation Chain Found</h3>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
              No audits have been executed yet under the model identifier <code className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-2)' }}>{modelIdentifier}</code>.
            </p>
            <div className="text-xs border p-3.5 rounded-2xl max-w-md mx-auto text-left space-y-1" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="font-semibold" style={{ color: 'var(--fg)' }}>How do I link models?</div>
              <p style={{ color: 'var(--muted)' }}>
                When creating a new audit in Step 2 of the wizard, specify this identifier in the <strong>Model Identifier</strong> field. VisionAI will automatically chain the results together.
              </p>
            </div>
          </div>
        ) : (
          /* Main Ledger Content */
          <div className="space-y-6">

            {/* Top Bar Summary Card */}
            <div className="card grid grid-cols-1 md:grid-cols-4 gap-4 items-center justify-between">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase block" style={{ color: 'var(--placeholder)' }}>
                  Model identifier
                </span>
                <span className="text-lg font-bold flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--fg)' }}>
                  <Cpu size={16} style={{ color: 'var(--accent)' }} />
                  {chain.model_identifier}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase block" style={{ color: 'var(--placeholder)' }}>
                  Chain Length
                </span>
                <span className="text-lg font-bold mt-0.5" style={{ color: 'var(--fg)' }}>
                  {chain.history?.length || 0} Audits
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase block" style={{ color: 'var(--placeholder)' }}>
                  Latest Block Hash
                </span>
                <span className="text-sm font-mono font-medium block truncate mt-0.5" style={{ color: 'var(--muted)' }} title={chain.latest_hash}>
                  {chain.latest_hash ? `${chain.latest_hash.substring(0, 8)}...` : 'None'}
                </span>
              </div>
              <div className="text-right">
                <button
                  onClick={handleVerifyChain}
                  disabled={verifying}
                  className="btn btn-outline text-xs py-2 w-full md:w-auto flex items-center justify-center gap-1.5"
                >
                  {verifying ? (
                    <>
                      <RefreshCw className="animate-spin" size={13} /> Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={13} /> Verify Integrity
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Verification Status Banner */}
            {verificationResult && (
              <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 animate-slide-up`}
                style={{
                  background: verificationResult.valid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  borderColor: verificationResult.valid ? 'var(--pass)' : 'var(--error)'
                }}>
                <div className="flex items-start gap-3">
                  {verificationResult.valid ? (
                    <ShieldCheck size={24} style={{ color: 'var(--pass)' }} className="mt-0.5 shrink-0" />
                  ) : (
                    <ShieldAlert size={24} style={{ color: 'var(--error)' }} className="mt-0.5 shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>
                      {verificationResult.valid ? 'Chain Valid' : 'Chain Compromised'}
                    </h4>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {verificationResult.valid
                        ? `Cryptographic signature matches parent block across all ${verificationResult.chain_length} versions. Oldest audit issued on ${new Date(verificationResult.oldest_audit || '').toLocaleDateString()}.`
                        : `Cryptographic audit links are broken: ${verificationResult.reason}`
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Cryptographic Timeline */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Layers size={15} style={{ color: 'var(--primary)' }} />
                <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--placeholder)' }}>
                  Block Timeline (Newest First)
                </span>
              </div>

              <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px]"
                style={{ ['--tw-before-bg' as any]: 'var(--border)' } as any}>

                {chain.history?.slice().reverse().map((record, index) => {
                  const isFirst = index === 0;
                  const isGenesis = record.previous_hash === 'GENESIS';

                  return (
                    <div key={record.hash} className="relative group animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>

                      {/* Timeline dot */}
                      <span className="absolute -left-[23px] top-1.5 w-[14px] h-[14px] rounded-full border-2 bg-white flex items-center justify-center transition-colors group-hover:border-[var(--primary)]"
                        style={{
                          borderColor: isFirst ? 'var(--primary)' : 'var(--border-light)',
                          boxShadow: isFirst ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'none'
                        }}
                      />

                      {/* Card item */}
                      <div className="card space-y-3 border hover:border-[color-mix(in_srgb,var(--primary)_30%,transparent)] transition-all">

                        {/* Header details */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--fg)' }}>
                              v{record.version}
                            </span>
                            <a href={`/audit/${record.audit_id}`} className="text-xs font-semibold hover:underline block" style={{ color: 'var(--primary)' }}>
                              Audit #{record.audit_id.substring(0, 8)}
                            </a>
                            {isGenesis && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Genesis Block
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                            <Calendar size={12} />
                            <span>{new Date(record.issued_at).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Metric grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--placeholder)' }}>Fairness Score</span>
                            <span className="text-base font-black flex items-baseline gap-1 mt-0.5">
                              <span className={record.fairness_score >= 80 ? 'text-emerald-500' : record.fairness_score >= 60 ? 'text-amber-500' : 'text-rose-500'}>
                                {record.fairness_score.toFixed(0)}
                              </span>
                              <span className="text-xs font-bold text-gray-400">/100</span>
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--placeholder)' }}>Grade</span>
                            <span className="text-base font-bold block mt-0.5" style={{ color: 'var(--fg)' }}>
                              {record.letter_grade}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--placeholder)' }}>Worst DI Ratio</span>
                            <span className="text-base font-mono block mt-0.5" style={{ color: record.di_worst < 0.8 ? 'var(--error)' : 'var(--pass)' }}>
                              {record.di_worst.toFixed(3)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--placeholder)' }}>Hash Reference</span>
                            <span className="text-xs font-mono block truncate mt-1" style={{ color: 'var(--muted)' }} title={record.hash}>
                              {record.hash.substring(0, 10)}...
                            </span>
                          </div>
                        </div>

                        {/* Cryptographic link hashes */}
                        <div className="p-2.5 rounded-xl text-[10px] font-mono grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-1.5 truncate">
                            <LinkIcon size={10} style={{ color: 'var(--muted)' }} />
                            <span style={{ color: 'var(--placeholder)' }}>Parent:</span>
                            <span style={{ color: isGenesis ? 'var(--pass)' : 'var(--muted)' }} className="truncate">
                              {record.previous_hash === 'GENESIS' ? 'GENESIS' : record.previous_hash}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate">
                            <LinkIcon size={10} style={{ color: 'var(--primary)' }} />
                            <span style={{ color: 'var(--placeholder)' }}>Self:</span>
                            <span style={{ color: 'var(--fg)' }} className="truncate">{record.hash}</span>
                          </div>
                        </div>

                        {/* Interventions Applied */}
                        {record.interventions_applied && record.interventions_applied.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--placeholder)' }}>Interventions Applied</span>
                            <div className="flex flex-wrap gap-1.5">
                              {record.interventions_applied.map((i) => (
                                <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
                                  {i}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px]" style={{ color: 'var(--placeholder)' }}>
                            No remediation interventions were active during this execution run.
                          </div>
                        )}

                      </div>
                    </div>
                  );
                })}

              </div>
            </div>

          </div>
        )}

      </div>
    </>
  );
}
