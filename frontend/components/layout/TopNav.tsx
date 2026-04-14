'use client';

import { Bell, Search } from 'lucide-react';
import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function TopNav({ breadcrumbs = [] }: { breadcrumbs?: BreadcrumbItem[] }) {
  return (
    <header
      className="h-[52px] flex items-center justify-between px-5 shrink-0 sticky top-0 z-40"
      style={{
        background: 'rgba(11, 14, 20, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #2A3040',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        {breadcrumbs.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span style={{ color: '#353D4F' }}>/</span>}
            {item.href ? (
              <Link href={item.href} className="transition-colors" style={{ color: '#8892A5' }}>
                {item.label}
              </Link>
            ) : (
              <span className="font-medium" style={{ color: '#E8EAED' }}>{item.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#5A6478' }} />
          <input
            type="text"
            placeholder="Search audits..."
            className="input pl-8 text-xs"
            style={{ width: 180, padding: '6px 10px 6px 30px', background: '#141820' }}
          />
        </div>

        {/* Notification */}
        <button
          className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
          style={{ background: '#141820', border: '1px solid #2A3040' }}
        >
          <Bell size={15} style={{ color: '#8892A5' }} />
          <span
            className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
            style={{ background: '#FF165D', color: '#fff' }}
          >
            2
          </span>
        </button>
      </div>
    </header>
  );
}
