import { TEAM_PLAYERS, formatInGameRole } from './teamPlayers';

export function TeamPlayersTab() {
  return (
    <section className="landing-section landing-tab-panel">
      <h2>Team players</h2>
      <p className="landing-section-lead">
        Sacred roster profiles — roles, IGNs, and how each player slots the
        pack.
      </p>

      <div className="player-grid">
        {TEAM_PLAYERS.map((p) => (
          <article key={p.id} className="player-card">
            <div className="player-avatar" aria-hidden="true">
              {p.ign.slice(0, 2).toUpperCase()}
            </div>
            <div className="player-body">
              <h3>{p.name}</h3>
              <p className="player-ign">{p.ign}</p>
              <p className="player-role">{p.role}</p>
              <div className="player-tags">
                {p.inGameRoles.map((r) => (
                  <span key={r} className="player-tag">
                    {formatInGameRole(r)}
                  </span>
                ))}
              </div>
              <p className="player-bio">{p.bio}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
