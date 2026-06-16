import type { DriftBatch } from './types';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

/**
 * Parse dataset schema - send storage path to backend,
 * get column metadata + preview rows.
 */
export async function parseSchema(storagePath: string) {
  const res = await fetch(`${API_BASE}/api/uploads/dataset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Schema parsing failed (${res.status})`);
  }

  return res.json();
}

/**
 * Create a new audit - runs full preprocessing pipeline on backend.
 * Returns audit ID + preprocessing results (schema, proxies, profiles).
 */
export async function createAudit(params: {
  orgId: string;
  name: string;
  domain: string;
  storagePath: string;
  labelCol: string;
  positiveLabel: string;
  protectedCols: string[];
  threshold: number;
  dataOnly: boolean;
  modelStoragePath?: string;
  deployed: boolean;
  deployedSince?: string;
  decisionsPerMonth?: number;
  jurisdiction: string;
  model_identifier?: string;
}) {
  const res = await fetch(`${API_BASE}/api/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Audit creation failed (${res.status})`);
  }

  return res.json() as Promise<{
    auditId: string;
    status: string;
    schema: Record<string, unknown>;
    proxies: Array<Record<string, unknown>>;
    profiles: Array<Record<string, unknown>>;
  }>;
}

/**
 * Get a single audit by ID.
 */
export async function getAudit(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch audit (${res.status})`);
  }

  return res.json();
}

/**
 * List all audits for an organization.
 */
export async function listAudits(orgId: string) {
  const res = await fetch(`${API_BASE}/api/audits?orgId=${encodeURIComponent(orgId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to list audits (${res.status})`);
  }

  return res.json();
}

/**
 * Download PDF audit report.
 */
export async function exportPDF(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/export/pdf`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to export PDF (${res.status})`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-${auditId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Download legal compliance JSON export.
 */
export async function exportLegalJSON(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/export/legal`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to export legal JSON (${res.status})`);
  }

  const payload = await res.json();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-${auditId}-legal.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Download anonymized whistleblower export.
 */
export async function exportAnonJSON(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/export/anon`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to export anonymized report (${res.status})`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-${auditId}-anonymized.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function getSampleRow(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/sample-row`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch sample row (${res.status})`);
  }

  return res.json() as Promise<{
    auditId: string;
    rowIndex: number;
    sampleRow: Record<string, unknown>;
  }>;
}

export async function predictAuditDecision(params: {
  auditId: string;
  values: Record<string, unknown>;
  threshold?: number;
}) {
  const res = await fetch(`${API_BASE}/api/audits/${params.auditId}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: params.values, threshold: params.threshold }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Prediction failed (${res.status})`);
  }

  return res.json() as Promise<{
    score: number;
    decision: 'ACCEPT' | 'REJECT';
    threshold: number;
    profile: Record<string, unknown>;
  }>;
}

export async function findMinimumFlip(params: {
  auditId: string;
  values: Record<string, unknown>;
  threshold?: number;
  maxChanges?: number;
}) {
  const res = await fetch(`${API_BASE}/api/audits/${params.auditId}/minimum-flip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: params.values,
      threshold: params.threshold,
      maxChanges: params.maxChanges ?? 3,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Minimum-flip failed (${res.status})`);
  }

  return res.json();
}

export async function runRedTeamAudit(auditId: string, minGroupSize = 25) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/red-team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minGroupSize }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Red-team analysis failed (${res.status})`);
  }

  return res.json();
}

export async function getExplainMyRejection(auditId: string, rowIndex: number) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/explain/${rowIndex}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to load explanation (${res.status})`);
  }

  return res.json();
}

export async function getOrgSettings(orgId: string) {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/settings`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch organization settings (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    settings: {
      benchmarking_opt_in: boolean;
      email_notifications: boolean;
      explain_rejection_enabled: boolean;
      shadow_testing_enabled?: boolean;
      org_logo_url?: string;
    };
  }>;
}

export async function updateOrgSettings(orgId: string, settings: {
  benchmarking_opt_in?: boolean;
  email_notifications?: boolean;
  explain_rejection_enabled?: boolean;
  shadow_testing_enabled?: boolean;
  org_logo_url?: string;
}) {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to update organization settings (${res.status})`);
  }

  return res.json();
}

export type OrgApiKey = {
  keyId: string;
  label: string;
  masked: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

export async function getOrgApiKeys(orgId: string) {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/api-keys`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch API keys (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    apiKeys: OrgApiKey[];
  }>;
}

export async function createOrgApiKey(orgId: string, label?: string) {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to create API key (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    keyId: string;
    apiKey: string;
    masked: string;
    label: string;
    active: boolean;
    createdAt: string;
  }>;
}

export async function revokeOrgApiKey(orgId: string, keyId: string) {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/api-keys/${keyId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to revoke API key (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    keyId: string;
    revoked: boolean;
  }>;
}

export async function getDriftHistory(orgId: string) {
  const res = await fetch(`${API_BASE}/api/drift/${orgId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to load drift history (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    batches: DriftBatch[];
    latestAlert: boolean;
    notificationCount: number;
  }>;
}

export async function uploadDriftBatch(params: {
  orgId: string;
  file: File;
  batchDate: string;
  labelCol: string;
  positiveLabel: string;
  protectedCols: string[];
  notes?: string;
  auditId?: string;
  predictionCol?: string;
}) {
  const formData = new FormData();
  formData.append('orgId', params.orgId);
  formData.append('file', params.file);
  formData.append('batchDate', params.batchDate);
  formData.append('labelCol', params.labelCol);
  formData.append('positiveLabel', params.positiveLabel);
  formData.append('protectedCols', JSON.stringify(params.protectedCols));
  formData.append('notes', params.notes || '');

  if (params.auditId) {
    formData.append('auditId', params.auditId);
  }
  if (params.predictionCol) {
    formData.append('predictionCol', params.predictionCol);
  }

  const res = await fetch(`${API_BASE}/api/drift/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to upload drift batch (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    batchId: string;
    summary: {
      fairnessScore: number;
      letterGrade: string;
      worstDi: number;
      rowCount: number;
      alertTriggered: boolean;
    };
    batch: DriftBatch;
  }>;
}

export async function getDriftNotificationCount(orgId: string) {
  const res = await fetch(`${API_BASE}/api/drift/${orgId}/notifications/count`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to load drift notifications (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    unread: number;
  }>;
}

export type DriftNotification = {
  id: string;
  orgId: string;
  type: string;
  title: string;
  message: string;
  batchId?: string;
  read: boolean;
  createdAt?: string;
  readAt?: string;
};

export async function getDriftNotifications(orgId: string) {
  const res = await fetch(`${API_BASE}/api/drift/${orgId}/notifications`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to load notifications (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    notifications: DriftNotification[];
    unread: number;
  }>;
}

export async function markDriftNotificationRead(orgId: string, notificationId: string) {
  const res = await fetch(`${API_BASE}/api/drift/${orgId}/notifications/${notificationId}/read`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to update notification (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    notificationId: string;
    read: boolean;
  }>;
}

export async function markAllDriftNotificationsRead(orgId: string) {
  const res = await fetch(`${API_BASE}/api/drift/${orgId}/notifications/read-all`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to update notifications (${res.status})`);
  }

  return res.json() as Promise<{
    orgId: string;
    updated: number;
  }>;
}

/**
 * Run generative shadow testing on a model-backed audit.
 * Generates synthetic rows for missing demographics and tests model decisions.
 */
export async function runShadowTest(auditId: string, page: number = 1, pageSize: number = 10) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/shadow-test?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Shadow testing failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch (or generate on-demand) a narrative for a specific stakeholder type.
 * Narratives are lazy-loaded — generated only when the user opens the AI Narratives tab.
 */
export async function fetchNarrative(auditId: string, stakeholderType: 'technical' | 'executive' | 'legal') {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/narrative/${stakeholderType}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch narrative (${res.status})`);
  }

  return res.json() as Promise<{
    auditId: string;
    stakeholderType: string;
    narrative: string;
    cached: boolean;
  }>;
}

/**
 * Fetch (or compute on-demand) feature laundering detection.
 * Also returns updated severity and regulationMap if computed lazily.
 */
export async function fetchFeatureLaundering(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/feature-laundering`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch feature laundering (${res.status})`);
  }

  return res.json() as Promise<{
    auditId: string;
    featureLaundering: Array<Record<string, unknown>>;
    severity: Record<string, unknown>;
    regulationMap?: Record<string, unknown>;
    cached: boolean;
  }>;
}

/**
 * Generate a bias-mitigated (balanced) dataset for an audit.
 */
export async function remediateBias(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/remediate-bias`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Dataset bias remediation failed (${res.status})`);
  }

  return res.json() as Promise<{
    success: boolean;
    mitigatedStoragePath: string;
    mitigatedProfiles: Array<Record<string, unknown>>;
    mitigatedDataBias: Record<string, unknown>;
  }>;
}

/**
 * Get the download URL for the mitigated dataset.
 */
export function getDownloadMitigatedUrl(auditId: string): string {
  return `${API_BASE}/api/audits/${auditId}/download-mitigated`;
}

/**
 * What-If Simulator: run a live prediction on a user-constructed profile.
 * Returns prediction label, confidence, raw score, and per-feature contributions.
 */
export async function whatifPredict(auditId: string, features: Record<string, unknown>, threshold?: number) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/whatif/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features, threshold }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `What-If prediction failed (${res.status})`);
  }

  return res.json() as Promise<{
    auditId: string;
    prediction: string;
    decision: 'APPROVED' | 'REJECTED';
    confidence: number | null;
    rawScore: number;
    threshold: number;
    featureContributions: Record<string, number>;
    profile: Record<string, unknown>;
  }>;
}

/**
 * What-If Simulator: fetch a random row from the audit dataset.
 */
export async function whatifRandomRow(auditId: string) {
  const res = await fetch(`${API_BASE}/api/audits/${auditId}/whatif/random-row`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch random row (${res.status})`);
  }

  return res.json() as Promise<{
    auditId: string;
    features: Record<string, unknown>;
  }>;
}

/**
 * Fetch causal fairness analysis results on-demand (Feature 5).
 */
export async function getCausalAnalysis(auditId: string, force = false) {
  const url = `${API_BASE}/api/audits/${auditId}/causal` + (force ? '?force=true' : '');
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to run causal analysis' }));
    throw new Error(err.detail || `Causal analysis failed (${res.status})`);
  }

  return res.json() as Promise<{
    causal_graph_dot: string;
    per_attribute: Record<string, {
      total_causal_effect: number;
      direct_effect: number;
      indirect_effect: number;
      mediators: string[];
      direct_paths: string[];
      indirect_paths: string[];
      discrimination_type: string;
      legal_implication: string;
      recommended_intervention: string;
      error?: string;
      fallback_note?: string;
    }>;
  }>;
}

export type PipelineNode = {
  node_id: string;
  audit_id: string;
  label: string;
  position_x: number;
  position_y: number;
};

export type PipelineEdge = {
  from_node: string;
  to_node: string;
  output_feature: string;
  input_feature: string;
};

export type Pipeline = {
  pipeline_id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  protected_attrs: string[];
  status: 'DRAFT' | 'ANALYZED';
  analysis_results?: string; // JSON string containing dict of attribute analysis
  created_at?: string;
  updated_at?: string;
};

export async function listPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`${API_BASE}/api/pipelines`);
  if (!res.ok) {
    throw new Error(`Failed to list pipelines (${res.status})`);
  }
  return res.json();
}

export async function getPipeline(pipelineId: string): Promise<Pipeline> {
  const res = await fetch(`${API_BASE}/api/pipelines/${pipelineId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch pipeline (${res.status})`);
  }
  return res.json();
}

export async function createPipeline(params: {
  name: string;
  description?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  protected_attrs?: string[];
}): Promise<Pipeline> {
  const res = await fetch(`${API_BASE}/api/pipelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create pipeline' }));
    throw new Error(err.detail || `Failed to create pipeline (${res.status})`);
  }
  return res.json();
}

export async function updatePipeline(
  pipelineId: string,
  params: {
    name?: string;
    description?: string;
    nodes?: PipelineNode[];
    edges?: PipelineEdge[];
    protected_attrs?: string[];
  }
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/pipelines/${pipelineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update pipeline' }));
    throw new Error(err.detail || `Failed to update pipeline (${res.status})`);
  }
  return res.json();
}

export async function deletePipeline(pipelineId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/pipelines/${pipelineId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete pipeline (${res.status})`);
  }
  return res.json();
}

export async function runPipelineAnalysis(pipelineId: string): Promise<{
  pipeline_id: string;
  protected_attrs: string[];
  results: Record<string, any>;
}> {
  const res = await fetch(`${API_BASE}/api/pipelines/${pipelineId}/analyze`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to analyze pipeline' }));
    throw new Error(err.detail || `Failed to analyze pipeline (${res.status})`);
  }
  return res.json();
}

/**
 * LLM and RAG Pipeline Bias Evaluator API (Feature 7).
 */
export async function runLLMBiasScan(params: {
  llm_endpoint: string;
  llm_api_key: string;
  domain: string;
  org_id: string;
  model_name?: string;
  rag_endpoint?: string;
}) {
  const res = await fetch(`${API_BASE}/api/audits/llm-bias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `LLM bias evaluation failed (${res.status})`);
  }

  return res.json() as Promise<{
    stereotype_amplification: Record<string, {
      group_outputs: Record<string, {
        responses: string[];
        mean_toxicity: number;
        mean_sentiment: number;
      }>;
      toxicity_disparity: number;
      sentiment_disparity: number;
      toxicity_flagged: boolean;
      sentiment_flagged: boolean;
      worst_toxicity_group: string | null;
      lowest_sentiment_group: string | null;
    }>;
    retrieval_bias: {
      retrieval_similarity_by_group: Record<string, number | null>;
      similarity_disparity: number;
      retrieval_bias_flagged: boolean;
      retrieved_doc_samples: Record<string, string[]>;
    };
  }>;
}


// ─── Quantization Profiler (Feature 6) ─────────────────────────

export interface QDIGroupResult {
  full_precision_accuracy: number;
  quantized_accuracy: number;
  qdi: number;
  accuracy_drop_pct: number;
  sample_size: number;
  flagged: boolean;
}

export interface QDIFlaggedGroup {
  protected_col: string;
  group: string;
  qdi: number;
  accuracy_drop_pct: number;
  full_acc: number;
  quant_acc: number;
  sample_size: number;
  explanation: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export interface QDIResults {
  overall: {
    full_precision_accuracy: number;
    quantized_accuracy: number;
    qdi: number;
    accuracy_drop_pct: number;
    total_samples: number;
    simulated_quantization: boolean;
  };
  per_group: Record<string, Record<string, QDIGroupResult>>;
  flagged_groups: QDIFlaggedGroup[];
  metadata: {
    qdi_threshold: number;
    min_group_size: number;
    feature_cols_used: string[];
    protected_cols_analyzed: string[];
  };
}

export interface QuantizationProfile {
  id: string;
  name: string;
  status: 'PROCESSING' | 'COMPLETE' | 'FAILED';
  createdAt?: string;
  completedAt?: string;
  overall_qdi?: number | null;
  overall_accuracy_drop_pct?: number | null;
  full_precision_accuracy?: number | null;
  quantized_accuracy?: number | null;
  flagged_count?: number | null;
  total_samples?: number | null;
  simulated_quantization?: boolean | null;
  sourceAuditId?: string | null;
  error?: string | null;
}

export interface QuantizationProfileDetail extends QuantizationProfile {
  orgId: string;
  datasetStoragePath: string;
  fullModelStoragePath: string;
  quantizedModelStoragePath?: string | null;
  protectedCols: string[];
  labelCol: string;
  positiveLabel: string;
  results?: QDIResults | null;
}

/**
 * Create a new quantization profile and start QDI analysis.
 */
export async function runQuantizationProfile(params: {
  orgId: string;
  name?: string;
  datasetStoragePath: string;
  fullModelStoragePath: string;
  quantizedModelStoragePath?: string;
  protectedCols: string[];
  labelCol: string;
  positiveLabel: string;
  featureCols?: string[];
  sourceAuditId?: string;
}) {
  const res = await fetch(`${API_BASE}/api/quantization/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Quantization profile creation failed (${res.status})`);
  }

  return res.json() as Promise<{
    profileId: string;
    status: string;
  }>;
}

/**
 * List all quantization profiles for an organization.
 */
export async function listQuantizationProfiles(orgId: string) {
  const res = await fetch(`${API_BASE}/api/quantization/profiles?orgId=${encodeURIComponent(orgId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to list quantization profiles (${res.status})`);
  }

  return res.json() as Promise<QuantizationProfile[]>;
}

/**
 * Get a single quantization profile with full results.
 */
export async function getQuantizationProfile(profileId: string) {
  const res = await fetch(`${API_BASE}/api/quantization/profiles/${profileId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch quantization profile (${res.status})`);
  }

  return res.json() as Promise<QuantizationProfileDetail>;
}

/**
 * Delete a quantization profile.
 */
export async function deleteQuantizationProfile(profileId: string) {
  const res = await fetch(`${API_BASE}/api/quantization/profiles/${profileId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to delete quantization profile (${res.status})`);
  }

  return res.json() as Promise<{
    deleted: boolean;
    profileId: string;
  }>;
}

// ─── Transfer Bias Analysis Types & API ──────────────────────────────────────

export interface TransferBiasAnalysisRequest {
  orgId: string;
  name?: string;
  datasetStoragePath: string;
  fineTunedModelStoragePath: string;
  baseModelName: string;
  domain?: string;
  protectedCols: string[];
  labelCol: string;
  positiveLabel: string;
  featureCols?: string[];
  sourceAuditId?: string;
}

export interface TransferBiasAnalysis {
  id: string;
  name: string;
  createdAt: string;
  completedAt: string | null;
  status: 'PROCESSING' | 'COMPLETE' | 'FAILED';
  baseModelName: string;
  domain: string;
  sourceAuditId?: string;
  summary: any | null;
  error?: string | null;
}

export interface TransferBiasAnalysisDetail extends TransferBiasAnalysis {
  datasetStoragePath: string;
  fineTunedModelStoragePath: string;
  protectedCols: string[];
  labelCol: string;
  positiveLabel: string;
  results: any | null;
}

/**
 * Create a new transfer bias analysis.
 */
export async function createTransferBiasAnalysis(params: TransferBiasAnalysisRequest) {
  const res = await fetch(`${API_BASE}/api/transfer-bias/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Transfer bias analysis creation failed (${res.status})`);
  }

  return res.json() as Promise<{
    analysisId: string;
    status: string;
  }>;
}

/**
 * List all transfer bias analyses for an organization.
 */
export async function listTransferBiasAnalyses(orgId: string) {
  const res = await fetch(`${API_BASE}/api/transfer-bias/analyses?orgId=${encodeURIComponent(orgId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to list transfer bias analyses (${res.status})`);
  }

  return res.json() as Promise<TransferBiasAnalysis[]>;
}

/**
 * Get a single transfer bias analysis with full results.
 */
export async function getTransferBiasAnalysis(analysisId: string) {
  const res = await fetch(`${API_BASE}/api/transfer-bias/analyses/${analysisId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch transfer bias analysis (${res.status})`);
  }

  return res.json() as Promise<TransferBiasAnalysisDetail>;
}

/**
 * Delete a transfer bias analysis.
 */
export async function deleteTransferBiasAnalysis(analysisId: string) {
  const res = await fetch(`${API_BASE}/api/transfer-bias/analyses/${analysisId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to delete transfer bias analysis (${res.status})`);
  }

  return res.json() as Promise<{
    deleted: boolean;
    analysisId: string;
  }>;
}

/**
 * List all Sentinels for an organization.
 */
export async function listSentinels(orgId: string) {
  const res = await fetch(`${API_BASE}/api/sentinel?orgId=${encodeURIComponent(orgId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to list sentinels (${res.status})`);
  }
  return res.json();
}

/**
 * Create a new Sentinel.
 */
export async function createSentinel(orgId: string, data: any) {
  const res = await fetch(`${API_BASE}/api/sentinel?orgId=${encodeURIComponent(orgId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to create sentinel (${res.status})`);
  }
  return res.json();
}

/**
 * Get live status of a Sentinel proxy.
 */
export async function getSentinelStatus(sentinelId: string) {
  const res = await fetch(`${API_BASE}/api/sentinel/${sentinelId}/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch sentinel status (${res.status})`);
  }
  return res.json();
}

/**
 * Get review queue for a Sentinel proxy.
 */
export async function getSentinelReviewQueue(sentinelId: string, status: string = 'PENDING') {
  const res = await fetch(`${API_BASE}/api/sentinel/${sentinelId}/review-queue?status=${status}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to fetch sentinel review queue (${res.status})`);
  }
  return res.json();
}

/**
 * Resolve a review queue item.
 */
export async function resolveReviewQueueItem(sentinelId: string, reviewId: string, data: { final_decision: string; reviewed_by: string; notes?: string }) {
  const res = await fetch(`${API_BASE}/api/sentinel/${sentinelId}/review-queue/${reviewId}?final_decision=${encodeURIComponent(data.final_decision)}&reviewed_by=${encodeURIComponent(data.reviewed_by)}&notes=${encodeURIComponent(data.notes || '')}`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to resolve review item (${res.status})`);
  }
  return res.json();
}

/**
 * Reset a Sentinel breaker.
 */
export async function resetSentinelBreaker(sentinelId: string, resetBy: string) {
  const res = await fetch(`${API_BASE}/api/sentinel/${sentinelId}/reset-breaker?reset_by=${encodeURIComponent(resetBy)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to reset breaker (${res.status})`);
  }
  return res.json();
}

/**
 * Delete a Sentinel proxy.
 */
export async function deleteSentinel(sentinelId: string) {
  const res = await fetch(`${API_BASE}/api/sentinel/${sentinelId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Failed to delete sentinel (${res.status})`);
  }
  return res.json();
}



