'use client';

import TopNav from '@/components/layout/TopNav';
import { listSentinels, createSentinel, deleteSentinel } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Shield, ShieldAlert, ShieldCheck, Loader2, Plus, ArrowRight, ExternalLink, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SentinelConfigData {
  sentinel_id: string;
  org_id: string;
  model_name: string;
  target_endpoint: string;
  status: 'PROVISIONING' | 'ACTIVE' | 'FAILED';
  sentinel_url?: string;
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
}

export default function SentinelListPage() {
  const router = useRouter();
  const { org, orgLoading } = useAuth();

  const [sentinels, setSentinels] = useState<SentinelConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states
  const [modelName, setModelName] = useState('');
  const [targetEndpoint, setTargetEndpoint] = useState('');
  const [targetAuthHeader, setTargetAuthHeader] = useState('');
  const [protectedAttrs, setProtectedAttrs] = useState('gender,race');
  const [predictionField, setPredictionField] = useState('prediction');
  const [positiveValue, setPositiveValue] = useState('approved');
  const [privilegedValues, setPrivilegedValues] = useState('{"gender":"Male","race":"White"}');
  const [rollingWindowSize, setRollingWindowSize] = useState(1000);
  const [diThreshold, setDiThreshold] = useState(0.8);
  const [minDecisions, setMinDecisions] = useState(50);
  const [evalInterval, setEvalInterval] = useState(30);
  const [breakerMode, setBreakerMode] = useState<'shadow' | 'intercept' | 'block_all'>('intercept');
  const [alertWebhook, setAlertWebhook] = useState('');

  const loadSentinelsList = async () => {
    if (!org?.id) return;
    try {
      setLoading(true);
      setError('');
      const data = await listSentinels(org.id);
      setSentinels(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load sentinels.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sentinelId: string) => {
    if (!confirm('Are you sure you want to delete this Sentinel proxy? This will clean up all associated configuration, breaker states, and review queue histories.')) {
      return;
    }
    
    try {
      setDeletingId(sentinelId);
      setError('');
      await deleteSentinel(sentinelId);
      await loadSentinelsList();
    } catch (err: any) {
      setError(err.message || 'Failed to delete sentinel.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!orgLoading && org?.id) {
      loadSentinelsList();
    }
  }, [org?.id, orgLoading]);

  const handlePrefillDemo = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || window.location.origin.replace(':3000', ':8000');
    setModelName('Demo Lending Model');
    setTargetEndpoint(`${apiBase}/api/mock-predict`);
    setTargetAuthHeader('');
    setProtectedAttrs('gender');
    setPredictionField('prediction');
    setPositiveValue('approved');
    setPrivilegedValues('{"gender":"Male"}');
    setRollingWindowSize(100);
    setDiThreshold(0.8);
    setMinDecisions(50);
    setEvalInterval(30);
    setBreakerMode('intercept');
    setAlertWebhook('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id) return;

    setSubmitting(true);
    setError('');

    try {
      const parsedProtected = protectedAttrs
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      let parsedPrivileged = {};
      try {
        parsedPrivileged = JSON.parse(privilegedValues);
      } catch (jsonErr) {
        throw new Error('Invalid Privileged Group Values JSON structure. Format must be: {"gender":"Male"}');
      }

      await createSentinel(org.id, {
        model_name: modelName,
        target_endpoint: targetEndpoint,
        target_auth_header: targetAuthHeader || null,
        protected_attributes: parsedProtected,
        prediction_field: predictionField,
        positive_prediction_value: positiveValue,
        privileged_group_values: parsedPrivileged,
        rolling_window_size: Number(rollingWindowSize),
        di_threshold: Number(diThreshold),
        min_decisions_before_trip: Number(minDecisions),
        evaluation_interval_seconds: Number(evalInterval),
        breaker_mode: breakerMode,
        alert_webhook_url: alertWebhook || null,
      });

      setShowCreateDrawer(false);
      // reset form
      setModelName('');
      setTargetEndpoint('');
      setTargetAuthHeader('');
      setProtectedAttrs('gender,race');
      setPredictionField('prediction');
      setPositiveValue('approved');
      setPrivilegedValues('{"gender":"Male","race":"White"}');
      setRollingWindowSize(1000);
      setDiThreshold(0.8);
      setMinDecisions(50);
      setEvalInterval(30);
      setBreakerMode('intercept');
      setAlertWebhook('');

      await loadSentinelsList();
    } catch (err: any) {
      setError(err.message || 'Failed to create sentinel proxy.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={12} /> Active
          </span>
        );
      case 'PROVISIONING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Loader2 size={12} className="animate-spin" /> Provisioning
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert size={12} /> Failed
          </span>
        );
    }
  };

  const maskUrl = (url: string) => {
    if (url.length <= 35) return url;
    return `${url.slice(0, 20)}...${url.slice(-12)}`;
  };

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Sentinel Proxy' }]} />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">VisionAI Sentinel Proxy</h1>
            <p className="text-sm text-gray-400">
              Inference-time active intervention and agentic circuit breakers for production model endpoints.
            </p>
          </div>
          <button
            onClick={() => setShowCreateDrawer(true)}
            className="btn btn-primary inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus size={16} /> Deploy New Sentinel
          </button>
        </div>

        {error && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', background: 'var(--danger-dim)' }}>
            <div className="text-sm" style={{ color: 'var(--danger)' }}>{error}</div>
          </div>
        )}

        {loading ? (
          <div className="card flex items-center justify-center p-12 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={24} />
            Loading Sentinel deployments...
          </div>
        ) : sentinels.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center justify-center border-dashed border-gray-700">
            <Shield size={48} className="text-gray-500 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Sentinel Proxies Deployed</h3>
            <p className="text-sm text-gray-400 max-w-md mb-6">
              Sentinel intercepts your production model API calls, evaluates real-time fairness metrics using a sliding window, and intervenes if bias threshold is breached.
            </p>
            <button
              onClick={() => setShowCreateDrawer(true)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus size={16} /> Create Your First Proxy
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sentinels.map((sentinel) => (
              <div key={sentinel.sentinel_id} className="card flex flex-col justify-between hover:border-gray-600 transition-all">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-lg text-gray-100">{sentinel.model_name}</h3>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{sentinel.sentinel_id}</p>
                    </div>
                    {getStatusBadge(sentinel.status)}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Target Endpoint:</span>
                      <span className="text-gray-300 font-mono" title={sentinel.target_endpoint}>
                        {maskUrl(sentinel.target_endpoint)}
                      </span>
                    </div>
                    {sentinel.sentinel_url && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Proxy Gateway:</span>
                        <span className="text-primary font-mono select-all flex items-center gap-1">
                          {maskUrl(sentinel.sentinel_url)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Protected Attributes:</span>
                      <span className="text-gray-300 font-medium">
                        {sentinel.config.protected_attributes.join(', ')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">DI Threshold / Mode:</span>
                      <span className="text-gray-300 font-medium">
                        {sentinel.config.di_threshold} ({sentinel.config.breaker_mode})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end gap-2">
                  <button
                    onClick={() => handleDelete(sentinel.sentinel_id)}
                    disabled={deletingId === sentinel.sentinel_id}
                    className="btn btn-sm bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {deletingId === sentinel.sentinel_id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Delete
                  </button>
                  {sentinel.status === 'ACTIVE' && (
                    <button
                      onClick={() => router.push(`/sentinel/${sentinel.sentinel_id}`)}
                      className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
                    >
                      Monitor Live <ArrowRight size={14} />
                    </button>
                  )}
                  {sentinel.sentinel_url && (
                    <a
                      href={`${sentinel.sentinel_url}/_sentinel/health`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm bg-gray-800 hover:bg-gray-700 text-gray-300 inline-flex items-center gap-1"
                    >
                      Health <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Drawer Backdrop */}
        {showCreateDrawer && (
          <div className="fixed inset-0 bg-black/60 z-50 flex justify-end animate-fade-in">
            <div className="w-full max-w-2xl bg-gray-900 border-l border-gray-800 p-6 overflow-y-auto flex flex-col justify-between space-y-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Shield className="text-primary" /> Deploy Sentinel Proxy
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Configure your live model connection details and circuit breaker parameters. A new Cloud Run service will be provisioned.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label-text block mb-1">Model Name</label>
                      <input
                        type="text"
                        required
                        className="input"
                        placeholder="e.g. Loan Scoring Model v3"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">Target Model Endpoint</label>
                      <input
                        type="url"
                        required
                        className="input font-mono text-xs"
                        placeholder="https://live-endpoint.com/predict"
                        value={targetEndpoint}
                        onChange={(e) => setTargetEndpoint(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label-text block mb-1">Authorization Header (Optional)</label>
                      <input
                        type="text"
                        className="input font-mono text-xs"
                        placeholder="Bearer sk-..."
                        value={targetAuthHeader}
                        onChange={(e) => setTargetAuthHeader(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">Protected Attributes</label>
                      <input
                        type="text"
                        required
                        className="input"
                        placeholder="comma separated, e.g. gender,race"
                        value={protectedAttrs}
                        onChange={(e) => setProtectedAttrs(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="label-text block mb-1">Prediction Field</label>
                      <input
                        type="text"
                        required
                        className="input"
                        placeholder="e.g. prediction"
                        value={predictionField}
                        onChange={(e) => setPredictionField(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">Positive Label Value</label>
                      <input
                        type="text"
                        required
                        className="input"
                        placeholder="e.g. approved"
                        value={positiveValue}
                        onChange={(e) => setPositiveValue(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">Breaker Mode</label>
                      <select
                        className="input"
                        value={breakerMode}
                        onChange={(e) => setBreakerMode(e.target.value as any)}
                      >
                        <option value="intercept">Intercept (Flagged groups)</option>
                        <option value="shadow">Shadow (Monitoring only)</option>
                        <option value="block_all">Block All (Trip routes all to manual)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label-text block mb-1">Privileged Group Values (JSON Map)</label>
                    <textarea
                      required
                      className="input font-mono text-xs"
                      style={{ minHeight: 60 }}
                      placeholder='{"gender":"Male","race":"White"}'
                      value={privilegedValues}
                      onChange={(e) => setPrivilegedValues(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="label-text block mb-1">Window Size</label>
                      <input
                        type="number"
                        required
                        className="input"
                        value={rollingWindowSize}
                        onChange={(e) => setRollingWindowSize(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">DI Threshold</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="1.0"
                        required
                        className="input"
                        value={diThreshold}
                        onChange={(e) => setDiThreshold(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">Min Decisions</label>
                      <input
                        type="number"
                        required
                        className="input"
                        value={minDecisions}
                        onChange={(e) => setMinDecisions(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1">Eval Cycle (s)</label>
                      <input
                        type="number"
                        required
                        className="input"
                        value={evalInterval}
                        onChange={(e) => setEvalInterval(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label-text block mb-1">Slack/Alert Webhook URL (Optional)</label>
                      <input
                        type="url"
                        className="input font-mono text-xs"
                        placeholder="https://hooks.slack.com/services/..."
                        value={alertWebhook}
                        onChange={(e) => setAlertWebhook(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <div className="text-xs text-gray-500 mb-2">
                        Deployment will configure a VPC access connector targeting GCP Memorystore Redis.
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                    <button
                      type="button"
                      onClick={() => setShowCreateDrawer(false)}
                      className="btn btn-secondary"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePrefillDemo}
                      className="btn bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold"
                      disabled={submitting}
                    >
                      Demo
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary inline-flex items-center gap-1.5"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Provisioning...
                        </>
                      ) : (
                        <>Deploy Proxy</>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
