'use client';

import TopNav from '@/components/layout/TopNav';
import { Settings as SettingsIcon, User, Building2, Key, Bell, ToggleLeft, ToggleRight, Shield, Globe } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const [benchOptIn, setBenchOptIn] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [explainMode, setExplainMode] = useState(false);

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]} />
      <div className="flex-1 p-5 space-y-3 animate-fade-in">
        <h1 className="text-lg font-bold">Settings</h1>

        <div className="grid grid-cols-2 gap-3">
          {/* Organization */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={14} style={{ color: 'var(--primary)' }} /> Organization
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>Name</label>
              <input className="input" defaultValue="VisionAI Org" />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>Industry</label>
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
            <div className="flex items-center gap-2 text-sm font-semibold">
              <User size={14} style={{ color: 'var(--accent)' }} /> Profile
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>Display Name</label>
              <input className="input" defaultValue="Pratham Dusane" />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>Email</label>
              <input className="input" defaultValue="pratham@visionai.app" disabled style={{ opacity: 0.6 }} />
            </div>
          </div>

          {/* API Keys */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Key size={14} style={{ color: 'var(--warning)' }} /> API Keys
            </div>
            <div className="px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
              <code className="text-xs" style={{ color: 'var(--muted)' }}>vai_live_••••••••••••</code>
              <span className="badge badge-pass">Active</span>
            </div>
            <button className="btn btn-secondary btn-sm"><Key size={12} /> Generate New Key</button>
          </div>

          {/* Toggles */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SettingsIcon size={14} style={{ color: 'var(--primary)' }} /> Preferences
            </div>
            <Toggle label="Sector Benchmarking" sub="Share anonymized scores" icon={Globe} on={benchOptIn} onToggle={() => setBenchOptIn(!benchOptIn)} />
            <Toggle label="Email Notifications" sub="Get alerts on drift" icon={Bell} on={emailNotifs} onToggle={() => setEmailNotifs(!emailNotifs)} />
            <Toggle label="Explain My Rejection" sub="Enable public explanation URLs" icon={Shield} on={explainMode} onToggle={() => setExplainMode(!explainMode)} />
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
          <div className="text-[10px]" style={{ color: 'var(--placeholder)' }}>{sub}</div>
        </div>
      </div>
      <button onClick={onToggle} className="cursor-pointer" style={{ color: on ? 'var(--primary)' : 'var(--border-light)' }}>
        {on ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
      </button>
    </div>
  );
}
