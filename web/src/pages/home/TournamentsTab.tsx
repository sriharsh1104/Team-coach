export function TournamentsTab() {
  return (
    <section className="landing-section landing-tab-panel">
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

      <div className="tour-extra">
        <article className="tour-panel">
          <h3>What We Provide</h3>
          <ul className="tour-points">
            <li>Coach checks player stats, practice, and weak points to improve</li>
            <li>Everyday scrims slot</li>
            <li>Mentor for player moral support</li>
            <li>Analyst for map analysis</li>
            <li>Tournament registration</li>
          </ul>
        </article>

        <article className="tour-panel">
          <h3>Requirement</h3>
          <ul className="tour-points">
            <li>Clear the tryout first</li>
            <li>Join the Sacred guild</li>
            <li>Set your in-game name starting with SES-</li>
            <li>Join the Sacred Discord</li>
            <li>Share at least 5 clips from your YouTube or Instagram</li>
          </ul>
        </article>
      </div>

      <a
        className="landing-cta"
        href="https://discord.gg/mUES4kcAE"
        target="_blank"
        rel="noopener noreferrer"
      >
        Apply for tryouts
      </a>
    </section>
  );
}
