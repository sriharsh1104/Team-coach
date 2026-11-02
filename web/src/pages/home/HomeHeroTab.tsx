type Props = {
  onOpenTab: (tab: 'tournaments') => void;
};

export function HomeHeroTab({ onOpenTab }: Props) {
  return (
    <section className="landing-hero">
      <p className="landing-eyebrow">Competitive Free Fire org</p>
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
        <button
          type="button"
          className="landing-cta-ghost"
          onClick={() => onOpenTab('tournaments')}
        >
          Tournament entry
        </button>
      </div>
    </section>
  );
}
