export function TournamentsTab() {
  return (
    <section className="landing-section landing-tab-panel">
      <h2>Tournament participation</h2>
      <p className="landing-section-lead">
        How Sacred fields teams — pick the lane that fits you.
      </p>
      <div className="tour-grid">
        <article className="tour-item">
          <h3>Org roster</h3>
          <p>
            Full Sacred lineup for official brackets. Fixed roles, scrim
            blocks, and coach-led prep before every Bo set.
          </p>
        </article>
        <article className="tour-item">
          <h3>Guest / collab slot</h3>
          <p>
            Short-term fills for invitational cups. Discord ping + tryout
            custom — then you ride with Sacred for that event only.
          </p>
        </article>
        <article className="tour-item">
          <h3>Open tryout</h3>
          <p>
            Climb into the org. Show consistency across customs, callouts, and
            discipline — then we lock a role on the roster.
          </p>
        </article>
      </div>
      <a
        className="landing-cta-ghost"
        href="mailto:sacredesportsss@gmail.com?subject=Sacred%20Esports%20%E2%80%94%20Tournament%20/%20Tryout"
      >
        Apply for tryouts
      </a>
    </section>
  );
}
