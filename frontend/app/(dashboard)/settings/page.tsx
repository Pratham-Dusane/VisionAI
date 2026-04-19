'use client';

import TopNav from '@/components/layout/TopNav';
import { Settings as SettingsIcon, User, Building2, Key, Bell, ToggleLeft, ToggleRight, Shield, Globe, Moon, Sun, LayoutTemplate, Rows3, Copy, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { createOrgApiKey, getOrgApiKeys, getOrgSettings, OrgApiKey, revokeOrgApiKey, updateOrgSettings } from '@/lib/api';

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function SettingsPage() {
  const { theme, toggleTheme, density, toggleDensity } = useTheme();
  const { org, orgLoading } = useAuth();
  const [benchOptIn, setBenchOptIn] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [explainMode, setExplainMode] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [apiKeys, setApiKeys] = useState<OrgApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(true);
  const [apiKeyLabel, setApiKeyLabel] = useState('CI/CD Key');
  const [newApiKey, setNewApiKey] = useState('');
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const [keyActionInFlight, setKeyActionInFlight] = useState(false);

  async function loadApiKeys(orgId: string) {
    setLoadingApiKeys(true);
    try {
      const data = await getOrgApiKeys(orgId);
      setApiKeys(data.apiKeys || []);
    } catch (error: unknown) {
      setApiKeyMessage(getErrorMessage(error, 'Unable to load API keys.'));
    } finally {
      setLoadingApiKeys(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!org || orgLoading) {
        setLoadingSettings(false);
        return;
      }

      try {
        const data = await getOrgSettings(org.id);
        if (!cancelled) {
          setBenchOptIn(Boolean(data.settings.benchmarking_opt_in));
          setEmailNotifs(Boolean(data.settings.email_notifications));
          setExplainMode(Boolean(data.settings.explain_rejection_enabled));
          await loadApiKeys(org.id);
        }
      } catch {
        if (!cancelled) {
          setSaveMessage('Unable to fetch settings from API, using local defaults.');
        }
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    }

    loadSettings();
    return () => { cancelled = true; };
  }, [org, orgLoading]);

  async function savePreferences() {
    if (!org) return;
    try {
      await updateOrgSettings(org.id, {
        benchmarking_opt_in: benchOptIn,
        email_notifications: emailNotifs,
        explain_rejection_enabled: explainMode,
      });
      setSaveMessage('Preferences saved.');
    } catch (error: unknown) {
      setSaveMessage(getErrorMessage(error, 'Failed to save preferences.'));
    }
  }

  async function generateApiKey() {
    if (!org || keyActionInFlight) return;
    setKeyActionInFlight(true);
    setApiKeyMessage('');
    setNewApiKey('');

    try {
      const created = await createOrgApiKey(org.id, apiKeyLabel);
      setNewApiKey(created.apiKey);
      setApiKeyMessage('New API key generated. Copy it now; this is the only time the full key is shown.');
      await loadApiKeys(org.id);
    } catch (error: unknown) {
      setApiKeyMessage(getErrorMessage(error, 'Failed to generate API key.'));
    } finally {
      setKeyActionInFlight(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!org || keyActionInFlight) return;
    setKeyActionInFlight(true);
    setApiKeyMessage('');

    try {
      await revokeOrgApiKey(org.id, keyId);
      setApiKeyMessage('API key revoked.');
      await loadApiKeys(org.id);
    } catch (error: unknown) {
      setApiKeyMessage(getErrorMessage(error, 'Failed to revoke API key.'));
    } finally {
      setKeyActionInFlight(false);
    }
  }

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setApiKeyMessage(successMessage);
    } catch {
      setApiKeyMessage('Copy failed. Please copy manually.');
    }
  }

  const explainTemplate = typeof window !== 'undefined'
    ? `${window.location.origin}/explain/{auditId}/{rowIndex}`
    : '/explain/{auditId}/{rowIndex}';

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]} />
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
        <h1 className="page-title mb-2">Settings</h1>

        <div className="grid grid-cols-2 gap-6">
          {/* Organization */}
          <div className="card space-y-3">
            <div className="card-title flex items-center gap-2 mb-4">
              <Building2 size={14} style={{ color: 'var(--primary)' }} /> Organization
            </div>
            <div>
              <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Name</label>
              <input className="input" defaultValue={org?.name || 'VisionAI Org'} />
            </div>
            <div>
              <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Industry</label>
              <select className="select w-full" defaultValue="Technology">
                <option>Technology</option>
                <option>Finance</option>
                <option>Healthcare</option>
                <option>Government</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm">Save Changes</button>
          </div>

          {/* Profile */}
          <div className="card space-y-3">
            <div className="card-title flex items-center gap-2 mb-4">
              <User size={14} style={{ color: 'var(--accent)' }} /> Profile
            </div>
            <div>
              <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Display Name</label>
              <input className="input" defaultValue="Pratham Dusane" />
            </div>
            <div>
              <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Email</label>
              <input className="input" defaultValue="pratham@visionai.app" disabled style={{ opacity: 0.6 }} />
            </div>
          </div>

          {/* API Keys */}
          <div className="card space-y-3">
            <div className="card-title flex items-center gap-2 mb-4">
              <Key size={14} style={{ color: 'var(--warning)' }} /> API Keys
            </div>

            {newApiKey && (
              <div className="p-3 rounded-lg border" style={{ background: 'var(--surface-2)', borderColor: 'var(--warning)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--warning)' }}>Copy this key now (shown only once)</div>
                <div className="text-xs break-all" style={{ color: 'var(--muted)' }}>{newApiKey}</div>
                <button className="btn btn-outline btn-sm mt-2" onClick={() => copyToClipboard(newApiKey, 'New API key copied to clipboard.')}>
                  <Copy size={12} /> Copy Key
                </button>
              </div>
            )}

            <div>
              <label className="label-text block mb-2" style={{ color: 'var(--muted)' }}>Key Label</label>
              <input
                className="input"
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
                placeholder="CI/CD Key"
              />
            </div>

            <button className="btn btn-outline btn-sm" onClick={generateApiKey} disabled={!org || keyActionInFlight}>
              <Key size={12} /> {keyActionInFlight ? 'Processing...' : 'Generate New Key'}
            </button>

            {loadingApiKeys ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading keys...</div>
            ) : apiKeys.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>No keys yet. Generate one for CI/CD integration.</div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((item) => (
                  <div key={item.keyId} className="px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{item.label}</div>
                      <div className="text-xs font-mono" style={{ color: 'var(--placeholder)' }}>{item.masked}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={item.active ? 'badge badge-pass' : 'badge'}>{item.active ? 'Active' : 'Revoked'}</span>
                      {item.active && (
                        <button className="btn btn-ghost btn-sm" onClick={() => revokeKey(item.keyId)} disabled={keyActionInFlight}>
                          <Trash2 size={12} /> Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {apiKeyMessage && <div className="text-xs" style={{ color: 'var(--muted)' }}>{apiKeyMessage}</div>}
          </div>

          {/* Appearance */}
          <div className="card space-y-3">
            <div className="card-title flex items-center gap-2 mb-4">
              <LayoutTemplate size={14} style={{ color: 'var(--primary)' }} /> Appearance
            </div>
            <Toggle label="Dark Mode" sub="Toggle dark theme" icon={theme === 'dark' ? Moon : Sun} on={theme === 'dark'} onToggle={toggleTheme} />
            <Toggle label="Compact View" sub="Increase data density" icon={Rows3} on={density === 'compact'} onToggle={toggleDensity} />
          </div>

          {/* Toggles */}
          <div className="card space-y-3">
            <div className="card-title flex items-center gap-2 mb-4">
              <SettingsIcon size={14} style={{ color: 'var(--primary)' }} /> Preferences
            </div>
            {loadingSettings ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading preferences...</div>
            ) : (
              <>
                <Toggle label="Sector Benchmarking" sub="Share anonymized scores" icon={Globe} on={benchOptIn} onToggle={() => setBenchOptIn(!benchOptIn)} />
                <Toggle label="Email Notifications" sub="Get alerts on drift" icon={Bell} on={emailNotifs} onToggle={() => setEmailNotifs(!emailNotifs)} />
                <Toggle label="Explain My Rejection" sub="Enable public explanation URLs" icon={Shield} on={explainMode} onToggle={() => setExplainMode(!explainMode)} />
                <button className="btn btn-primary btn-sm" onClick={savePreferences} disabled={!org}>Save Preferences</button>
                {saveMessage && <div className="text-xs" style={{ color: 'var(--muted)' }}>{saveMessage}</div>}
              </>
            )}
            {explainMode && (
              <div className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Shareable Explanation URL Template</div>
                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{explainTemplate}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Toggle({ label, sub, icon: Icon, on, onToggle }: { label: string; sub: string; icon: React.ElementType; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color: 'var(--muted)' }} />
        <div>
          <div className="text-sm">{label}</div>
          <div className="text-xs" style={{ color: 'var(--placeholder)' }}>{sub}</div>
        </div>
      </div>
      <button onClick={onToggle} className="cursor-pointer" style={{ color: on ? 'var(--primary)' : 'var(--border-light)' }}>
        {on ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
      </button>
    </div>
  );
}
