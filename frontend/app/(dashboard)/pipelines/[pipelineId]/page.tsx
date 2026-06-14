'use client';

import TopNav from '@/components/layout/TopNav';
import { getPipeline, getAudit, runPipelineAnalysis, Pipeline } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AuditNode } from '@/components/pipeline/AuditNode';
import { 
  GitBranch, ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck, 
  TrendingUp, Activity, Info, Loader2, ArrowRight 
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  ReactFlowProvider
} from 'reactflow';

import 'reactflow/dist/style.css';

const nodeTypes = {
  auditNode: AuditNode,
};

function PipelineDetails() {
  const params = useParams();
  const router = useRouter();
  const { org, orgLoading } = useAuth();
  const pipelineId = params.pipelineId as string;

  // State
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [auditDetails, setAuditDetails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');

  const loadPipelineData = async () => {
    try {
      setLoading(true);
      setError('');
      const pipe = await getPipeline(pipelineId);
      setPipeline(pipe);

      // Load full audit info for each node to get names, scores, domain
      const details: Record<string, any> = {};
      for (const node of pipe.nodes) {
        if (!details[node.audit_id]) {
          try {
            const audit = await getAudit(node.audit_id);
            details[node.audit_id] = audit;
          } catch (e) {
            console.error('Failed to load audit info:', node.audit_id, e);
          }
        }
      }
      setAuditDetails(details);

      // Set default selected attribute
      if (pipe.protected_attrs && pipe.protected_attrs.length > 0) {
        setSelectedAttribute(pipe.protected_attrs[0]);
      } else if (pipe.analysis_results) {
        const results = JSON.parse(pipe.analysis_results);
        const attrs = Object.keys(results);
        if (attrs.length > 0) setSelectedAttribute(attrs[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load pipeline data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgLoading && pipelineId) {
      loadPipelineData();
    }
  }, [pipelineId, orgLoading]);

  // Run/Re-run analysis
  const handleRecalculate = async () => {
    try {
      setAnalyzing(true);
      setError('');
      await runPipelineAnalysis(pipelineId);
      await loadPipelineData();
    } catch (err: any) {
      setError(err.message || 'Failed to recalculate propagation');
    } finally {
      setAnalyzing(false);
    }
  };

  // Parse results
  const parsedResults = useMemo(() => {
    if (!pipeline?.analysis_results) return null;
    try {
      return typeof pipeline.analysis_results === 'string'
        ? JSON.parse(pipeline.analysis_results)
        : pipeline.analysis_results;
    } catch (e) {
      console.error('Failed to parse analysis results', e);
      return null;
    }
  }, [pipeline?.analysis_results]);

  // Build React Flow nodes list dynamically based on selected attribute
  const flowNodes = useMemo(() => {
    if (!pipeline) return [];
    
    return pipeline.nodes.map(node => {
      const audit = auditDetails[node.audit_id] || {};
      const score = audit.fairnessScore ?? 0;
      const grade = audit.letterGrade ?? 'N/A';
      const domain = audit.domain || 'Lending';

      // Extract node scores if available
      let nodeDi = undefined;
      let effectiveDi = undefined;
      if (parsedResults && selectedAttribute && parsedResults[selectedAttribute]) {
        const nodeScores = parsedResults[selectedAttribute].node_scores || {};
        const scoreInfo = nodeScores[node.node_id];
        if (scoreInfo) {
          nodeDi = scoreInfo.node_di;
          effectiveDi = scoreInfo.effective_di;
        }
      }

      const flowNode: Node = {
        id: node.node_id,
        type: 'auditNode',
        position: { x: node.position_x, y: node.position_y },
        data: {
          auditId: node.audit_id,
          auditName: node.label,
          domain,
          fairnessScore: score,
          letterGrade: grade,
          isAnalyzed: !!parsedResults,
          localDi: nodeDi,
          effectiveDi,
        },
      };
      return flowNode;
    });
  }, [pipeline, auditDetails, parsedResults, selectedAttribute]);

  // Build React Flow edges
  const flowEdges = useMemo(() => {
    if (!pipeline) return [];
    return pipeline.edges.map(edge => ({
      id: `e-${edge.from_node}-${edge.to_node}`,
      source: edge.from_node,
      target: edge.to_node,
      animated: true,
      label: edge.output_feature && edge.input_feature ? `${edge.output_feature} → ${edge.input_feature}` : undefined,
      labelStyle: { fill: 'var(--muted)', fontSize: 10, fontWeight: 500 },
      style: { stroke: 'var(--primary)', strokeWidth: 2 },
    }));
  }, [pipeline]);

  // Worst DI calculation
  const worstEffectiveDi = useMemo(() => {
    if (!parsedResults) return null;
    let worst = 1.0;
    Object.values(parsedResults).forEach((attrRes: any) => {
      if (attrRes?.effective_di_at_output !== undefined) {
        worst = Math.min(worst, attrRes.effective_di_at_output);
      }
    });
    return worst;
  }, [parsedResults]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-3" style={{ color: 'var(--muted)' }}>
        <Loader2 size={24} className="animate-spin" />
        <span className="text-sm">Loading pipeline details...</span>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex-1 p-6 text-center max-w-lg mx-auto space-y-4">
        <AlertTriangle size={32} className="text-red-500 mx-auto" />
        <h3 className="text-lg font-semibold">Pipeline not found</h3>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>The pipeline you requested does not exist or has been deleted.</p>
        <Link href="/pipelines" className="btn btn-primary">Back to Pipelines</Link>
      </div>
    );
  }

  const attributesList = pipeline.protected_attrs || (parsedResults ? Object.keys(parsedResults) : []);

  return (
    <>
      <TopNav breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' }, 
        { label: 'Pipelines', href: '/pipelines' },
        { label: pipeline.name }
      ]} />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        {error && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', background: 'var(--danger-dim)' }}>
            <div className="text-sm" style={{ color: 'var(--danger)' }}>{error}</div>
          </div>
        )}

        {/* Header and top stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/pipelines" className="btn btn-outline p-2 rounded-xl shrink-0">
                <ArrowLeft size={16} />
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>{pipeline.name}</h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{pipeline.description || 'No description provided.'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              className="btn btn-outline" 
              onClick={handleRecalculate}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Recalculate scores
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card">
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Pipeline Status</span>
            <div className="flex items-center gap-2">
              {pipeline.status === 'ANALYZED' ? (
                <ShieldCheck size={18} className="text-green-500" />
              ) : (
                <Info size={18} className="text-amber-500" />
              )}
              <span className="text-lg font-bold" style={{ color: 'var(--fg)' }}>{pipeline.status}</span>
            </div>
          </div>

          <div className="card">
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Worst Effective DI</span>
            <div className="text-lg font-bold" style={{ color: worstEffectiveDi !== null && worstEffectiveDi < 0.8 ? 'var(--danger)' : 'var(--success)' }}>
              {worstEffectiveDi !== null ? worstEffectiveDi.toFixed(2) : '--'}
            </div>
          </div>

          <div className="card">
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Total Pipeline Models</span>
            <div className="text-lg font-bold" style={{ color: 'var(--primary)' }}>{pipeline.nodes?.length || 0}</div>
          </div>

          <div className="card">
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Demographics Analyzed</span>
            <div className="text-lg font-bold">{attributesList.length}</div>
          </div>
        </div>

        {/* Main interactive grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: DAG visualization (2/3 width) */}
          <div className="lg:col-span-2 flex flex-col h-[450px] card p-0 border overflow-hidden rounded-[24px]">
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--surface)]">
              <div className="flex items-center gap-2">
                <GitBranch size={16} style={{ color: 'var(--primary)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Pipeline Directed Acyclic Graph</h3>
              </div>

              {/* Attribute selector for highlights */}
              {attributesList.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Highlight Attribute:</span>
                  <select 
                    className="select select-sm py-1 px-2 text-xs" 
                    value={selectedAttribute} 
                    onChange={e => setSelectedAttribute(e.target.value)}
                  >
                    {attributesList.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex-1 relative bg-[var(--surface-3)]">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                fitView
                nodesConnectable={false}
                nodesDraggable={false}
                zoomOnDoubleClick={false}
              >
                <Background color="var(--border)" gap={16} size={1} />
                <Controls />
                <MiniMap 
                  nodeStrokeColor="var(--border)"
                  nodeColor="var(--surface-2)"
                  maskColor="rgba(0, 0, 0, 0.05)"
                />
              </ReactFlow>
            </div>
          </div>

          {/* Right panel: Details and selected attribute details */}
          <div className="flex flex-col justify-between card p-5 border rounded-[24px]" style={{ background: 'var(--surface)' }}>
            <div>
              <h3 className="card-title mb-1.5">Attribute Detail</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>Detailed propagation stats for the selected demographic attribute.</p>
              
              {selectedAttribute && parsedResults && parsedResults[selectedAttribute] ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-[var(--border)]" style={{ background: 'var(--surface-2)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Protected Attribute</span>
                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-[var(--surface-3)]" style={{ color: 'var(--fg)' }}>{selectedAttribute}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <div>
                        <span className="text-[10px] block" style={{ color: 'var(--muted)' }}>Initial DI:</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--fg)' }}>
                          {parsedResults[selectedAttribute].initial_di?.toFixed(2) || '1.00'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] block" style={{ color: 'var(--muted)' }}>Final effective DI:</span>
                        <span className="text-sm font-black" style={{ color: parsedResults[selectedAttribute].effective_di_at_output < 0.8 ? 'var(--danger)' : 'var(--success)' }}>
                          {parsedResults[selectedAttribute].effective_di_at_output?.toFixed(2) || '1.00'}
                        </span>
                      </div>
                    </div>

                    {parsedResults[selectedAttribute].amplification_factor !== undefined && (
                      <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                        <span>Bias amplification:</span>
                        <span className="font-bold flex items-center gap-1" style={{ color: parsedResults[selectedAttribute].amplification_factor > 1.1 ? 'var(--danger)' : 'var(--success)' }}>
                          <TrendingUp size={12} /> {parsedResults[selectedAttribute].amplification_factor}x
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--muted)' }}>Propagation Path</span>
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--border)] overflow-x-auto text-xs" style={{ background: 'var(--surface-2)' }}>
                      {parsedResults[selectedAttribute].propagation_path ? (
                        <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: 'var(--fg)' }}>
                          {parsedResults[selectedAttribute].propagation_path}
                        </span>
                      ) : (
                        <span className="text-gray-400">No path data available.</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--muted)' }}>Verdict & Analysis</span>
                    <div className="p-3.5 rounded-xl border flex flex-col gap-2" style={{ 
                      background: parsedResults[selectedAttribute].verdict === 'FAIL' ? 'var(--danger-dim)' : 'var(--success-dim)',
                      borderColor: parsedResults[selectedAttribute].verdict === 'FAIL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'
                    }}>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${parsedResults[selectedAttribute].verdict === 'FAIL' ? 'bg-red-500' : 'bg-green-500'}`} />
                        <span className="text-xs font-bold" style={{ color: parsedResults[selectedAttribute].verdict === 'FAIL' ? 'var(--danger)' : 'var(--success)' }}>
                          {parsedResults[selectedAttribute].verdict === 'FAIL' ? 'FAIL: Non-Compliant' : 'PASS: Compliant'}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--fg)' }}>
                        {parsedResults[selectedAttribute].explanation}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-xs" style={{ color: 'var(--muted)' }}>
                  Select an attribute or run analysis to view details.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--border)' }}>
              <Link href="/pipelines" className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                Back to Pipelines list
              </Link>
            </div>
          </div>
        </div>

        {/* Propagation Table Section */}
        {parsedResults && (
          <div className="card rounded-[24px] overflow-hidden" style={{ padding: 0 }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-[15px] font-semibold">Fairness Propagation Analysis Table</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Full metric breakdown across all demographics through the sequential pipeline.</p>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Protected Attribute</th>
                    <th>Initial DI (Root)</th>
                    <th>Final Effective DI (Sink)</th>
                    <th>Amplification Factor</th>
                    <th>Propagation Chain</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(parsedResults).map(([attr, data]: [string, any]) => {
                    const isFail = data.verdict === 'FAIL';
                    const scoreColor = isFail ? 'var(--danger)' : 'var(--success)';
                    return (
                      <tr 
                        key={attr} 
                        className={`cursor-pointer hover:bg-[var(--surface-2)] transition-colors ${selectedAttribute === attr ? 'bg-[var(--surface-3)] font-semibold' : ''}`}
                        onClick={() => setSelectedAttribute(attr)}
                      >
                        <td className="font-medium">{attr}</td>
                        <td>{data.initial_di?.toFixed(4) || '1.00'}</td>
                        <td style={{ color: scoreColor }}>
                          {data.effective_di_at_output?.toFixed(4) || '1.00'}
                        </td>
                        <td className="font-semibold">
                          {data.amplification_factor !== undefined && data.amplification_factor !== null 
                            ? `${data.amplification_factor}x` 
                            : '1.00x'}
                        </td>
                        <td>
                          <span className="font-mono text-[10px] opacity-75">{data.propagation_path}</span>
                        </td>
                        <td>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${scoreColor}`}>
                            {isFail ? '🔴 FAIL' : '✅ PASS'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function PipelineDetailsPage() {
  return (
    <ReactFlowProvider>
      <PipelineDetails />
    </ReactFlowProvider>
  );
}
