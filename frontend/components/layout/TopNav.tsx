'use client';

import { Bell, CheckCheck, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import {
  DriftNotification,
  getDriftNotificationCount,
  getDriftNotifications,
  markAllDriftNotificationsRead,
  markDriftNotificationRead,
} from '@/lib/api';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function TopNav({ breadcrumbs = [] }: { breadcrumbs?: BreadcrumbItem[] }) {
  const { org } = useAuth();
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<DriftNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      if (!org?.id) {
        setNotificationCount(0);
        return;
      }

      try {
        const data = await getDriftNotificationCount(org.id);
        if (!cancelled) {
          setNotificationCount(data.unread || 0);
        }
      } catch {
        if (!cancelled) {
          setNotificationCount(0);
        }
      }
    }

    loadCount();
    return () => {
      cancelled = true;
    };
  }, [org?.id]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!notificationRef.current) return;
      if (!notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function openNotifications() {
    if (!org?.id) return;
    setNotificationsOpen((prev) => !prev);
    if (!notificationsOpen) {
      setLoadingNotifications(true);
      try {
        const data = await getDriftNotifications(org.id);
        setNotifications(data.notifications || []);
        setNotificationCount(data.unread || 0);
      } finally {
        setLoadingNotifications(false);
      }
    }
  }

  async function onMarkRead(item: DriftNotification) {
    if (!org?.id || item.read) return;
    await markDriftNotificationRead(org.id, item.id);
    setNotifications((prev) => prev.map((entry) => (
      entry.id === item.id ? { ...entry, read: true } : entry
    )));
    setNotificationCount((prev) => Math.max(0, prev - 1));
  }

  async function onMarkAllRead() {
    if (!org?.id) return;
    await markAllDriftNotificationsRead(org.id);
    setNotifications((prev) => prev.map((entry) => ({ ...entry, read: true })));
    setNotificationCount(0);
  }

  return (
    <header
      className="h-[64px] flex items-center justify-between px-6 shrink-0 sticky top-0 z-40"
      style={{
        background: 'var(--topnav-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        {breadcrumbs.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span style={{ color: 'var(--border-light)' }}>/</span>}
            {item.href ? (
              <Link href={item.href} className="transition-colors" style={{ color: 'var(--muted)' }}>
                {item.label}
              </Link>
            ) : (
              <span className="font-medium" style={{ color: 'var(--fg)' }}>{item.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--placeholder)' }} />
          <input
            type="text"
            placeholder="Search audits..."
            className="input pl-8 text-xs"
            style={{ width: 180, padding: '6px 10px 6px 30px', background: 'var(--surface-2)' }}
          />
        </div>

        {/* Notification */}
        <div className="relative" ref={notificationRef}>
          <button
            className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            onClick={openNotifications}
          >
            <Bell size={15} style={{ color: 'var(--muted)' }} />
            {notificationCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-1 rounded-full text-[8px] font-bold flex items-center justify-center"
                style={{ background: 'var(--danger)', color: '#fff' }}
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div
              className="absolute right-0 mt-2 w-80 rounded-xl border shadow-xl p-3 z-50"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>Notifications</div>
                <button className="btn btn-outline btn-sm" onClick={onMarkAllRead}>
                  <CheckCheck size={12} /> Mark all read
                </button>
              </div>

              {loadingNotifications ? (
                <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="text-xs" style={{ color: 'var(--muted)' }}>No notifications yet.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left p-2 rounded-lg border transition-colors"
                      style={{
                        background: item.read ? 'var(--surface)' : 'var(--surface-2)',
                        borderColor: 'var(--border)',
                      }}
                      onClick={() => onMarkRead(item)}
                    >
                      <div className="text-xs font-semibold" style={{ color: 'var(--fg)' }}>{item.title || 'Notification'}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{item.message}</div>
                      <div className="text-[10px] mt-1" style={{ color: 'var(--placeholder)' }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
