'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Shield, Brain, Zap, Eye, BarChart3, FileText,
  ChevronDown, ChevronUp, Menu, X, Upload, Search, Target,
  MoveRight,
} from 'lucide-react';

/* ===== DATA ===== */
const NAV_LINKS = [
  { label: 'Benefits', href: '#benefits' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

const BENEFITS = [
  { icon: Shield, title: 'Real-Time Bias Detection', desc: 'Catch disparate impact across age, gender, and race before your model reaches production.' },
  { icon: Brain, title: 'Gemini-Powered Narratives', desc: 'AI-generated compliance reports tailored to EU AI Act, EEOC, and RBI frameworks.' },
  { icon: Zap, title: 'Counterfactual Testing', desc: 'Flip-test every protected attribute to find the minimum change that alters a decision.' },
  { icon: Eye, title: 'Proxy Variable Detection', desc: 'Automatically detect hidden features that may encode discriminatory patterns.' },
  { icon: BarChart3, title: 'Drift Monitoring', desc: 'Track fairness score changes over time with continuous bias observability.' },
  { icon: FileText, title: 'Enterprise Compliance', desc: 'Export PDF audit trails and anonymized legal JSON for regulatory submissions.' },
];

const STEPS = [
  { num: '01', icon: Upload, title: 'Upload', desc: 'Upload your dataset (CSV) and optionally a model file (.pkl / .joblib) for full analysis.' },
  { num: '02', icon: Search, title: 'Analyze', desc: 'VisionAI runs 12+ fairness tests - disparate impact, equalized odds, proxy detection, and more.' },
  { num: '03', icon: Target, title: 'Act', desc: 'Get severity scores, remediation paths, and one-click compliance reports ready for regulators.' },
];

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    desc: 'For teams exploring AI fairness.',
    features: ['5 audits per month', 'Basic fairness scoring', 'CSV dataset upload', 'Disparate impact analysis', 'Community support'],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₹9,500',
    period: '/mo',
    desc: 'For teams shipping AI to production.',
    features: ['50 audits per month', 'Gemini AI narratives', 'Model bias testing', 'Drift monitoring', 'PDF & legal export', 'Priority support'],
    cta: 'Start Pro Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '₹19,500',
    period: '/mo',
    desc: 'For regulated industries at scale.',
    features: ['Unlimited audits', 'All Pro features', 'Counterfactual flip testing', 'Proxy variable detection', 'Custom compliance frameworks', 'Dedicated support & SLA'],
    cta: 'Contact Sales',
    highlight: false,
  },
];

const COST_BREAKDOWN = [
  { component: 'API & Orchestration', stack: 'Cloud Run + Tasks', cost: '₹4,500' },
  { component: 'AI Report & Reasoning', stack: 'Gemini + Vertex AI', cost: '₹5,600' },
  { component: 'Dataset & Artifact Storage', stack: 'Cloud Storage', cost: '₹900' },
  { component: 'Audit Metadata & App State', stack: 'Firestore', cost: '₹1,400' },
  { component: 'Drift Analytics & History', stack: 'BigQuery', cost: '₹2,200' },
];

const FAQS = [
  { q: 'What data formats does VisionAI support?', a: 'VisionAI accepts CSV datasets for data-level fairness analysis. For model-level testing, upload a scikit-learn compatible model file (.pkl or .joblib). We support datasets up to 50,000 rows per audit.' },
  { q: 'How does the fairness score work?', a: 'The fairness score (0–100) is a composite metric derived from disparate impact ratios, equalized odds differences, proxy variable risk levels, and group imbalance severity across all protected attributes.' },
  { q: 'Is my data stored securely?', a: 'Yes. All datasets are stored in Google Cloud Storage with encryption at rest. Audit metadata lives in Firestore with strict IAM rules. We never share or sell your data.' },
  { q: 'Can I use VisionAI without a model file?', a: 'Absolutely. Data-only audits analyze your dataset for disparate impact, group distribution imbalance, proxy variables, and schema sensitivity - no model required.' },
  { q: 'What compliance frameworks does VisionAI support?', a: 'VisionAI generates reports aligned with the EU AI Act, US EEOC guidelines, and RBI fair lending requirements.' },
];

const TECH_LOGOS = [
  { name: 'React', src: '/logos/React-icon.svg.png' },
  { name: 'Next.js', src: '/logos/nextjs.jpg' },
  { name: 'Firebase', src: '/logos/firebase.png' },
  { name: 'Google Cloud', src: '/logos/googlecloud.jpg' },
  { name: 'Cloud Run', src: '/logos/cloudrun.webp' },
  { name: 'Vertex AI', src: '/logos/VERTEX_AI_logo.svg.png' },
  { name: 'Gemini', src: '/logos/gemini.png' },
  { name: 'BigQuery', src: '/logos/BigQuery-Logo.webp' },
  { name: 'Python', src: '/logos/python.png' },
];

/* ===== PAGE ===== */
export default function AboutPage() {
  const [mobileNav, setMobileNav] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="about-page">
      {/* ===== NAVBAR ===== */}
      <nav className="about-nav">
        <div className="about-nav-inner">
          <Link href="/" className="about-nav-logo font-visionai-hero">VisionAI</Link>
          <div className="about-nav-links">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="about-nav-link">{l.label}</a>
            ))}
          </div>
          <div className="about-nav-actions">
            <Link href="/login" className="about-nav-link">Sign In</Link>
            <Link href="/login" className="about-nav-cta">Start Free Audit <ArrowRight size={14} /></Link>
          </div>
          <button className="about-nav-hamburger" onClick={() => setMobileNav(!mobileNav)}>
            {mobileNav ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {mobileNav && (
          <div className="about-nav-mobile">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="about-nav-link" onClick={() => setMobileNav(false)}>{l.label}</a>
            ))}
            <Link href="/login" className="about-nav-cta" onClick={() => setMobileNav(false)}>Start Free Audit</Link>
          </div>
        )}
      </nav>

      {/* ===== HERO - Maximalist typography + geometric visual ===== */}
      <section className="about-hero">
        <div className="about-hero-inner">
          <div className="about-hero-content">
            <h1 className="about-hero-title font-visionai-hero">
              Eradicate<br />
              Algorithmic Bias.
            </h1>
            <p className="about-hero-desc">
              VisionAI is the audit-as-a-service platform that detects bias
              in your AI models and datasets - powered by Google Cloud
              and Gemini AI.
            </p>
            <div className="about-hero-actions">
              <Link href="/login" className="about-hero-cta-primary">
                Start Free Audit <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className="about-hero-cta-secondary">
                See How It Works
              </a>
            </div>
          </div>
          <div className="about-hero-visual" aria-hidden="true">
            {/* Colorful gradient blobs */}
            <div className="about-geo-accent about-geo-accent-1" />
            <div className="about-geo-accent about-geo-accent-2" />
            <div className="about-geo-accent about-geo-accent-3" />
            
            {/* Overlapping wireframes SVG matching reference */}
            <svg viewBox="0 0 500 500" className="about-hero-wireframes" style={{ color: '#1B2B4A' }}>
              <defs>
                <pattern id="dot-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.5" fill="currentColor" opacity="0.4" />
                </pattern>
                <linearGradient id="pane-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="white" stopOpacity="0.05" />
                </linearGradient>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </marker>
              </defs>

              {/* Dot Grids */}
              <rect x="120" y="220" width="60" height="80" fill="url(#dot-grid)" transform="rotate(-15 150 260)" />
              <rect x="360" y="240" width="60" height="80" fill="url(#dot-grid)" transform="rotate(10 390 280)" />

              {/* Back Right Pane */}
              <g className="wireframe-2">
                <rect x="260" y="90" width="160" height="200" rx="16" stroke="currentColor" strokeWidth="2.5" fill="url(#pane-grad)" transform="rotate(12 340 190)" />
              </g>

              {/* Bottom Horizontal Pane */}
              <g className="wireframe-3">
                <rect x="140" y="240" width="260" height="140" rx="20" stroke="currentColor" strokeWidth="2.5" fill="url(#pane-grad)" transform="rotate(-18 270 310)" />
                <path d="M 120 280 L 220 330" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
              </g>
              
              {/* Front Left Vertical Pane */}
              <g className="wireframe-1">
                <rect x="110" y="160" width="110" height="180" rx="16" stroke="currentColor" strokeWidth="2.5" fill="url(#pane-grad)" transform="rotate(-8 165 250)" />
                <path d="M 215 200 L 290 150" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
              </g>

              {/* Decorative Elements */}
              <circle cx="340" cy="60" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
              <circle cx="160" cy="130" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              <circle cx="260" cy="280" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
              
              <text x="180" y="90" fill="currentColor" fontSize="20" fontFamily="monospace" fontWeight="bold">{'{'}</text>
              <text x="430" y="230" fill="currentColor" fontSize="18" fontFamily="monospace" fontWeight="bold">{'</>'}</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ===== TECH STACK MARQUEE ===== */}
      <section className="about-marquee-section">
        <p className="about-marquee-label">Built on Google Cloud & Open-Source Infrastructure</p>
        <div className="about-marquee-track">
          <div className="about-marquee-content">
            {[...TECH_LOGOS, ...TECH_LOGOS].map((logo, i) => (
              <img key={i} src={logo.src} alt={logo.name} className="about-marquee-logo" />
            ))}
          </div>
        </div>
      </section>

      {/* ===== BENEFITS - 3x2 Bento Grid ===== */}
      <section id="benefits" className="about-section">
        <div className="section-blob section-blob-blue" style={{ top: '10%', right: '0%' }} />
        <div className="about-section-content">
          <h2 className="about-section-title font-visionai-hero">
            Everything you need to<br /><em>ship fair AI.</em>
          </h2>
          <p className="about-section-sub">From detection to compliance - one platform, zero excuses.</p>
          <div className="about-bento-grid">
            {BENEFITS.map((b) => (
              <div key={b.title} className="about-bento-card">
                <div className="about-bento-icon"><b.icon size={24} strokeWidth={1.8} /></div>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="about-section about-section-alt">
        <div className="section-blob section-blob-green" style={{ bottom: '10%', left: '0%' }} />
        <div className="about-section-content">
          <h2 className="about-section-title font-visionai-hero">How It Works</h2>
          <p className="about-section-sub">Get started in 3 simple steps.</p>
          <div className="about-steps">
            {STEPS.map((step, i) => (
              <div key={step.num} className="about-step-wrap">
                <div className="about-step">
                  <div className="about-step-num">{step.num}</div>
                  <div className="about-step-icon"><step.icon size={28} strokeWidth={1.6} /></div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="about-step-arrow">
                    <MoveRight size={28} strokeWidth={1.6} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="about-section">
        <div className="section-blob section-blob-pink" style={{ top: '30%', right: '5%' }} />
        <div className="about-section-content">
          <h2 className="about-section-title font-visionai-hero">Transparent Pricing</h2>
          <p className="about-section-sub">Designed to be affordable for Indian startups, NGOs, and enterprises.</p>
          <div className="about-pricing-grid">
            {PRICING_TIERS.map((tier) => (
              <div key={tier.name} className={`about-pricing-card ${tier.highlight ? 'about-pricing-highlight' : ''}`}>
                {tier.highlight && <span className="about-pricing-badge">Most Popular</span>}
                <h3>{tier.name}</h3>
                <div className="about-pricing-price">
                  <span className="about-pricing-amount">{tier.price}</span>
                  {tier.period && <span className="about-pricing-period">{tier.period}</span>}
                </div>
                <p className="about-pricing-desc">{tier.desc}</p>
                <ul>{tier.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                <Link href="/login" className={`about-pricing-cta ${tier.highlight ? 'primary' : ''}`}>{tier.cta}</Link>
              </div>
            ))}
          </div>
          <div className="about-cost-breakdown">
            <h4>Infrastructure Cost Breakdown (Enterprise Tier)</h4>
            <div className="about-cost-table-wrap">
              <table className="about-cost-table">
                <thead><tr><th>Component</th><th>Stack</th><th>Est. Monthly Cost</th></tr></thead>
                <tbody>
                  {COST_BREAKDOWN.map((row) => (
                    <tr key={row.component}><td>{row.component}</td><td>{row.stack}</td><td className="about-cost-value">{row.cost}</td></tr>
                  ))}
                  <tr className="about-cost-total"><td colSpan={2}>Total (Estimate)</td><td className="about-cost-value">₹19,500/mo</td></tr>
                </tbody>
              </table>
            </div>
            <p className="about-cost-note">Based on 200 audits/month, 50K rows/audit average. Powered by GCP Always-Free quotas.</p>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="about-section about-section-alt">
        <div className="section-blob section-blob-blue" style={{ top: '5%', left: '10%' }} />
        <div className="about-section-content">
          <h2 className="about-section-title font-visionai-hero">Frequently Asked Questions</h2>
          <div className="about-faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className={`about-faq-item ${openFaq === i ? 'is-open' : ''}`}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="about-faq-q">
                  <span>{faq.q}</span>
                  {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {openFaq === i && <div className="about-faq-a">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="about-final-cta">
        <div className="about-final-cta-glow" aria-hidden="true" />
        <h2 className="font-visionai-hero">Ready to audit your AI<br />for bias?</h2>
        <p>Join the companies building fairer AI systems with VisionAI.</p>
        <Link href="/login" className="about-hero-cta-primary">Start Free Audit <ArrowRight size={16} /></Link>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="about-footer">
        <div className="about-footer-inner">
          <div className="about-footer-brand">
            <span className="about-footer-logo font-visionai-hero">VisionAI</span>
            <p>Developed for Google Solutions 2026 - Build with AI Hackathon</p>
            <p>A prototype submission.</p>
          </div>
          <div className="about-footer-links">
            <h4>Product</h4>
            {NAV_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
          </div>
          <div className="about-footer-links">
            <h4>Platform</h4>
            <Link href="/login">Sign In</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
          <div className="about-footer-links">
            <h4>Team</h4>
            <a href="mailto:dusane.pratham@gmail.com">Pratham Dusane (Lead)</a>
            <a href="mailto:lakaresamruddhi1@gmail.com">Samruddhi Lakare</a>
          </div>
        </div>
        <div className="about-footer-bottom">
          <span>© 2026 VisionAI. Google Solutions Challenge Prototype.</span>
        </div>
      </footer>
    </div>
  );
}
