const KPI_CARDS = [
  { label: 'Fairness Confidence', value: '92.4' },
  { label: 'Proxy Alerts', value: '03' },
  { label: 'Monitored Models', value: '27' },
];

const TREND_BARS = [26, 44, 38, 63, 54, 72, 69, 84, 78, 88];

const AUDIT_LOG = [
  { team: 'Hiring', status: 'Pass' },
  { team: 'Credit', status: 'Watchlist' },
  { team: 'Claims', status: 'Pass' },
  { team: 'Fraud', status: 'Review' },
];

export default function DashboardBackdropPreview() {
  return (
    <section className="soft-gate-preview" aria-hidden="true">
      <div className="soft-gate-preview-ambient soft-gate-preview-ambient-a" />
      <div className="soft-gate-preview-ambient soft-gate-preview-ambient-b" />

      <header className="soft-gate-preview-header">
        <div>
          <p className="soft-gate-preview-kicker">Bias Observatory</p>
          <p className="soft-gate-preview-brand">VisionAI Control Grid</p>
        </div>
        <div className="soft-gate-preview-pills">
          <span>Live</span>
          <span>24/7 Drift Watch</span>
        </div>
      </header>

      <div className="soft-gate-preview-layout">
        <article className="soft-gate-preview-panel soft-gate-preview-panel-main">
          <div className="soft-gate-preview-panel-head">
            <h2>System Fairness Pulse</h2>
            <span>Last 30 days</span>
          </div>

          <div className="soft-gate-preview-trend">
            {TREND_BARS.map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>

          <div className="soft-gate-preview-note-row">
            <p>Largest movement from demographic shift in regional approvals.</p>
            <p>Action confidence: 0.89</p>
          </div>
        </article>

        <aside className="soft-gate-preview-side">
          <div className="soft-gate-preview-kpi-grid">
            {KPI_CARDS.map((card) => (
              <article key={card.label} className="soft-gate-preview-kpi-card">
                <p>{card.label}</p>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>

          <article className="soft-gate-preview-log-card">
            <div className="soft-gate-preview-panel-head">
              <h3>Latest Audits</h3>
              <span>Realtime</span>
            </div>

            <ul>
              {AUDIT_LOG.map((item) => (
                <li key={item.team}>
                  <span>{item.team}</span>
                  <span>{item.status}</span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </div>
    </section>
  );
}
