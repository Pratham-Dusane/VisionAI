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
    schema: any;
    proxies: any[];
    profiles: any[];
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

  const payload = await res.json();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-${auditId}-anon.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
