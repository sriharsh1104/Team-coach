import { TEAM_PLAYERS, TeamPlayer, formatInGameRole } from './teamPlayers';

function PlayerCard({ player }: { player: TeamPlayer }) {
  return (
    <article className="player-card">
      <div className="player-avatar" aria-hidden="true">
        {player.ign.slice(0, 2).toUpperCase()}
      </div>
      <div className="player-body">
        <h3>{player.ign}</h3>
        <p className="player-role">{player.role}</p>
        <div className="player-tags">
          {player.inGameRoles.map((r) => (
            <span key={r} className="player-tag">
              {formatInGameRole(r)}
            </span>
          ))}
        </div>
        <p className="player-bio">{player.bio}</p>
      </div>
    </article>
  );
}

export function TeamPlayersTab() {
  const mentor = TEAM_PLAYERS.find((p) => p.role === 'Mentor');
  const roster = TEAM_PLAYERS.filter((p) => p.role !== 'Mentor');

  return (
    <section className="landing-section landing-tab-panel roster-section">
      <div className="game-tags" role="tablist" aria-label="Game">
        <button
          type="button"
          className="game-tag active"
          role="tab"
          aria-selected="true"
        >
          Free Fire
        </button>
        <button type="button" className="game-tag" disabled>
          BGMI
          <span className="game-tag-soon">Coming soon</span>
        </button>
      </div>

      <div className="roster-layout">
        <div className="roster-block">
          <h3 className="roster-block-title">Roster</h3>
          <div className="player-grid">
            {roster.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
        </div>

        {mentor ? (
          <aside className="mentor-block">
            <h3 className="roster-block-title">Mentor</h3>
            <PlayerCard player={mentor} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
