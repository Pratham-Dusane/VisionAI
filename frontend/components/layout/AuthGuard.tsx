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
        <div className="card w-full max-w-sm space-y-4">
          <div className="skeleton" style={{ width: '42%', height: 12 }} />
          <div className="skeleton" style={{ width: '68%', height: 22 }} />
          <div className="space-y-2">
            <div className="skeleton" style={{ width: '100%', height: 12 }} />
            <div className="skeleton" style={{ width: '84%', height: 12 }} />
          </div>
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
