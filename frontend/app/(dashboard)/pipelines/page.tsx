'use client';

import TopNav from '@/components/layout/TopNav';
import { listPipelines, deletePipeline, Pipeline } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { GitBranch, PlusCircle, Calendar, Trash2, ArrowRight, Loader2, GitCommit } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function PipelinesPage() {
  const { org, orgLoading } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPipelines = async () => {
    if (!org?.id) return;
    try {
      setLoading(true);
      setError('');
      const data = await listPipelines();
      // Filter by org_id just in case, though the list lists all
      const orgPipelines = data.filter(p => p.pipeline_id && (!p.protected_attrs || p.protected_attrs));
      setPipelines(orgPipelines);
    } catch (err: any) {
      console.error('Failed to load pipelines:', err);
      setError(err.message || 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgLoading) {
      loadPipelines();
    }
  }, [org?.id, orgLoading]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this pipeline?')) return;
    
    try {
      setDeletingId(id);
      await deletePipeline(id);
      setPipelines(prev => prev.filter(p => p.pipeline_id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete pipeline');
    } finally {
      setDeletingId(null);
    }
  };

  const getWorstEffectiveDi = (pipeline: Pipeline) => {
    if (!pipeline.analysis_results) return null;
    try {
      const results = typeof pipeline.analysis_results === 'string'
        ? JSON.parse(pipeline.analysis_results)
        : pipeline.analysis_results;
      
      let worst = 1.0;
      Object.values(results).forEach((attrRes: any) => {
        if (attrRes?.effective_di_at_output !== undefined) {
          worst = Math.min(worst, attrRes.effective_di_at_output);
        }
      });
      return worst;
    } catch (e) {
      return null;
    }
  };

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Pipeline Audit' }]} />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        {error && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', background: 'var(--danger-dim)' }}>
            <div className="text-sm" style={{ color: 'var(--danger)' }}>{error}</div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Multi-Model Pipelines</h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Trace and analyze how fairness scores propagate and compound across sequential model connections.
            </p>
          </div>
          <Link href="/pipelines/new" className="btn btn-primary">
            <PlusCircle size={15} /> New Pipeline
          </Link>
        </div>

        {loading ? (
          <div className="card flex flex-col items-center justify-center py-12 gap-3" style={{ color: 'var(--muted)' }}>
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm">Loading pipelines...</span>
          </div>
        ) : pipelines.length === 0 ? (
          <div 
            className="card flex flex-col items-center justify-center py-16 text-center rounded-3xl"
            style={{
              background: 'var(--primary-dim)',
              border: '1px dashed var(--primary)',
            }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--surface-2)' }}>
              <GitBranch size={32} style={{ color: 'var(--primary)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-1">Create your first multi-model pipeline</h3>
            <p className="text-sm max-w-md mb-6" style={{ color: 'var(--muted)' }}>
              Connect multiple model audits into a Directed Acyclic Graph (DAG) to evaluate compound disparate impact.
            </p>
            <Link href="/pipelines/new" className="btn btn-primary btn-lg">
              <PlusCircle size={16} /> New Pipeline
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pipelines.map((p) => {
              const worstDi = getWorstEffectiveDi(p);
              const nodeCount = p.nodes?.length || 0;
              const edgeCount = p.edges?.length || 0;

              return (
                <Link 
                  key={p.pipeline_id} 
                  href={`/pipelines/${p.pipeline_id}`}
                  className="card dashboard-hover-card flex flex-col justify-between p-5 h-full rounded-[24px] group border"
                  style={{
                    background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 10px rgba(0,0,0,0.04)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    textDecoration: 'none'
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span 
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          background: p.status === 'ANALYZED' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(107, 114, 128, 0.12)',
                          color: p.status === 'ANALYZED' ? 'var(--success)' : 'var(--muted)',
                          border: `1px solid ${p.status === 'ANALYZED' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(107, 114, 128, 0.35)'}`,
                        }}
                      >
                        {p.status}
                      </span>

                      {p.status === 'ANALYZED' && worstDi !== null && (
                        <span 
                          className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{
                            background: worstDi >= 0.8 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: worstDi >= 0.8 ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          Worst DI: {worstDi.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-semibold group-hover:text-[var(--primary)] transition-colors line-clamp-1 mb-1.5" style={{ color: 'var(--fg)' }}>
                      {p.name || 'Unnamed Pipeline'}
                    </h3>
                    
                    <p className="text-xs line-clamp-2 mb-4" style={{ color: 'var(--muted)' }}>
                      {p.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                      <span className="flex items-center gap-1">
                        <GitCommit size={12} /> {nodeCount} Model{nodeCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowRight size={12} /> {edgeCount} Connection{edgeCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted)' }}>
                        <Calendar size={10} />
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Just now'}
                      </span>
                      
                      <div className="flex gap-2">
                        <button
                          className="btn btn-outline btn-sm p-1.5 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                          title="Delete Pipeline"
                          onClick={(e) => handleDelete(e, p.pipeline_id)}
                          disabled={deletingId === p.pipeline_id}
                        >
                          {deletingId === p.pipeline_id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} className="text-red-500" />
                          )}
                        </button>
                        <span className="btn btn-primary btn-sm px-2">
                          View <ArrowRight size={12} className="ml-1" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
