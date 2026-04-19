import type { DriftBatch } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

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
      org_logo_url?: string;
    };
  }>;
}

export async function updateOrgSettings(orgId: string, settings: {
  benchmarking_opt_in?: boolean;
  email_notifications?: boolean;
  explain_rejection_enabled?: boolean;
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
