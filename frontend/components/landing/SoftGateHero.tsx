import { ArrowRight, Sparkles, Settings, Minus, Menu, Snowflake } from 'lucide-react';

interface SoftGateHeroProps {
  isExiting: boolean;
  isLoadingSession: boolean;
  destinationHint: string;
  onExplore: () => void;
}

export default function SoftGateHero({
  isExiting,
  isLoadingSession,
  destinationHint,
  onExplore,
}: SoftGateHeroProps) {
  return (
    <section className={`soft-gate-hero ${isExiting ? 'is-exiting' : ''}`}>
      {/* macOS-style window chrome: 3 dots + utility icons */}
      <div className="soft-gate-chrome">
        <div className="soft-gate-chrome-dots">
          <span className="soft-gate-dot dot-red" />
          <span className="soft-gate-dot dot-yellow" />
          <span className="soft-gate-dot dot-green" />
        </div>
        <div className="soft-gate-chrome-icons">
          <Settings size={13} strokeWidth={1.8} />
          <Minus size={13} strokeWidth={1.8} />
          <Menu size={13} strokeWidth={1.8} />
        </div>
      </div>

      <div className="soft-gate-hero-kicker">
        <Sparkles size={14} strokeWidth={2.2} />
        <span>Google Solutions 2026 | Build with AI Prototype</span>
      </div>

      <h1 className="soft-gate-hero-title font-visionai-hero">
        <span>VisionAI:</span>
        <span>
          Eradicate <em>Algorithmic Bias.</em>
        </span>
      </h1>

      <p className="soft-gate-hero-subtitle">
        Enterprise-grade inspection for high-stakes AI decisions.
      </p>

      <div className="soft-gate-hero-aesthetic-gap" aria-hidden="true" />

      <div className="soft-gate-hero-actions">
        <button
          type="button"
          className="soft-gate-hero-cta"
          onClick={onExplore}
          disabled={isLoadingSession || isExiting}
        >
          <span>{isLoadingSession ? 'Preparing Session...' : 'Explore Live Audit'}</span>
          <ArrowRight size={17} strokeWidth={2.4} />
        </button>

        <a href="/about" className="soft-gate-hero-cta-secondary" onClick={(e) => e.stopPropagation()}>
          Learn More
        </a>

        <p>{isLoadingSession ? 'Checking auth state...' : destinationHint}</p>
      </div>
    </section>
  );
}
