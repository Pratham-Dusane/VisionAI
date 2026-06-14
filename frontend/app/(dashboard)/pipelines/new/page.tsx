'use client';

import TopNav from '@/components/layout/TopNav';
import { listAudits, getAudit, createPipeline, runPipelineAnalysis } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AuditNode } from '@/components/pipeline/AuditNode';
import { 
  GitBranch, ArrowLeft, Plus, Play, Info, Settings, AlertCircle, Loader2,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider
} from 'reactflow';

import 'reactflow/dist/style.css';

// Custom nodes definition
const nodeTypes = {
  auditNode: AuditNode,
};

function PipelineBuilder() {
  const router = useRouter();
  const { org, orgLoading } = useAuth();

  // State
  const [pipelineName, setPipelineName] = useState('New Model Pipeline');
  const [pipelineDesc, setPipelineDesc] = useState('');
  const [audits, setAudits] = useState<any[]>([]);
  const [auditSchemas, setAuditSchemas] = useState<Record<string, any>>({});
  const [loadingAudits, setLoadingAudits] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nodeCounter, setNodeCounter] = useState(1);

  // Search and Collapsible Sidebar
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Selected edge for configuration
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeConfigs, setEdgeConfigs] = useState<Record<string, { output_feature: string; input_feature: string }>>({});

  // Client-side quick filter ( autocomplete text length >= 2 letters )
  const filteredAudits = useMemo(() => {
    if (searchQuery.trim().length < 2) {
      return audits;
    }
    const q = searchQuery.toLowerCase().trim();
    return audits.filter(
      (a: any) =>
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.domain && a.domain.toLowerCase().includes(q))
    );
  }, [searchQuery, audits]);

  // Load completed audits list
  useEffect(() => {
    async function load() {
      if (!org?.id) return;
      try {
        setLoadingAudits(true);
        const data = await listAudits(org.id);
        // Filter complete audits
        const completed = data.filter((a: any) => a.status === 'COMPLETE');
        setAudits(completed);
      } catch (err: any) {
        setError('Failed to fetch audits list: ' + err.message);
      } finally {
        setLoadingAudits(false);
      }
    }
    if (!orgLoading) load();
  }, [org?.id, orgLoading]);

  // Connect handler
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        animated: true,
        style: { stroke: 'var(--primary)', strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      
      // Initialize edge config
      setEdgeConfigs(prev => ({
        ...prev,
        [`e-${params.source}-${params.target}`]: { output_feature: '', input_feature: '' }
      }));
      setSelectedEdgeId(`e-${params.source}-${params.target}`);
    },
    [setEdges]
  );

  // Fetch schema details when adding an audit to get its columns
  const addAuditToPipeline = async (audit: any) => {
    setError('');
    const nodeId = `node_${nodeCounter}`;
    setNodeCounter(prev => prev + 1);

    // Fetch full audit to get schema details
    if (!auditSchemas[audit.id]) {
      try {
        const fullAudit = await getAudit(audit.id);
        setAuditSchemas(prev => ({ ...prev, [audit.id]: fullAudit }));
      } catch (e: any) {
        console.error('Failed to get schema for audit:', audit.id, e);
      }
    }

    const newNode: Node = {
      id: nodeId,
      type: 'auditNode',
      position: { x: 100 + (nodes.length * 60) % 300, y: 100 + (nodes.length * 60) % 250 },
      data: {
        auditId: audit.id,
        auditName: audit.name,
        domain: audit.domain || 'Lending',
        fairnessScore: audit.fairnessScore,
        letterGrade: audit.letterGrade,
        isAnalyzed: false,
      },
    };

    setNodes((nds) => nds.concat(newNode));
  };

  // Find the edge being configured
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return edges.find(e => e.id === selectedEdgeId) || null;
  }, [selectedEdgeId, edges]);

  // Find source/target node audit info
  const selectedEdgeNodeDetails = useMemo(() => {
    if (!selectedEdge) return null;
    const sourceNode = nodes.find(n => n.id === selectedEdge.source);
    const targetNode = nodes.find(n => n.id === selectedEdge.target);
    if (!sourceNode || !targetNode) return null;

    const sourceAuditId = sourceNode.data.auditId;
    const targetAuditId = targetNode.data.auditId;

    const sourceFull = auditSchemas[sourceFullAuditIdKey(sourceAuditId)];
    const targetFull = auditSchemas[targetFullAuditIdKey(targetAuditId)];

    // Get features from schemas
    const sourceFeatures = extractFeatures(sourceFull);
    const targetFeatures = extractFeatures(targetFull);

    return {
      sourceLabel: sourceNode.data.auditName,
      targetLabel: targetNode.data.auditName,
      sourceFeatures,
      targetFeatures,
    };

    // Helper functions within useMemo
    function sourceFullAuditIdKey(id: string) { return id; }
    function targetFullAuditIdKey(id: string) { return id; }
    function extractFeatures(fullAudit: any): string[] {
      if (!fullAudit) return [];
      
      // Attempt to find features list
      const schema = fullAudit.schema || fullAudit.config?.schema || {};
      
      let parsedSchema = schema;
      if (typeof schema === 'string') {
        try {
          parsedSchema = JSON.parse(schema);
        } catch (e) {}
      }

      if (parsedSchema && typeof parsedSchema === 'object') {
        if (Array.isArray(parsedSchema.columns)) {
          return parsedSchema.columns.map((c: any) => typeof c === 'object' && c ? c.name : c).filter(Boolean);
        }
        if (Array.isArray(parsedSchema)) {
          return parsedSchema.map((c: any) => typeof c === 'object' && c ? c.name : c).filter(Boolean);
        }
      }

      // Fallback 1: Combine inputCols, outputCol, protectedCols if available
      const featuresSet = new Set<string>();
      const config = fullAudit.config || {};
      
      const inputCols = fullAudit.inputCols || config.inputCols || [];
      if (Array.isArray(inputCols)) {
        inputCols.forEach((c: any) => featuresSet.add(String(c)));
      }
      
      const labelCol = fullAudit.labelCol || config.labelCol || fullAudit.outputCol || config.outputCol;
      if (labelCol) {
        featuresSet.add(String(labelCol));
      }
      
      const protectedCols = fullAudit.protectedCols || config.protectedCols || [];
      if (Array.isArray(protectedCols)) {
        protectedCols.forEach((c: any) => featuresSet.add(String(c)));
      }
      
      if (featuresSet.size > 0) {
        return Array.from(featuresSet);
      }

      const dataBias = fullAudit.dataBias || {};
      let parsedDataBias = dataBias;
      if (typeof dataBias === 'string') {
        try {
          parsedDataBias = JSON.parse(dataBias);
        } catch (e) {}
      }
      if (parsedDataBias && typeof parsedDataBias === 'object') {
        return Object.keys(parsedDataBias);
      }
      
      return [];
    }
  }, [selectedEdge, nodes, auditSchemas]);

  // Edge click selection handler
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const updateEdgeConfig = (key: 'output_feature' | 'input_feature', value: string) => {
    if (!selectedEdgeId) return;
    setEdgeConfigs(prev => ({
      ...prev,
      [selectedEdgeId]: {
        ...prev[selectedEdgeId],
        [key]: value
      }
    }));
  };

  // Run/Save Pipeline Audit
  const handleRunAnalysis = async () => {
    if (!pipelineName.trim()) {
      setError('Please provide a pipeline name.');
      return;
    }
    if (nodes.length < 1) {
      setError('Please add at least one model to the pipeline.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      // Build payload matching Firestore/Pydantic schemas
      const nodesPayload = nodes.map(n => ({
        node_id: n.id,
        audit_id: n.data.auditId,
        label: n.data.auditName,
        position_x: n.position.x,
        position_y: n.position.y,
      }));

      const edgesPayload = edges.map(e => {
        const config = edgeConfigs[e.id] || { output_feature: '', input_feature: '' };
        return {
          from_node: e.source,
          to_node: e.target,
          output_feature: config.output_feature,
          input_feature: config.input_feature,
        };
      });

      // Get list of protected attrs across all nodes
      const protectedAttrsSet = new Set<string>();
      nodes.forEach(n => {
        const auditId = n.data.auditId;
        const fullAudit = auditSchemas[auditId];
        if (fullAudit?.protectedCols) {
          fullAudit.protectedCols.forEach((c: string) => protectedAttrsSet.add(c));
        } else if (fullAudit?.config?.protectedCols) {
          fullAudit.config.protectedCols.forEach((c: string) => protectedAttrsSet.add(c));
        }
      });

      // Create pipeline
      const pipelineRes = await createPipeline({
        name: pipelineName,
        description: pipelineDesc,
        nodes: nodesPayload,
        edges: edgesPayload,
        protected_attrs: Array.from(protectedAttrsSet),
      });

      // Run propagation analysis on-demand
      await runPipelineAnalysis(pipelineRes.pipeline_id);

      // Redirect to results page
      router.push(`/pipelines/${pipelineRes.pipeline_id}`);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save and analyze pipeline. Ensure it is a valid DAG.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopNav breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' }, 
        { label: 'Pipelines', href: '/pipelines' },
        { label: 'New' }
      ]} />

      <div 
        className="flex-1 flex flex-col w-full overflow-hidden animate-fade-in"
        style={{ height: 'calc(100vh - 130px)', maxHeight: 'calc(100vh - 130px)' }}
      >
        {/* Top Action Bar */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 bg-[var(--surface)] border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Link href="/pipelines" className="btn btn-outline p-2 rounded-xl">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <input 
                type="text" 
                className="bg-transparent border-none text-lg font-bold outline-none focus:ring-1 focus:ring-primary/20 px-1 py-0.5 rounded" 
                value={pipelineName}
                onChange={e => setPipelineName(e.target.value)}
                style={{ color: 'var(--fg)', width: '250px' }}
              />
              <input 
                type="text"
                placeholder="Add a pipeline description..."
                className="bg-transparent border-none text-xs block outline-none focus:ring-1 focus:ring-primary/20 px-1 py-0.5 rounded"
                value={pipelineDesc}
                onChange={e => setPipelineDesc(e.target.value)}
                style={{ color: 'var(--muted)', width: '350px' }}
              />
            </div>
          </div>

          <button 
            className="btn btn-primary"
            onClick={handleRunAnalysis}
            disabled={saving}
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Run Pipeline Audit
          </button>
        </div>

        {error && (
          <div className="px-6 py-3 shrink-0 bg-red-500/10 border-b border-red-500/20 text-red-500 text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Builder Shell */}
        <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>

          {/* Left panel: Searchable & Collapsible models */}
          {sidebarCollapsed ? (
            <div 
              className="w-14 shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col items-center py-4 justify-between"
              style={{ height: '100%' }}
            >
              <button 
                className="btn btn-outline p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
                onClick={() => setSidebarCollapsed(false)}
                title="Expand sidebar"
              >
                <ChevronRight size={16} />
              </button>
              <div 
                className="text-xs uppercase font-bold tracking-widest select-none text-gray-400 dark:text-gray-500"
                style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', paddingBottom: '20px' }}
              >
                Available Audits
              </div>
              <div className="w-2 h-2" />
            </div>
          ) : (
            <div className="w-80 shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--fg)' }}>Available Model Audits</h3>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Select completed audits to add to DAG.</p>
                </div>
                <button 
                  className="btn btn-ghost p-1.5 rounded-lg text-gray-400 hover:text-gray-600 shrink-0"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Collapse sidebar"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>

              {/* Autocomplete Search Bar */}
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
                <input 
                  type="text" 
                  placeholder="Search by name or domain..."
                  className="input py-1.5 px-3 text-xs rounded-lg"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                  <span className="text-[10px] text-amber-500 block mt-1">Type 2 or more letters to search...</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingAudits ? (
                  <div className="flex items-center gap-2 justify-center py-8" style={{ color: 'var(--muted)' }}>
                    <Loader2 size={16} className="animate-spin" /> Loading audits...
                  </div>
                ) : filteredAudits.length === 0 ? (
                  <div className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>
                    No completed audits found.
                  </div>
                ) : (
                  filteredAudits.map(a => (
                    <div 
                      key={a.id} 
                      className="card p-3 flex flex-col justify-between border-2 hover:border-primary/50 transition-colors"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-3)]" style={{ color: 'var(--muted)' }}>
                            {a.domain || 'Lending'}
                          </span>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--success)' }}>
                            {a.fairnessScore} ({a.letterGrade})
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold line-clamp-1" style={{ color: 'var(--fg)' }}>{a.name}</h4>
                      </div>

                      <button 
                        className="btn btn-outline btn-sm w-full mt-3 py-1 flex items-center justify-center gap-1 text-[11px] rounded-lg"
                        onClick={() => addAuditToPipeline(a)}
                      >
                        <Plus size={12} /> Add to Pipeline
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Canvas area */}
          <div className="flex-1 relative bg-[var(--surface-3)]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background color="var(--border)" gap={16} size={1} />
              <Controls />
              <MiniMap 
                nodeStrokeColor="var(--border)"
                nodeColor="var(--surface-2)"
                maskColor="rgba(0, 0, 0, 0.1)"
              />
            </ReactFlow>
          </div>


           {/* Right panel: Edge config */}
          {rightSidebarCollapsed ? (
            <div 
              className="w-14 shrink-0 bg-[var(--surface)] border-l border-[var(--border)] flex flex-col items-center py-4 justify-between"
              style={{ height: '100%' }}
            >
              <button 
                className="btn btn-outline p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
                onClick={() => setRightSidebarCollapsed(false)}
                title="Expand settings"
              >
                <ChevronLeft size={16} />
              </button>
              <div 
                className="text-xs uppercase font-bold tracking-widest select-none text-gray-400 dark:text-gray-500"
                style={{ writingMode: 'vertical-lr', paddingBottom: '20px' }}
              >
                Connection Settings
              </div>
              <div className="w-2 h-2" />
            </div>
          ) : (
            <div className="w-80 shrink-0 bg-[var(--surface)] border-l border-[var(--border)] flex flex-col overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings size={15} style={{ color: 'var(--muted)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Connection Settings</h3>
                </div>
                <button 
                  className="btn btn-ghost p-1.5 rounded-lg text-gray-400 hover:text-gray-600 shrink-0"
                  onClick={() => setRightSidebarCollapsed(true)}
                  title="Collapse settings"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {selectedEdge && selectedEdgeNodeDetails ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl border border-[var(--border)]" style={{ background: 'var(--surface-2)' }}>
                      <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Pipeline Route</p>
                      <div className="text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-red-500">Source:</span>
                          <span className="truncate max-w-[150px] font-medium" style={{ color: 'var(--fg)' }}>{selectedEdgeNodeDetails.sourceLabel}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-green-500">Target:</span>
                          <span className="truncate max-w-[150px] font-medium" style={{ color: 'var(--fg)' }}>{selectedEdgeNodeDetails.targetLabel}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="label-text block mb-1.5" style={{ color: 'var(--muted)' }}>
                          Source Output Feature (from model A)
                        </label>
                        {selectedEdgeNodeDetails.sourceFeatures.length > 0 ? (
                          <select 
                            className="select w-full"
                            value={edgeConfigs[selectedEdge.id]?.output_feature || ''}
                            onChange={e => updateEdgeConfig('output_feature', e.target.value)}
                          >
                            <option value="">Select feature...</option>
                            {selectedEdgeNodeDetails.sourceFeatures.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        ) : (
                          <input 
                            type="text" 
                            placeholder="e.g. loan_approved" 
                            className="input w-full"
                            value={edgeConfigs[selectedEdge.id]?.output_feature || ''}
                            onChange={e => updateEdgeConfig('output_feature', e.target.value)}
                          />
                        )}
                      </div>

                      <div>
                        <label className="label-text block mb-1.5" style={{ color: 'var(--muted)' }}>
                          Target Input Feature (into model B)
                        </label>
                        {selectedEdgeNodeDetails.targetFeatures.length > 0 ? (
                          <select 
                            className="select w-full"
                            value={edgeConfigs[selectedEdge.id]?.input_feature || ''}
                            onChange={e => updateEdgeConfig('input_feature', e.target.value)}
                          >
                            <option value="">Select feature...</option>
                            {selectedEdgeNodeDetails.targetFeatures.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        ) : (
                          <input 
                            type="text" 
                            placeholder="e.g. credit_score" 
                            className="input w-full"
                            value={edgeConfigs[selectedEdge.id]?.input_feature || ''}
                            onChange={e => updateEdgeConfig('input_feature', e.target.value)}
                          />
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg flex gap-2 text-xs" style={{ background: 'var(--primary-dim)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}>
                      <Info size={14} className="shrink-0 mt-0.5" />
                      <span>Specifying output/input mapping lets you document how data propagates between sequential audits.</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-xs" style={{ color: 'var(--muted)' }}>
                    Click a connection line in the graph to configure output/input feature maps.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  );
}

export default function NewPipelinePage() {
  return (
    <ReactFlowProvider>
      <PipelineBuilder />
    </ReactFlowProvider>
  );
}
