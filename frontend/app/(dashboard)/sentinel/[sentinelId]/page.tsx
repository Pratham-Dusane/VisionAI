'use client';

import TopNav from '@/components/layout/TopNav';
import { getSentinelStatus, getSentinelReviewQueue, resolveReviewQueueItem, resetSentinelBreaker } from '@/lib/api';
import { getApiBase } from '@/lib/apiBase';
import { useAuth } from '@/lib/auth-context';
import { Shield, ShieldAlert, ShieldCheck, Loader2, ArrowLeft, RefreshCw, AlertCircle, Check, X, Clock, HelpCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';

interface DecisionData {
  request_id: string;
  timestamp: number;
  protected_attribute_values: Record<string, string>;
  raw_prediction: string;
  is_positive: boolean;
  was_intercepted: boolean;
}

interface ReviewQueueItem {
  review_id: string;
  sentinel_id: string;
  org_id: string;
  model_name: string;
  status: 'PENDING' | 'REVIEWED';
  enqueued_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  original_request: Record<string, any>;
  model_raw_response: Record<string, any>;
  protected_attribute_values: Record<string, string>;
  trip_reason: Record<string, any>;
  final_decision: 'APPROVED' | 'REJECTED' | null;
  reviewer_notes: string | null;
}

interface SentinelStatusData {
  sentinel_id: string;
  org_id: string;
  model_name: string;
  target_endpoint: string;
  status: string;
  sentinel_url: string;
  config: {
    model_name: string;
    target_endpoint: string;
    protected_attributes: string[];
    prediction_field: string;
    positive_prediction_value: string;
    privileged_group_values: Record<string, string>;
    rolling_window_size: number;
    di_threshold: number;
    min_decisions_before_trip: number;
    evaluation_interval_seconds: number;
    breaker_mode: 'shadow' | 'intercept' | 'block_all';
    alert_webhook_url?: string;
  };
  live_status: {
    sentinel_id: string;
    model_name: string;
    breaker_state: {
      state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      tripped_at: string | null;
      trip_reason: {
        protected_attribute: string;
        live_di_ratio: number;
        threshold: number;
        message: string;
        window_stats: Record<string, any>;
      } | null;
      decisions_intercepted: number;
      reset_at?: string;
      reset_by?: string;
    };
    window_size: number;
    live_di_metrics: Record<string, {
      di_ratio: number;
      privileged_positive_rate: number;
      unprivileged_positive_rate: number;
      privileged_count: number;
      unprivileged_count: number;
      window_size: number;
      insufficient_data: boolean;
      reason?: string;
    }>;
    recent_decisions?: DecisionData[];
    error?: string;
  };
}

// Custom Semicircular SVG Gauge Component
function DiGauge({ label, diValue, threshold, privilegedRate, unprivilegedRate, privCount, unprivCount, insufficient, reason }: {
  label: string;
  diValue: number;
  threshold: number;
  privilegedRate: number;
  unprivilegedRate: number;
  privCount: number;
  unprivCount: number;
  insufficient: boolean;
  reason?: string;
}) {
  // Angle: diValue ranges from 0 to 2.0. Map it to -90 to +90 degrees.
  const maxVal = 2.0;
  const clampedValue = Math.min(Math.max(diValue, 0), maxVal);
  const percent = clampedValue / maxVal;
  const angle = -90 + percent * 180;

  // Calculate coordinates for threshold tick on arc
  const thresholdPercent = threshold / maxVal;
  const thresholdAngle = -Math.PI + thresholdPercent * Math.PI;
  const tx = 60 + 50 * Math.cos(thresholdAngle);
  const ty = 70 + 50 * Math.sin(thresholdAngle);

  return (
    <div className="card flex flex-col items-center justify-between text-center min-h-[300px]">
      <div className="w-full flex justify-between items-start mb-2 border-b border-gray-800 pb-2">
        <span className="text-sm font-semibold text-gray-300 capitalize">{label}</span>
        <span className="text-xs text-gray-500 font-mono">threshold: {threshold}</span>
      </div>

      {insufficient ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <HelpCircle size={32} className="text-gray-600 mb-2" />
          <div className="text-xs text-gray-400 max-w-[180px] leading-relaxed">
            {reason || 'Awaiting decisions to compute Disparate Impact...'}
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center py-2">
          <svg width="150" height="90" viewBox="0 0 120 80">
            {/* Background Arc */}
            <path
              d="M 10,70 A 50,50 0 0,1 110,70"
              fill="none"
              stroke="#1e293b"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Green (Safe) Arc */}
            <path
              d="M 10,70 A 50,50 0 0,1 110,70"
              fill="none"
              stroke="#10b981"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="157"
              strokeDashoffset={157 * (1 - percent)}
              className="transition-all duration-500 ease-out"
            />
            {/* Red (Danger) threshold arc overlay */}
            <path
              d={`M 10,70 A 50,50 0 0,1 ${tx},${ty}`}
              fill="none"
              stroke="#ef4444"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="157"
              className="opacity-80"
            />
            {/* Threshold Line Mark */}
            <line
              x1="60"
              y1="70"
              x2={tx}
              y2={ty}
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeDasharray="2,2"
            />
            {/* Needle */}
            <g transform={`rotate(${angle} 60 70)`} className="transition-all duration-500 ease-out">
              <polygon points="58,70 60,20 62,70" fill="var(--primary)" />
              <circle cx="60" cy="70" r="5" fill="var(--primary-dark)" stroke="#ffffff" strokeWidth="1" />
            </g>
          </svg>
          <div className="absolute bottom-1 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono tracking-tight" style={{ color: diValue < threshold ? 'var(--danger)' : 'var(--success)' }}>
              {diValue.toFixed(3)}
            </span>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Live DI Ratio</span>
          </div>
        </div>
      )}

      {!insufficient && (
        <div className="w-full grid grid-cols-2 gap-2 text-left bg-gray-900/50 p-2.5 rounded border border-gray-800 text-[11px] mt-4">
          <div className="space-y-1 border-r border-gray-800 pr-2">
            <div className="text-gray-500 font-medium">Privileged group</div>
            <div className="font-mono font-semibold text-emerald-400">{(privilegedRate * 100).toFixed(1)}%</div>
            <div className="text-[9px] text-gray-600 font-mono">{privCount} decisions</div>
          </div>
          <div className="space-y-1 pl-2">
            <div className="text-gray-500 font-medium">Unprivileged group</div>
            <div className="font-mono font-semibold" style={{ color: diValue < threshold ? 'var(--danger)' : 'var(--success)' }}>
              {(unprivilegedRate * 100).toFixed(1)}%
            </div>
            <div className="text-[9px] text-gray-600 font-mono">{unprivCount} decisions</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SentinelLiveMonitor() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const sentinelId = params.sentinelId as string;

  const [sentinel, setSentinel] = useState<SentinelStatusData | null>(null);
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [activeReviewTab, setActiveReviewTab] = useState<'PENDING' | 'REVIEWED'>('PENDING');

  const [resetting, setResetting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(5);

  const fetchSentinelData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const statusData = await getSentinelStatus(sentinelId);
      setSentinel(statusData);

      const queueData = await getSentinelReviewQueue(sentinelId, activeReviewTab);
      setReviews(queueData);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch status from proxy.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll status every 5 seconds
  useEffect(() => {
    fetchSentinelData(true);

    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchSentinelData(false);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sentinelId, activeReviewTab]);

  const handleResetBreaker = async () => {
    if (!window.confirm('Are you sure you want to reset the circuit breaker? This will return the proxy to normal CLOSED operation.')) {
      return;
    }

    setResetting(true);
    try {
      const userName = user?.email || 'admin';
      await resetSentinelBreaker(sentinelId, userName);
      await fetchSentinelData(false);
    } catch (err: any) {
      alert(err.message || 'Failed to reset breaker.');
    } finally {
      setResetting(false);
    }
  };

  const handleSimulateTraffic = async () => {
    setSimulating(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/sentinel/${sentinelId}/simulate-traffic`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Simulation failed to start');
      }
      // Poll for updates quickly over the next few seconds to reflect incoming decisions
      setTimeout(() => fetchSentinelData(false), 500);
      setTimeout(() => fetchSentinelData(false), 1500);
      setTimeout(() => fetchSentinelData(false), 3000);
      setTimeout(() => fetchSentinelData(false), 5000);
      setTimeout(() => fetchSentinelData(false), 7000);
    } catch (err: any) {
      alert(err.message || 'Failed to trigger traffic simulation.');
    } finally {
      setSimulating(false);
    }
  };

  const handleResolveReview = async (reviewId: string, decision: 'APPROVED' | 'REJECTED') => {
    setResolvingId(reviewId);
    try {
      const userName = user?.email || 'admin';
      const notes = reviewerNotes[reviewId] || '';
      await resolveReviewQueueItem(sentinelId, reviewId, {
        final_decision: decision,
        reviewed_by: userName,
        notes: notes,
      });

      // Clear note
      setReviewerNotes((prev) => {
        const next = { ...prev };
        delete next[reviewId];
        return next;
      });

      // Reload
      const queueData = await getSentinelReviewQueue(sentinelId, activeReviewTab);
      setReviews(queueData);
    } catch (err: any) {
      alert(err.message || 'Failed to resolve review item.');
    } finally {
      setResolvingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-400 min-h-[500px]">
        <Loader2 className="animate-spin mr-2" size={24} />
        Connecting to Sentinel Proxy...
      </div>
    );
  }

  if (error && !sentinel) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <button onClick={() => router.push('/sentinel')} className="btn btn-secondary inline-flex items-center gap-1">
          <ArrowLeft size={16} /> Back to List
        </button>
        <div className="card border-rose-500/30 bg-rose-500/10 text-rose-400 p-4">
          <h3 className="font-bold mb-1">Connection Error</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const liveState = sentinel?.live_status?.breaker_state?.state || 'CLOSED';
  const tripReason = sentinel?.live_status?.breaker_state?.trip_reason;
  const interceptedCount = sentinel?.live_status?.breaker_state?.decisions_intercepted || 0;
  const decisions = sentinel?.live_status?.recent_decisions || [];

  return (
    <>
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Sentinel Proxy', href: '/sentinel' },
          { label: sentinel?.model_name || 'Monitor' },
        ]}
      />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/sentinel')}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition"
              >
                <ArrowLeft size={16} />
              </button>
              <h1 className="text-xl font-bold text-gray-100">{sentinel?.model_name} Monitor</h1>
            </div>
            <p className="text-xs text-gray-500 font-mono pl-8">{sentinel?.sentinel_id} • Gateway: {sentinel?.sentinel_url}</p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto text-xs text-gray-400">
            <span className="flex items-center gap-1.5 font-mono">
              <RefreshCw size={12} className="animate-spin text-primary" /> Auto-refreshing in {refreshCountdown}s
            </span>
            <button
              onClick={() => fetchSentinelData(true)}
              className="btn btn-secondary btn-sm"
            >
              Refresh Now
            </button>
            <button
              onClick={handleSimulateTraffic}
              disabled={simulating}
              className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
            >
              {simulating ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Simulating...
                </>
              ) : (
                <>
                  <RefreshCw size={12} /> Simulate Traffic
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3 Columns Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Breaker Status Card */}
          <div className="space-y-6">
            <div className="card space-y-4">
              <h3 className="card-title text-sm text-gray-400">Circuit Breaker State</h3>

              <div className="flex flex-col items-center justify-center p-6 bg-gray-950/40 rounded border border-gray-850 text-center space-y-3">
                {liveState === 'CLOSED' ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                      <ShieldCheck size={36} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-emerald-400">Breaker CLOSED</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Operating Normally</div>
                    </div>
                  </>
                ) : liveState === 'HALF_OPEN' ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                      <Clock size={36} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-400">Breaker HALF-OPEN</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Cooldown Period</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-bounce shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                      <ShieldAlert size={36} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-rose-400">Breaker TRIPPED</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Bias Interception Active</div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Decisions Intercepted:</span>
                  <span className="font-mono font-bold text-rose-400">{interceptedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Window Cache Size:</span>
                  <span className="font-mono font-bold text-gray-300">
                    {sentinel?.live_status?.window_size || 0} / {sentinel?.config.rolling_window_size}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Breaker Mode:</span>
                  <span className="capitalize font-semibold text-primary">{sentinel?.config.breaker_mode}</span>
                </div>
              </div>

              {liveState !== 'CLOSED' && (
                <button
                  onClick={handleResetBreaker}
                  disabled={resetting}
                  className="w-full btn btn-danger btn-sm py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  {resetting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reset Breaker State
                </button>
              )}
            </div>

            {/* Trip Details Card */}
            {liveState === 'OPEN' && tripReason && (
              <div className="card border-rose-500/20 bg-rose-500/5 space-y-3 animate-fade-in">
                <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold uppercase tracking-wider">
                  <AlertCircle size={14} /> Trip Analysis
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="text-gray-400">
                    Flagged Attribute:{' '}
                    <span className="font-mono text-gray-200 capitalize">{tripReason.protected_attribute}</span>
                  </div>
                  <div className="text-gray-400">
                    Live DI Ratio at Trip:{' '}
                    <span className="font-mono font-bold text-rose-400">{(tripReason.live_di_ratio ?? 0).toFixed(3)}</span>
                  </div>
                  <div className="text-gray-400">
                    Trip Timestamp:{' '}
                    <span className="font-mono text-gray-300">
                      {sentinel?.live_status?.breaker_state?.tripped_at ? new Date(sentinel.live_status.breaker_state.tripped_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 bg-gray-950/60 rounded border border-gray-850 text-[11px] text-gray-300 leading-relaxed font-sans mt-2 whitespace-pre-wrap">
                  {tripReason.message}
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Live DI Gauges */}
          <div className="space-y-6">
            {sentinel?.config.protected_attributes.map((attr) => {
              const metrics = sentinel?.live_status?.live_di_metrics?.[attr];
              return (
                <DiGauge
                  key={attr}
                  label={attr}
                  diValue={metrics?.di_ratio ?? 1.0}
                  threshold={sentinel.config.di_threshold}
                  privilegedRate={metrics?.privileged_positive_rate ?? 0.0}
                  unprivilegedRate={metrics?.unprivileged_positive_rate ?? 0.0}
                  privCount={metrics?.privileged_count ?? 0}
                  unprivCount={metrics?.unprivileged_count ?? 0}
                  insufficient={metrics?.insufficient_data ?? true}
                  reason={metrics?.reason}
                />
              );
            })}
          </div>

          {/* Column 3: Live Decision Feed */}
          <div className="card flex flex-col min-h-[350px]">
            <h3 className="card-title text-sm text-gray-400 mb-3 border-b border-gray-800 pb-2">Rolling Decision Feed</h3>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[360px]">
              {decisions.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-12">No decisions processed yet.</div>
              ) : (
                decisions.map((d, index) => {
                  const dateStr = new Date(d.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <div
                      key={d.request_id + index}
                      className={`p-2.5 rounded border text-[11px] flex flex-col justify-between gap-1 transition ${
                        d.was_intercepted
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                          : 'bg-gray-900/30 border-gray-850 hover:border-gray-700 text-gray-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-gray-500">{dateStr}</span>
                        {d.was_intercepted && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/25 border border-rose-500/40 text-[9px] font-bold text-rose-300 uppercase tracking-widest">
                            🛑 Intercepted
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1 my-1">
                        {Object.entries(d.protected_attribute_values).map(([k, v]) => (
                          <div key={k} className="text-[10px]">
                            <span className="text-gray-500 capitalize">{k}:</span> <span className="font-medium text-gray-300">{v}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-[10px] border-t border-gray-800/40 pt-1 mt-0.5">
                        <span className="text-gray-500">Output Prediction:</span>
                        <span className={`font-semibold font-mono ${d.is_positive ? 'text-emerald-400' : 'text-gray-400'}`}>
                          {d.raw_prediction}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: Manual Review Queue */}
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-800 pb-3">
            <div>
              <h3 className="card-title">Sentinel Manual Review Queue</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Intercepted negative applications waiting for manual reviewer override.
              </p>
            </div>

            <div className="flex gap-1.5 bg-gray-950 p-1 rounded border border-gray-850 text-xs">
              <button
                onClick={() => setActiveReviewTab('PENDING')}
                className={`px-3 py-1 rounded transition font-medium ${activeReviewTab === 'PENDING' ? 'bg-gray-850 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Pending Overrides
              </button>
              <button
                onClick={() => setActiveReviewTab('REVIEWED')}
                className={`px-3 py-1 rounded transition font-medium ${activeReviewTab === 'REVIEWED' ? 'bg-gray-850 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Completed Reviews
              </button>
            </div>
          </div>

          <div className="table-wrap">
            {reviews.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-12">
                No cases found in this section.
              </div>
            ) : (
              <table className="text-xs">
                <thead>
                  <tr>
                    <th>Enqueued Time</th>
                    <th>Demographics</th>
                    <th>Model Output</th>
                    <th>Review Notes</th>
                    {activeReviewTab === 'PENDING' ? (
                      <th className="text-right">Actions</th>
                    ) : (
                      <th>Resolved Details</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((item) => {
                    const timeStr = new Date(item.enqueued_at).toLocaleString();
                    return (
                      <tr key={item.review_id} className="hover:bg-gray-900/10">
                        <td className="font-mono text-gray-400 max-w-[130px]">{timeStr}</td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            {Object.entries(item.protected_attribute_values).map(([k, v]) => (
                              <span key={k}>
                                <span className="text-gray-500 capitalize">{k}:</span>{' '}
                                <span className="font-medium text-gray-200">{v}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-0.5">
                            <div>
                              <span className="text-gray-500">Prediction:</span>{' '}
                              <span className="font-mono font-semibold text-rose-400">
                                {item.model_raw_response?.[sentinel?.config.prediction_field || 'prediction'] || 'rejected'}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono scale-95 origin-left">
                              ID: {item.review_id.slice(0, 8)}...
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[220px]">
                          {activeReviewTab === 'PENDING' ? (
                            <input
                              type="text"
                              className="input text-xs py-1 px-2 w-full max-w-[200px]"
                              placeholder="Optional review notes..."
                              value={reviewerNotes[item.review_id] || ''}
                              onChange={(e) =>
                                setReviewerNotes((prev) => ({
                                  ...prev,
                                  [item.review_id]: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <div className="text-gray-400 italic font-sans max-w-[200px] break-words">
                              {item.reviewer_notes || '—'}
                            </div>
                          )}
                        </td>
                        {activeReviewTab === 'PENDING' ? (
                          <td className="text-right">
                            <div className="inline-flex gap-1.5">
                              <button
                                onClick={() => handleResolveReview(item.review_id, 'APPROVED')}
                                disabled={resolvingId !== null}
                                className="btn btn-sm bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 inline-flex items-center gap-1"
                              >
                                {resolvingId === item.review_id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Check size={12} />
                                )}{' '}
                                Approve Override
                              </button>
                              <button
                                onClick={() => handleResolveReview(item.review_id, 'REJECTED')}
                                disabled={resolvingId !== null}
                                className="btn btn-sm bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 inline-flex items-center gap-1"
                              >
                                {resolvingId === item.review_id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <X size={12} />
                                )}{' '}
                                Reject Override
                              </button>
                            </div>
                          </td>
                        ) : (
                          <td>
                            <div className="flex flex-col gap-0.5">
                              <div>
                                Decision:{' '}
                                <span
                                  className={`font-semibold ${
                                    item.final_decision === 'APPROVED' ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {item.final_decision}
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-500">
                                By {item.reviewed_by} on{' '}
                                {item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString() : '—'}
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
