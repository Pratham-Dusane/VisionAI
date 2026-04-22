'use client';

import { CanonicalDimensionKey } from '@/lib/analysis/dimensions';

interface DimensionPillToggleProps {
  options: Array<{ key: CanonicalDimensionKey; label: string }>;
  selectedKey: CanonicalDimensionKey | null;
  onChange: (key: CanonicalDimensionKey) => void;
}

export default function DimensionPillToggle({ options, selectedKey, onChange }: DimensionPillToggleProps) {
  if (options.length === 0) return null;

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Distribution dimension selector">
        {options.map((option) => {
          const active = selectedKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary-dim)' : 'var(--surface)',
                color: active ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
