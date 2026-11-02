export function HomeHeroTab() {
  return (
    <section className="landing-hero">
      <p className="landing-eyebrow">Competitive Organisation</p>
      <h1 className="landing-title">Sacred Esports</h1>
      <p className="landing-lead">
        Improve every match. Perform as one. Download the team app, join
        tournaments, or reach the org for tryouts and partnerships.
      </p>
      <div className="landing-cta-row">
        <button type="button" className="landing-cta" disabled>
          Download Android APK
          <span className="landing-cta-soon">Coming soon</span>
        </button>
      </div>
    </section>
  );
}
