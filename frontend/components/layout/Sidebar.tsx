'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  PlusCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

type NavIconName = 'dashboard' | 'drift' | 'reports' | 'settings';

const NAV_GROUPS = [
  {
    title: 'Core',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' as NavIconName },
    ]
  },
  {
    title: 'Monitoring',
    items: [
      { label: 'Drift Monitor', href: '/drift', icon: 'drift' as NavIconName },
      { label: 'Reports', href: '/reports', icon: 'reports' as NavIconName },
    ]
  },
  {
    title: 'Administration',
    items: [
      { label: 'Settings', href: '/settings', icon: 'settings' as NavIconName },
    ]
  }
];

function NavIcon({ type, active }: { type: NavIconName; active: boolean }) {
  const strokeWidth = active ? 2 : 1.85;

  if (type === 'dashboard') {
    return (
      <svg className="sidebar-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth={strokeWidth} fill="var(--icon-fill)" />
        <rect x="13" y="3.5" width="7.5" height="5" rx="2" stroke="currentColor" strokeWidth={strokeWidth} fill="none" />
        <rect x="13" y="10.5" width="7.5" height="10" rx="2" stroke="currentColor" strokeWidth={strokeWidth} fill="var(--icon-fill)" />
        <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth={strokeWidth} fill="none" />
      </svg>
    );
  }

  if (type === 'drift') {
    return (
      <svg className="sidebar-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 16.5L8.5 11L12 14L18.5 7.5L20 9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8.5" cy="11" r="1.8" fill="var(--icon-fill)" stroke="currentColor" strokeWidth={1.2} />
        <circle cx="12" cy="14" r="1.8" fill="none" stroke="currentColor" strokeWidth={1.2} />
        <circle cx="18.5" cy="7.5" r="1.8" fill="var(--icon-fill)" stroke="currentColor" strokeWidth={1.2} />
      </svg>
    );
  }

  if (type === 'reports') {
    return (
      <svg className="sidebar-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3.5H14.5L19 8V20.5H7V3.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" fill="none" />
        <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
        <rect x="9.5" y="10.5" width="7" height="1.7" rx="0.85" fill="var(--icon-fill)" />
        <rect x="9.5" y="14" width="5.5" height="1.7" rx="0.85" fill="var(--icon-fill)" />
      </svg>
    );
  }

  return (
    <svg className="sidebar-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" r="3" fill="var(--icon-fill)" stroke="currentColor" strokeWidth={1.2} />
      <path d="M12 4.5V2.5M12 21.5V19.5M4.5 12H2.5M21.5 12H19.5M17.4 6.6L18.8 5.2M5.2 18.8L6.6 17.4M6.6 6.6L5.2 5.2M18.8 18.8L17.4 17.4" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" />
    </svg>
  );
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, signOutUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/login');
  };

  const initials = getInitials(user?.displayName, user?.email);
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const orgName = org?.name || 'No Organization';
  const showLabels = mobileOpen || !collapsed;

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-[60] lg:hidden w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(3, 8, 18, 0.5)' }}
          aria-label="Close menu overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed z-50 flex flex-col transition-all duration-300 left-3 top-3 bottom-3 rounded-2xl w-[84vw] max-w-[272px] lg:left-4 lg:top-4 lg:bottom-4 lg:rounded-3xl ${
          mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0 lg:translate-x-0 lg:opacity-100'
        } ${collapsed ? 'lg:w-[64px]' : 'lg:w-[232px]'}`}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[64px] shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary)' }}
        >
          <Eye size={15} color="#FFFFFF" strokeWidth={2.5} />
        </div>
        {showLabels && (
          <span className="text-sm font-bold tracking-wide sidebar-logo-scan">
            <span style={{ color: 'var(--logo-primary)' }}>Vision</span>
            <span style={{ color: 'var(--logo-secondary)' }}>AI</span>
          </span>
        )}
      </div>

      {/* Compose Button */}
      <div className="px-3 py-4">
        <Link
          href="/audit/new"
          data-tour="new-audit"
          className={`flex items-center gap-3 w-full bg-white transition-shadow shadow-sm hover:shadow-md border border-border-light text-primary font-semibold ${
            showLabels ? 'px-4 py-3.5 rounded-2xl' : 'justify-center p-3 rounded-2xl'
          }`}
          style={{ background: 'var(--surface)' }}
        >
          <PlusCircle size={20} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
          {showLabels && <span>New Audit</span>}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto" data-tour="sidebar">
        {NAV_GROUPS.map((group, groupIdx) => (
          <div key={group.title} className={groupIdx > 0 ? 'mt-4' : ''}>
            {showLabels && (
              <div className="px-5 mb-1 text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--placeholder)' }}>
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-nav-link ${active ? 'is-active' : ''} flex items-center gap-3 mx-2 mb-1 rounded-full transition-all duration-200 group ${
                    showLabels ? 'px-4 py-3' : 'justify-center px-0 py-2.5'
                  }`}
                  style={{
                    background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                    ['--icon-fill' as string]: active ? 'color-mix(in srgb, var(--primary) 52%, transparent)' : 'transparent',
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  <NavIcon type={item.icon} active={active} />
                  {showLabels && (
                    <span className="text-[13px] font-medium">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
        {/* User */}
        <div className={`flex items-center gap-2.5 py-3 ${showLabels ? 'px-2' : 'justify-center'}`}>
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
              style={{ background: 'var(--avatar-gradient)', color: '#FFFFFF' }}
            >
              {initials}
            </div>
          )}
          {showLabels && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate" style={{ color: 'var(--fg)' }}>{displayName}</div>
              <div className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{orgName}</div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`w-full flex items-center gap-2 mb-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
            showLabels ? 'px-3' : 'justify-center'
          }`}
          style={{ color: 'var(--muted)' }}
          id="theme-toggle-btn"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          {showLabels && <span className="text-[11px]">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>}
        </button>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className={`w-full flex items-center gap-2 mb-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
            showLabels ? 'px-3' : 'justify-center'
          }`}
          style={{ color: 'var(--muted)' }}
          id="sign-out-btn"
        >
          <LogOut size={14} />
          {showLabels && <span className="text-[11px]">Sign Out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`hidden lg:flex w-full items-center justify-center gap-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
            collapsed ? '' : 'px-3'
          }`}
          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!collapsed && <span className="text-[11px]">Collapse</span>}
        </button>
      </div>
      </aside>
    </>
  );
}
