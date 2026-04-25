'use client';

import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Sparkles, AlertTriangle } from 'lucide-react';

interface JustifiedBiasBadgeProps {
  classification: 'HARMFUL' | 'JUSTIFIED' | 'API_ERROR';
  rationale: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * A stylish inline badge showing whether a detected bias is harmful
 * or a domain-appropriate statistical variance.
 *
 * Hover reveals a tooltip with the Gemini rationale.
 */
export default function JustifiedBiasBadge({
  classification,
  rationale,
  confidence,
}: JustifiedBiasBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<number | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);

  const isJustified = classification === 'JUSTIFIED';
  const isApiError = classification === 'API_ERROR';

  useEffect(() => {
    return () => {
      if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
    };
  }, []);

  const onEnter = () => {
    if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
    tooltipTimer.current = window.setTimeout(() => setShowTooltip(true), 280);
  };

  const onLeave = () => {
    if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
    tooltipTimer.current = window.setTimeout(() => setShowTooltip(false), 150);
  };

  const confidenceDot = confidence === 'HIGH'
    ? 'var(--success)'
    : confidence === 'MEDIUM'
      ? 'var(--status-warning)'
      : 'var(--muted)';

  let badgeBg = 'linear-gradient(135deg, rgba(255, 22, 93, 0.12), rgba(255, 22, 93, 0.06))';
  let badgeBorder = '1px solid rgba(255, 22, 93, 0.35)';
  let badgeColor = 'var(--danger)';

  if (isJustified) {
    badgeBg = 'linear-gradient(135deg, rgba(6, 214, 160, 0.12), rgba(6, 214, 160, 0.06))';
    badgeBorder = '1px solid rgba(6, 214, 160, 0.35)';
    badgeColor = 'var(--success)';
  } else if (isApiError) {
    badgeBg = 'linear-gradient(135deg, rgba(160, 160, 160, 0.12), rgba(160, 160, 160, 0.06))';
    badgeBorder = '1px solid rgba(160, 160, 160, 0.35)';
    badgeColor = 'var(--muted)';
  }

  return (
    <span
      ref={badgeRef}
      className="justified-bias-badge"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px 2px 6px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.02em',
        lineHeight: '16px',
        cursor: 'default',
        whiteSpace: 'nowrap',
        transition: 'all 0.2s ease',
        background: badgeBg,
        border: badgeBorder,
        color: badgeColor,
        backdropFilter: 'blur(4px)',
      }}
    >
      {isJustified ? (
        <ShieldCheck size={10} style={{ flexShrink: 0 }} />
      ) : isApiError ? (
        <AlertTriangle size={10} style={{ flexShrink: 0 }} />
      ) : (
        <ShieldAlert size={10} style={{ flexShrink: 0 }} />
      )}
      {isJustified ? 'Justified Variance' : isApiError ? 'API Error' : 'Harmful Bias'}

      {/* Tooltip */}
      {showTooltip && (
        <span
          className="justified-bias-tooltip"
          onMouseEnter={() => {
            if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
          }}
          onMouseLeave={onLeave}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 260,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.1)',
            zIndex: 100,
            whiteSpace: 'normal',
            cursor: 'default',
            animation: 'justified-tooltip-enter 0.18s ease-out',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
          }}>
            <Sparkles size={10} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--primary)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              Gemini Analysis
            </span>
            <span style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 9,
              color: 'var(--muted)',
            }}>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: confidenceDot,
                display: 'inline-block',
              }} />
              {confidence}
            </span>
          </div>
          <div style={{
            fontSize: 11,
            lineHeight: '16px',
            color: 'var(--fg)',
            fontWeight: 400,
          }}>
            {rationale}
          </div>
          {/* Arrow */}
          <span style={{
            position: 'absolute',
            bottom: -5,
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: 10,
            height: 10,
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }} />
        </span>
      )}
    </span>
  );
}
