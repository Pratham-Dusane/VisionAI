'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, SkipForward } from 'lucide-react';
import TOUR_STEPS from './tour-steps';

const TOUR_KEY = 'vai-tour-completed';

interface GuidedTourProps {
  forceStart?: boolean;
  onComplete?: () => void;
}

export default function GuidedTour({ forceStart, onComplete }: GuidedTourProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Only auto-start if forced (help button) - never auto-start on page load
  useEffect(() => {
    if (forceStart) {
      setStep(0);
      setActive(true);
    }
  }, [forceStart]);

  const updateRect = useCallback(() => {
    if (!active) return;
    const current = TOUR_STEPS[step];
    if (!current) return;
    const el = document.querySelector(current.target);
    if (el) {
      // Scroll into view first, then measure
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Delay measurement to let scroll finish
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setRect(r);
      }, 500);
    } else {
      // Fallback: Just put it in the center if element doesn't exist yet
      setRect(null);
    }
  }, [active, step]);

  useEffect(() => {
    updateRect();
    const onResize = () => {
      if (!active) return;
      const current = TOUR_STEPS[step];
      if (!current) return;
      const el = document.querySelector(current.target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateRect, active, step]);

  const finish = useCallback(() => {
    setActive(false);
    setRect(null);
    try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ }
    onComplete?.();
  }, [onComplete]);

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(step + 1);
    else finish();
  };
  const prev = () => { if (step > 0) setStep(step - 1); };

  if (!active) return null;

  const current = TOUR_STEPS[step];
  const pad = 8;

  // Tooltip position
  let tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 10002 };
  if (rect) {
    const pos = current.position;
    if (pos === 'bottom') {
      tooltipStyle.top = Math.min(rect.bottom + 14, window.innerHeight - 260);
      tooltipStyle.left = Math.max(180, Math.min(rect.left + rect.width / 2, window.innerWidth - 180));
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (pos === 'top') {
      tooltipStyle.bottom = Math.max(14, window.innerHeight - rect.top + 14);
      tooltipStyle.left = Math.max(180, Math.min(rect.left + rect.width / 2, window.innerWidth - 180));
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (pos === 'right') {
      tooltipStyle.top = Math.max(20, Math.min(rect.top + rect.height / 2, window.innerHeight - 200));
      tooltipStyle.left = Math.min(rect.right + 14, window.innerWidth - 340);
      tooltipStyle.transform = 'translateY(-50%)';
    } else {
      tooltipStyle.top = Math.max(20, Math.min(rect.top + rect.height / 2, window.innerHeight - 200));
      tooltipStyle.right = Math.max(14, window.innerWidth - rect.left + 14);
      tooltipStyle.transform = 'translateY(-50%)';
    }
  } else {
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <>
      {/* Overlay with spotlight cutout */}
      <div className="tour-overlay" onClick={finish}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - pad}
                  y={rect.top - pad}
                  width={rect.width + pad * 2}
                  height={rect.height + pad * 2}
                  rx={12}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
        </svg>

        {/* Spotlight ring */}
        {rect && (
          <div
            className="tour-spotlight"
            style={{
              position: 'fixed',
              left: rect.left - pad,
              top: rect.top - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2,
              borderRadius: 12,
              border: '2px solid var(--primary)',
              boxShadow: '0 0 0 4px var(--primary-dim), 0 0 24px rgba(26,115,232,0.3)',
              pointerEvents: 'none',
              zIndex: 10001,
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="tour-tooltip"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-tooltip-header">
          <span className="tour-tooltip-step">{step + 1} / {TOUR_STEPS.length}</span>
          <button className="tour-tooltip-close" onClick={finish}><X size={14} /></button>
        </div>
        <h4 className="tour-tooltip-title">{current.title}</h4>
        <p className="tour-tooltip-desc">{current.description}</p>
        <div className="tour-tooltip-actions">
          {step > 0 && (
            <button className="tour-tooltip-btn secondary" onClick={prev}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button className="tour-tooltip-btn skip" onClick={finish}>
            <SkipForward size={14} /> Skip
          </button>
          <button className="tour-tooltip-btn primary" onClick={next}>
            {step === TOUR_STEPS.length - 1 ? 'Done' : 'Next'} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
