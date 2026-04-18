'use client';

import { CheckCircle2, Clock3, Loader2 } from 'lucide-react';

interface AuditTrailTimelineProps {
  pipeline?: Record<string, string>;
  pipelineMeta?: Record<string, { status?: string; updatedAt?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

const STEP_ORDER = [
  'download',
  'schema_parsing',
  'auto_binning',
  'proxy_detection',
  'data_profiling',
  'data_bias_scan',
  'model_evaluation',
  'explainability',
  'intersectional_audit',
  'feature_laundering',
  'historical_harm',
  'regulation_mapping',
  'severity_scoring',
  'blind_spot_detection',
  'narrative_generation',
];

function prettyStep(step: string) {
  return step.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatTimestamp(value?: string) {
  if (!value) return 'No timestamp';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'No timestamp';
  return dt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AuditTrailTimeline({ pipeline = {}, pipelineMeta = {}, createdAt, updatedAt }: AuditTrailTimelineProps) {
  const steps = STEP_ORDER
    .filter((step) => step in pipeline || step in pipelineMeta)
    .map((step) => {
      const status = pipelineMeta[step]?.status || pipeline[step] || 'unknown';
      return {
        step,
        status,
        updatedAt: pipelineMeta[step]?.updatedAt,
      };
    });

  if (steps.length === 0) {
    return (
      <div className="card" style={{ borderColor: 'var(--border)' }}>
        <div className="text-sm" style={{ color: 'var(--placeholder)' }}>
          No audit trail metadata available yet.
        </div>
        {(createdAt || updatedAt) && (
          <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Created: {formatTimestamp(createdAt)}
            {updatedAt ? ` | Last Updated: ${formatTimestamp(updatedAt)}` : ''}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
        Audit Trail Timeline
      </div>
      <div className="p-4 space-y-3">
        {steps.map((item) => {
          const isComplete = item.status === 'complete';
          const isRunning = item.status === 'running';
          const iconColor = isComplete ? 'var(--success)' : isRunning ? 'var(--primary)' : 'var(--placeholder)';

          return (
            <div key={item.step} className="flex items-start gap-3">
              <div className="mt-0.5">
                {isComplete ? (
                  <CheckCircle2 size={14} style={{ color: iconColor }} />
                ) : isRunning ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: iconColor }} />
                ) : (
                  <Clock3 size={14} style={{ color: iconColor }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{prettyStep(item.step)}</span>
                  <span className={`badge ${item.status === 'complete' ? 'badge-pass' : item.status === 'running' ? 'badge-medium' : 'badge-neutral'}`}>
                    {item.status}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--placeholder)' }}>
                  {formatTimestamp(item.updatedAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
