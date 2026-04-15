'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  PlusCircle,
  TrendingUp,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'New Audit', href: '/audit/new', icon: PlusCircle },
  { label: 'Drift Monitor', href: '/drift', icon: TrendingUp },
  { label: 'Reports', href: '/reports', icon: FileText },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, signOutUser } = useAuth();

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/login');
  };

  const initials = getInitials(user?.displayName, user?.email);
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const orgName = org?.name || 'No Organization';

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[60px]' : 'w-[220px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, #0D1117 0%, #0B0E14 100%)',
        borderRight: '1px solid #2A3040',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[52px] shrink-0" style={{ borderBottom: '1px solid #2A3040' }}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #3EC1D3, #FF9A00)' }}
        >
          <Eye size={15} color="#0B0E14" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide">
            <span style={{ color: '#3EC1D3' }}>Vision</span>
            <span style={{ color: '#FF9A00' }}>AI</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 mx-2 mb-0.5 rounded-lg transition-all duration-200 group ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              }`}
              style={{
                background: active ? 'rgba(62, 193, 211, 0.1)' : 'transparent',
                color: active ? '#3EC1D3' : '#8892A5',
                borderLeft: active && !collapsed ? '3px solid #3EC1D3' : '3px solid transparent',
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              {!collapsed && (
                <span className="text-[13px] font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-3" style={{ borderTop: '1px solid #2A3040' }}>
        {/* User */}
        <div className={`flex items-center gap-2.5 py-3 ${collapsed ? 'justify-center' : 'px-2'}`}>
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="Avatar"
              className="w-8 h-8 rounded-full shrink-0 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #FF165D, #FF9A00)', color: '#0B0E14' }}
            >
              {initials}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground truncate">{displayName}</div>
              <div className="text-[10px] truncate" style={{ color: '#8892A5' }}>{orgName}</div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className={`w-full flex items-center gap-2 mb-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
            collapsed ? 'justify-center' : 'px-3'
          }`}
          style={{ color: '#8892A5' }}
          id="sign-out-btn"
        >
          <LogOut size={14} />
          {!collapsed && <span className="text-[11px]">Sign Out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-full flex items-center justify-center gap-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
            collapsed ? '' : 'px-3'
          }`}
          style={{ background: '#141820', color: '#8892A5' }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!collapsed && <span className="text-[11px]">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
