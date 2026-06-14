'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import TopNav from '@/components/layout/TopNav';
import { 
  Database, 
  Settings, 
  Play, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Activity, 
  HelpCircle,
  RefreshCw,
  Plus
} from 'lucide-react';

interface FeatureStoreReg {
  id: string;
  store_type: 'vertex' | 'feast' | 'rest';
  connection_config: {
    project?: string;
    location?: string;
    featurestore_id?: string;
    entity_type_id?: string;
    entity_ids?: string[];
    feast_server_url?: string;
    feature_service_name?: string;
    endpoint?: string;
    headers?: Record<string, string>;
    response_data_key?: string;
  };
  protected_cols: string[];
  label_col: string;
  positive_label: string;
  polling_interval_hours: number;
  is_mock: boolean;
  last_polled: string | null;
  last_di_worst: number;
  status: 'active' | 'error' | 'paused';
  created_at: string;
}

export default function FeatureStoresPage() {
  const { org } = useAuth();
  const [registrations, setRegistrations] = useState<FeatureStoreReg[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Form states
  const [storeType, setStoreType] = useState<'vertex' | 'feast' | 'rest'>('vertex');
  const [pollingInterval, setPollingInterval] = useState<number>(1);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [protectedCols, setProtectedCols] = useState<string>('age, gender, race');
  const [labelCol, setLabelCol] = useState<string>('loan_approved');
  const [positiveLabel, setPositiveLabel] = useState<string>('1');

  // Type-specific inputs
  const [project, setProject] = useState('');
  const [location, setLocation] = useState('asia-south1');
  const [featurestoreId, setFeaturestoreId] = useState('');
  const [entityTypeId, setEntityTypeId] = useState('');
  const [entityIdsStr, setEntityIdsStr] = useState('app_1, app_2, app_3');

  const [feastUrl, setFeastUrl] = useState('http://localhost:6566');
  const [feastService, setFeastService] = useState('loan_features');

  const [restEndpoint, setRestEndpoint] = useState('https://api.example.com/v1/features');
  const [restHeaders, setRestHeaders] = useState('{"Authorization": "Bearer token"}');
  const [restDataKey, setRestDataKey] = useState('data');

  // Action status states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [pollStatusMessage, setPollStatusMessage] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    if (org?.id) {
      loadFeatureStores();
    }
  }, [org]);

  async function loadFeatureStores() {
    if (!org?.id) return;
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE}/api/feature-stores/${org.id}`);
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data);
      }
    } catch (err) {
      console.error('Failed to load registrations:', err);
    } finally {
      setLoadingList(false);
    }
  }

  function getCleanedConfig() {
    const entityIds = entityIdsStr
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    let config: any = {};
    if (storeType === 'vertex') {
      config = {
        project: project.trim() || undefined,
        location: location.trim() || undefined,
        featurestore_id: featurestoreId.trim() || undefined,
        entity_type_id: entityTypeId.trim() || undefined,
        entity_ids: entityIds.length ? entityIds : undefined
      };
    } else if (storeType === 'feast') {
      config = {
        feast_server_url: feastUrl.trim() || undefined,
        feature_service_name: feastService.trim() || undefined,
        entity_ids: entityIds.length ? entityIds : undefined
      };
    } else if (storeType === 'rest') {
      let headersObj = {};
      try {
        if (restHeaders.trim()) {
          headersObj = JSON.parse(restHeaders);
        }
      } catch {
        // Fallback
      }
      config = {
        endpoint: restEndpoint.trim() || undefined,
        headers: headersObj,
        response_data_key: restDataKey.trim() || undefined
      };
    }
    return config;
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const config = getCleanedConfig();
      const cols = protectedCols.split(',').map(c => c.trim()).filter(Boolean);
      
      const payload = {
        store_type: storeType,
        connection_config: config,
        protected_cols: cols,
        label_col: labelCol.trim(),
        positive_label: positiveLabel.trim(),
        is_mock: isMock
      };

      const res = await fetch(`${API_BASE}/api/feature-stores/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setTestResult({
          status: 'success',
          message: data.message
        });
      } else {
        setTestResult({
          status: 'error',
          message: data.detail || data.message || 'Connection test failed.'
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: err.message || 'Network error occurred.'
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleRegisterStore(e: React.FormEvent) {
    e.preventDefault();
    if (!org?.id) return;
    
    setSaving(true);
    setSaveMessage(null);
    try {
      const config = getCleanedConfig();
      const cols = protectedCols.split(',').map(c => c.trim()).filter(Boolean);

      const payload = {
        org_id: org.id,
        store_type: storeType,
        connection_config: config,
        protected_cols: cols,
        label_col: labelCol.trim(),
        positive_label: positiveLabel.trim(),
        polling_interval_hours: pollingInterval,
        is_mock: isMock
      };

      const res = await fetch(`${API_BASE}/api/feature-stores/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSaveMessage({
          type: 'success',
          text: 'Feature store registered and activated successfully!'
        });
        // Clear forms
        setProject('');
        setFeaturestoreId('');
        setEntityTypeId('');
        // Reload list
        loadFeatureStores();
      } else {
        setSaveMessage({
          type: 'error',
          text: data.detail || 'Registration failed.'
        });
      }
    } catch (err: any) {
      setSaveMessage({
        type: 'error',
        text: err.message || 'Registration failed.'
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStore(id: string) {
    if (!confirm('Are you sure you want to remove this feature store registration? This stops all polling.')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/feature-stores/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadFeatureStores();
      }
    } catch (err) {
      console.error('Failed to delete registration:', err);
    }
  }

  async function handlePollNow(id: string) {
    setPollingId(id);
    setPollStatusMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/feature-stores/${id}/poll-now`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setPollStatusMessage(`Poll success! Lowest DI Score: ${data.worstDi.toFixed(3)}`);
        loadFeatureStores();
      } else {
        setPollStatusMessage(`Poll failed: ${data.detail || 'check logs'}`);
      }
    } catch (err: any) {
      setPollStatusMessage(`Poll failed: ${err.message}`);
    } finally {
      // Clear poll message after 5 seconds
      setTimeout(() => {
        setPollStatusMessage(null);
        setPollingId(null);
      }, 5000);
    }
  }

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Feature Stores' }]} />
      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="page-title mb-1 flex items-center gap-2">
              <Database size={24} style={{ color: 'var(--primary)' }} />
              Feature Store Monitoring
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Enable live bias monitoring on Vertex AI, Feast, or custom API endpoints without manual file uploads.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-pass flex items-center gap-1.5 py-1 px-3.5">
              <Activity size={12} className="animate-pulse" /> Live Monitoring Active
            </span>
          </div>
        </div>

        {/* Dynamic Poll Status Feedback */}
        {pollStatusMessage && (
          <div className="p-3 rounded-xl border flex items-center gap-3 animate-slide-up" 
               style={{ 
                 background: pollStatusMessage.includes('success') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                 borderColor: pollStatusMessage.includes('success') ? 'var(--pass)' : 'var(--error)' 
               }}>
            {pollStatusMessage.includes('success') ? (
              <CheckCircle size={16} style={{ color: 'var(--pass)' }} />
            ) : (
              <AlertTriangle size={16} style={{ color: 'var(--error)' }} />
            )}
            <span className="text-xs font-medium" style={{ color: 'var(--fg)' }}>{pollStatusMessage}</span>
          </div>
        )}

        {/* Main Workspaces Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Registration Form (Left Panel 5 columns) */}
          <div className="xl:col-span-5 card space-y-4">
            <div className="card-title flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <Plus size={16} style={{ color: 'var(--primary)' }} />
              <span>Register Feature Store</span>
            </div>

            <form onSubmit={handleRegisterStore} className="space-y-4">
              
              {/* Feature Store Type */}
              <div>
                <label className="label-text block mb-1.5" style={{ color: 'var(--muted)' }}>Feature Store Provider</label>
                <select 
                  className="select w-full"
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value as any)}
                >
                  <option value="vertex">Vertex AI Feature Store (GCP)</option>
                  <option value="feast">Feast (Self-Hosted)</option>
                  <option value="rest">Generic REST API Endpoint</option>
                </select>
              </div>

              {/* Dynamic Connection Configuration */}
              <div className="p-4 rounded-2xl border space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--placeholder)' }}>
                  Connection Settings
                </span>

                {storeType === 'vertex' && (
                  <div className="space-y-3">
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>GCP Project ID</label>
                      <input 
                        className="input text-sm" 
                        value={project}
                        onChange={(e) => setProject(e.target.value)}
                        placeholder="e.g. visionai-prod-aea95"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Location / Region</label>
                      <input 
                        className="input text-sm" 
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g. asia-south1"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Feature Store ID</label>
                      <input 
                        className="input text-sm" 
                        value={featurestoreId}
                        onChange={(e) => setFeaturestoreId(e.target.value)}
                        placeholder="e.g. loan_fs"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Entity Type ID</label>
                      <input 
                        className="input text-sm" 
                        value={entityTypeId}
                        onChange={(e) => setEntityTypeId(e.target.value)}
                        placeholder="e.g. applicant"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs flex items-center justify-between" style={{ color: 'var(--muted)' }}>
                        <span>Entity ID List (Sample)</span>
                        <span className="cursor-help" title="Comma-separated IDs of rows to query for bias snapshot">
                          <HelpCircle size={12} />
                        </span>
                      </label>
                      <input 
                        className="input text-sm" 
                        value={entityIdsStr}
                        onChange={(e) => setEntityIdsStr(e.target.value)}
                        placeholder="e.g. app_1, app_2, app_3"
                        required
                      />
                    </div>
                  </div>
                )}

                {storeType === 'feast' && (
                  <div className="space-y-3">
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Feast Server URL</label>
                      <input 
                        className="input text-sm" 
                        value={feastUrl}
                        onChange={(e) => setFeastUrl(e.target.value)}
                        placeholder="e.g. http://localhost:6566"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Feature Service Name</label>
                      <input 
                        className="input text-sm" 
                        value={feastService}
                        onChange={(e) => setFeastService(e.target.value)}
                        placeholder="e.g. credit_service"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Entity ID List (Sample)</label>
                      <input 
                        className="input text-sm" 
                        value={entityIdsStr}
                        onChange={(e) => setEntityIdsStr(e.target.value)}
                        placeholder="e.g. app_1, app_2"
                        required
                      />
                    </div>
                  </div>
                )}

                {storeType === 'rest' && (
                  <div className="space-y-3">
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Endpoint URL</label>
                      <input 
                        className="input text-sm" 
                        value={restEndpoint}
                        onChange={(e) => setRestEndpoint(e.target.value)}
                        placeholder="e.g. https://api.example.com/v1/features"
                        disabled={isMock}
                        required={!isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Auth Headers (JSON)</label>
                      <textarea 
                        className="input text-sm font-mono h-16 py-1.5" 
                        value={restHeaders}
                        onChange={(e) => setRestHeaders(e.target.value)}
                        placeholder='{"Authorization": "Bearer key"}'
                        disabled={isMock}
                      />
                    </div>
                    <div>
                      <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Response Data Key</label>
                      <input 
                        className="input text-sm" 
                        value={restDataKey}
                        onChange={(e) => setRestDataKey(e.target.value)}
                        placeholder="e.g. data"
                        disabled={isMock}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* General Settings */}
              <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <label className="label-text block mb-1 text-xs flex items-center justify-between" style={{ color: 'var(--muted)' }}>
                    <span>Protected Attributes to Monitor</span>
                  </label>
                  <input 
                    className="input text-sm" 
                    value={protectedCols}
                    onChange={(e) => setProtectedCols(e.target.value)}
                    placeholder="e.g. age, gender, race"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Label Column</label>
                    <input 
                      className="input text-sm" 
                      value={labelCol}
                      onChange={(e) => setLabelCol(e.target.value)}
                      placeholder="e.g. loan_approved"
                      required
                    />
                  </div>
                  <div>
                    <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Positive Label Value</label>
                    <input 
                      className="input text-sm" 
                      value={positiveLabel}
                      onChange={(e) => setPositiveLabel(e.target.value)}
                      placeholder="e.g. 1"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label-text block mb-1 text-xs" style={{ color: 'var(--muted)' }}>Bias Scan Interval</label>
                  <select 
                    className="select text-sm w-full"
                    value={pollingInterval}
                    onChange={(e) => setPollingInterval(Number(e.target.value))}
                  >
                    <option value={1}>Every 1 hour</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={24}>Daily (Every 24 hours)</option>
                  </select>
                </div>

                {/* Mock mode toggle */}
                <div className="flex items-center gap-2 py-1">
                  <input 
                    type="checkbox" 
                    id="mockMode" 
                    checked={isMock}
                    onChange={(e) => setIsMock(e.target.checked)}
                    className="checkbox"
                  />
                  <label htmlFor="mockMode" className="text-xs select-none cursor-pointer" style={{ color: 'var(--muted)' }}>
                    Enable Mock Connection Mode (Generates mock data for verification)
                  </label>
                </div>
              </div>

              {/* Validation Alert */}
              {testResult && (
                <div className="p-3 rounded-xl border text-xs" 
                     style={{ 
                       background: testResult.status === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                       borderColor: testResult.status === 'success' ? 'var(--pass)' : 'var(--error)'
                     }}>
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    {testResult.status === 'success' ? (
                      <>
                        <CheckCircle size={14} style={{ color: 'var(--pass)' }} /> Connection Validated
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} style={{ color: 'var(--error)' }} /> Connection Error
                      </>
                    )}
                  </div>
                  <div style={{ color: 'var(--muted)' }} className="break-all">{testResult.message}</div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || saving}
                  className="btn btn-outline flex-1 text-xs py-2"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={saving || testing}
                  className="btn btn-primary flex-1 text-xs py-2"
                >
                  {saving ? 'Saving...' : 'Save & Activate'}
                </button>
              </div>

              {saveMessage && (
                <div className={`text-xs text-center font-medium mt-2 ${saveMessage.type === 'success' ? 'text-[var(--pass)]' : 'text-[var(--error)]'}`}>
                  {saveMessage.text}
                </div>
              )}

            </form>
          </div>

          {/* Registrations List Table (Right Panel 7 columns) */}
          <div className="xl:col-span-7 card space-y-4">
            <div className="card-title flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <Settings size={16} style={{ color: 'var(--accent)' }} />
              <span>Registered Connection Snapshots</span>
            </div>

            {loadingList ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Loading registrations...</span>
              </div>
            ) : registrations.length === 0 ? (
              <div className="text-center py-16 text-xs space-y-2" style={{ color: 'var(--placeholder)' }}>
                <Database size={32} className="mx-auto opacity-40 mb-1" />
                <div>No feature stores registered yet.</div>
                <div>Add connection details on the left to start automatic scans.</div>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="py-2.5 px-3" style={{ color: 'var(--muted)' }}>Provider</th>
                      <th className="py-2.5 px-3" style={{ color: 'var(--muted)' }}>Polling</th>
                      <th className="py-2.5 px-3" style={{ color: 'var(--muted)' }}>Last Scan</th>
                      <th className="py-2.5 px-3 text-center" style={{ color: 'var(--muted)' }}>DI Worst</th>
                      <th className="py-2.5 px-3 text-center" style={{ color: 'var(--muted)' }}>Status</th>
                      <th className="py-2.5 px-3 text-right" style={{ color: 'var(--muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((item) => {
                      const worstDi = item.last_di_worst;
                      const hasDrift = worstDi < 0.8;
                      const displayDate = item.last_polled 
                        ? new Date(item.last_polled).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                        : 'Never';
                      
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--surface-2)] transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-semibold block capitalize">{item.store_type} Store</span>
                            <span className="text-[10px]" style={{ color: 'var(--placeholder)' }}>
                              {item.is_mock ? 'Mock Mode' : (
                                item.store_type === 'vertex' 
                                  ? `${item.connection_config.project}/${item.connection_config.featurestore_id}`
                                  : item.store_type === 'feast'
                                    ? item.connection_config.feature_service_name
                                    : 'REST Endpoint'
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            Every {item.polling_interval_hours} hr
                          </td>
                          <td className="py-3 px-3">
                            {displayDate}
                          </td>
                          <td className="py-3 px-3 text-center font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              hasDrift 
                                ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            }`}>
                              {worstDi !== null ? worstDi.toFixed(3) : '1.000'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`badge ${
                              item.status === 'active' ? 'badge-pass' : 'badge-fail'
                            } capitalize`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handlePollNow(item.id)}
                                disabled={pollingId === item.id}
                                className="btn btn-outline p-1.5 rounded-lg border-border-light hover:bg-[var(--surface-3)] transition-colors flex items-center justify-center"
                                title="Run Polling Scan Now"
                              >
                                <Play size={12} className={pollingId === item.id ? 'animate-spin' : ''} />
                              </button>
                              <button
                                onClick={() => handleDeleteStore(item.id)}
                                className="btn btn-ghost p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors flex items-center justify-center"
                                title="Delete Registration"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>

        </div>

      </div>
    </>
  );
}
