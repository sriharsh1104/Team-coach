import { TOURNAMENT_RECORDS, TournamentResult } from './tournamentRecords';

function placementClass(placement: TournamentResult) {
  switch (placement) {
    case 'Champion':
      return 'place-champ';
    case 'Runner-up':
      return 'place-second';
    case 'Top 4':
      return 'place-top';
    default:
      return 'place-default';
  }
}

export function TournamentRecordTab() {
  return (
    <section className="landing-section landing-tab-panel">
      <h2>Tournament record</h2>
      <p className="landing-section-lead">
        Full Sacred Esports results ledger — official cups, openers, and league
        finishes.
      </p>

      <div className="record-table-wrap">
        <table className="record-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Year</th>
              <th>Mode</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {TOURNAMENT_RECORDS.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  {row.notes ? (
                    <span className="record-note">{row.notes}</span>
                  ) : null}
                </td>
                <td>{row.year}</td>
                <td>{row.mode}</td>
                <td>
                  <span className={`place-pill ${placementClass(row.placement)}`}>
                    {row.placement}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
