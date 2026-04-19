'use client';

import { Scale, Code2, Briefcase } from 'lucide-react';

export type StakeholderMode = 'technical' | 'executive' | 'legal';

const OPTIONS: Array<{
  key: StakeholderMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { key: 'technical', label: 'Technical', icon: Code2 },
  { key: 'executive', label: 'Executive', icon: Briefcase },
  { key: 'legal', label: 'Legal', icon: Scale },
];

export default function StakeholderToggle({
  value,
  onChange,
}: {
  value: StakeholderMode;
  onChange: (mode: StakeholderMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-xl p-1"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            style={{
              background: active ? 'var(--primary-dim)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Icon size={13} /> {option.label}
          </button>
        );
      })}
    </div>
  );
}
