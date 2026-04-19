'use client';

import { useEffect, useState, use } from 'react';
import { AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import { getExplainMyRejection } from '@/lib/api';

export default function ExplainMyRejectionPage({
  params,
}: {
  params: Promise<{ auditId: string; rowIndex: string }>;
}) {
  const { auditId, rowIndex } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await getExplainMyRejection(auditId, Number(rowIndex));
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load explanation');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [auditId, rowIndex]);

  if (loading) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center" style={{ background: 'var(--surface)' }}>
        <div className="card w-full max-w-2xl space-y-4">
          <div className="skeleton" style={{ width: '38%', height: 12 }} />
          <div className="skeleton" style={{ width: '58%', height: 22 }} />
          <div className="space-y-2">
            <div className="skeleton" style={{ width: '92%', height: 12 }} />
            <div className="skeleton" style={{ width: '84%', height: 12 }} />
            <div className="skeleton" style={{ width: '74%', height: 12 }} />
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center" style={{ background: 'var(--surface)' }}>
        <div className="card max-w-2xl">
          <div className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Unable to display explanation</div>
          <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{error || 'No explanation data found'}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6" style={{ background: 'var(--surface)' }}>
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
        <div className="card" style={{ borderColor: 'var(--primary-dim)', background: 'var(--primary-dim)' }}>
          <div className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Explain My Rejection</div>
          <h1 className="text-xl font-bold mt-1">Decision Explanation</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--fg)' }}>
            {data.message}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Decision: <strong>{data.decision}</strong> | Score: {data.score}
          </p>
        </div>

        <div className="card">
          <div className="text-sm font-semibold mb-2">What influenced this decision</div>
          {data.influences?.length > 0 ? (
            <div className="space-y-2">
              {data.influences.map((item: any, idx: number) => (
                <div key={idx} className="p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                  <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>{item.feature}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{item.explanation}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--muted)' }}>No model influence details are available for this row.</div>
          )}
        </div>

        <div className="card" style={{ borderColor: 'var(--success-dim)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={14} style={{ color: 'var(--success)' }} />
            <div className="text-sm font-semibold">If the profile changed, could the result change?</div>
          </div>
          {data.counterfactual?.canFlip ? (
            <>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Yes. The model indicates the outcome may have been different if these fields changed:
              </div>
              <div className="mt-2 space-y-1">
                {data.counterfactual.changedFields.map((item: any, idx: number) => (
                  <div key={idx} className="text-xs" style={{ color: 'var(--fg)' }}>
                    <strong>{item.feature}</strong>: {String(item.from)} {'->'} {String(item.to)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              We could not find a small set of changes that reliably flipped this decision.
            </div>
          )}
        </div>

        <div className="card" style={{ borderColor: data.biasContext?.systemicBiasDetected ? 'var(--danger-dim)' : 'var(--success-dim)' }}>
          <div className="flex items-center gap-2 mb-2">
            {data.biasContext?.systemicBiasDetected ? (
              <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
            ) : (
              <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
            )}
            <div className="text-sm font-semibold">Bias context for your demographic group</div>
          </div>
          {data.biasContext?.systemicBiasDetected ? (
            <div className="space-y-1">
              {data.biasContext.notes.map((note: string, idx: number) => (
                <div key={idx} className="text-xs" style={{ color: 'var(--fg)' }}>{note}</div>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              No systemic demographic disadvantage was flagged for this profile in this audit.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
