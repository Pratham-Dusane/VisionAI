'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardBackdropPreview from '@/components/landing/DashboardBackdropPreview';
import SoftGateHero from '@/components/landing/SoftGateHero';
import { useAuth } from '@/lib/auth-context';

const MODAL_OUT_MS = 200;
const REVEAL_MS = 400;
const SOFT_GATE_ENTRY_KEY = 'vai-softgate-entry';

type ExitPhase = 'idle' | 'modal-out' | 'reveal';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [exitPhase, setExitPhase] = useState<ExitPhase>('idle');
  const modalTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (modalTimerRef.current !== null) {
      window.clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }

    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const destination = user ? '/dashboard' : '/login';
  const destinationHint = user
    ? 'Authenticated session detected. You will continue to dashboard.'
    : 'No active session detected. You will continue to login.';

  const isExiting = exitPhase !== 'idle';

  const startExitSequence = useCallback(() => {
    if (loading || isExiting) return;

    clearTimers();
    setExitPhase('modal-out');

    modalTimerRef.current = window.setTimeout(() => {
      setExitPhase('reveal');
    }, MODAL_OUT_MS);

    revealTimerRef.current = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(SOFT_GATE_ENTRY_KEY, '1');
      } catch {
        // Ignore storage errors and continue navigation.
      }
      router.push(destination);
    }, MODAL_OUT_MS + REVEAL_MS);
  }, [clearTimers, destination, isExiting, loading, router]);

  const handleBackdropClick = useCallback(() => {
    startExitSequence();
  }, [startExitSequence]);

  return (
    <main className={`soft-gate-root phase-${exitPhase}`} onClick={handleBackdropClick}>
      <div className="soft-gate-backdrop-layer">
        <DashboardBackdropPreview />
      </div>
      <div className="soft-gate-backdrop-mask" />

      <div className="soft-gate-hero-layer" onClick={(event) => event.stopPropagation()}>
        <SoftGateHero
          isExiting={isExiting}
          isLoadingSession={loading}
          destinationHint={destinationHint}
          onExplore={startExitSequence}
        />
      </div>
    </main>
  );
}
