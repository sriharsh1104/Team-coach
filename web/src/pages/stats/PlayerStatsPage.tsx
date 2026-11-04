import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as statsApi from '../../api/stats';
import * as usersApi from '../../api/users';
import { PlayerStatsDetail, STAT_MODES, StatMode } from '../../api/types';
import { SesLoader } from '../../ui/SesLoader';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

function kdRatio(kills: number, deaths: number) {
  if (deaths === 0) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

/** One player's K/D/A/damage totals and match history for a stat mode.
 * Mirrors mobile's PlayerStatsScreen. */
export function PlayerStatsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = (searchParams.get('mode') as StatMode | null) ?? 'BR';
  const [name, setName] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlayerStatsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    usersApi.getMemberProfile(userId).then((p) => setName(p.name)).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setError('Missing player id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    statsApi
      .getPlayerStats(userId, mode)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load player stats'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, mode]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{name ?? 'Player'} Stats</h1>
          <p>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Back
            </button>
          </p>
        </div>
      </div>
      <div className="content">
        <nav className="stats-mode-track" aria-label="Stats mode" role="tablist">
          {STAT_MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              role="tab"
              aria-selected={mode === item.mode}
              className={`stats-mode-chip${mode === item.mode ? ' active' : ''}`}
              onClick={() => setSearchParams({ mode: item.mode })}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {error ? <p className="error">{error}</p> : null}

        {loading ? (
          <SesLoader label="Loading stats" />
        ) : detail ? (
          <>
            <div className="stat-tile-row">
              <div className="stat-tile">
                <span className="muted">Kills</span>
                <strong>{detail.totals.kills}</strong>
              </div>
              <div className="stat-tile">
                <span className="muted">Deaths</span>
                <strong>{detail.totals.deaths}</strong>
              </div>
              <div className="stat-tile">
                <span className="muted">Assists</span>
                <strong>{detail.totals.assists}</strong>
              </div>
              <div className="stat-tile">
                <span className="muted">Damage</span>
                <strong>{detail.totals.damage}</strong>
              </div>
              <div className="stat-tile">
                <span className="muted">K/D</span>
                <strong>{kdRatio(detail.totals.kills, detail.totals.deaths)}</strong>
              </div>
              <div className="stat-tile">
                <span className="muted">Matches</span>
                <strong>{detail.matches}</strong>
              </div>
            </div>

            <div className="record-table-wrap">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="points-col">K</th>
                    <th className="points-col">D</th>
                    <th className="points-col">A</th>
                    <th className="points-col">DMG</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.recordedAt).toLocaleString()}</td>
                      <td className="points-col">{entry.kills}</td>
                      <td className="points-col">{entry.deaths}</td>
                      <td className="points-col">{entry.assists}</td>
                      <td className="points-col">{entry.damage}</td>
                    </tr>
                  ))}
                  {detail.entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No {mode} matches recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
