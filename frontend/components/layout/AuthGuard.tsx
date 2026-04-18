'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, org, loading, orgLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || orgLoading) return;
    if (!user) {
      router.replace('/login');
    } else if (!org) {
      router.replace('/onboarding');
    }
  }, [user, org, loading, orgLoading, router]);

  // Show loading state
  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="login-spinner" />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render children if not authed
  if (!user || !org) {
    return null;
  }

  return <>{children}</>;
}
