import {
  ELIMINATION_POINTS,
  matchPoints,
  PLACEMENT_POINTS,
  TIEBREAKERS,
} from './home/pointsTable';

const EXAMPLES = [
  { placement: 1, kills: 8, note: 'Booyah + strong finish' },
  { placement: 3, kills: 5, note: 'Top-3 hold' },
  { placement: 6, kills: 12, note: 'Mid place, high elims' },
  { placement: 10, kills: 2, note: 'Late zone / low place' },
];

export function PointsTablePage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Points Table</h1>
          <p>
            FFWS Battle Royale scoring — placement points + eliminations
          </p>
        </div>
      </div>

      <div className="content points-page">
        <section className="points-panel">
          <div className="points-panel-head">
            <div>
              <p className="drop-eyebrow">Official scoring</p>
              <h2>Placement points</h2>
            </div>
            <span className="points-chip">
              +{ELIMINATION_POINTS} pt per elimination
            </span>
          </div>

          <div className="record-table-wrap">
            <table className="record-table points-table">
              <thead>
                <tr>
                  <th className="record-sno">Rank</th>
                  <th>Placement</th>
                  <th className="points-col">Points</th>
                </tr>
              </thead>
              <tbody>
                {PLACEMENT_POINTS.map((row) => (
                  <tr
                    key={row.rank}
                    className={
                      row.rank <= 3
                        ? `points-row-top points-row-${row.rank}`
                        : undefined
                    }
                  >
                    <td className="record-sno">{row.rank}</td>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td className="points-col">
                      <span className="points-value">{row.points}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="points-formula muted">
            Match total = placement points + (eliminations ×{' '}
            {ELIMINATION_POINTS})
          </p>
        </section>

        <section className="points-panel">
          <div className="points-panel-head">
            <div>
              <p className="drop-eyebrow">Quick check</p>
              <h2>Example match totals</h2>
            </div>
          </div>

          <div className="record-table-wrap">
            <table className="record-table points-table">
              <thead>
                <tr>
                  <th>Placement</th>
                  <th>Eliminations</th>
                  <th>Placement pts</th>
                  <th className="points-col">Total</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((ex) => {
                  const placePts =
                    PLACEMENT_POINTS.find((r) => r.rank === ex.placement)
                      ?.points ?? 0;
                  const total = matchPoints(ex.placement, ex.kills);
                  return (
                    <tr key={`${ex.placement}-${ex.kills}`}>
                      <td>
                        <strong>
                          {
                            PLACEMENT_POINTS.find((r) => r.rank === ex.placement)
                              ?.label
                          }
                        </strong>
                      </td>
                      <td>{ex.kills}</td>
                      <td>{placePts}</td>
                      <td className="points-col">
                        <span className="points-value">{total}</span>
                      </td>
                      <td>
                        <span className="record-note">{ex.note}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="points-panel">
          <div className="points-panel-head">
            <div>
              <p className="drop-eyebrow">Series ties</p>
              <h2>Tiebreakers</h2>
            </div>
          </div>

          <div className="record-table-wrap">
            <table className="record-table points-table">
              <thead>
                <tr>
                  <th className="record-sno">#</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                {TIEBREAKERS.map((row) => (
                  <tr key={row.order}>
                    <td className="record-sno">{row.order}</td>
                    <td>
                      <strong>{row.rule}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
