'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type TabDef = {
  key: string;
  label: string;
  icon: React.ElementType;
};

interface AuditRightSidebarProps {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function AuditRightSidebar({ tabs, activeTab, onTabChange }: AuditRightSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <aside className={`right-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="right-sidebar-header">
          <span className="rs-title">Navigation</span>
          <button
            type="button"
            className="right-sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        <nav className="right-sidebar-nav">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={`rs-nav-item ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => onTabChange(t.key)}
                title={collapsed ? t.label : undefined}
              >
                <Icon size={14} />
                <span className="rs-nav-label">{t.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

