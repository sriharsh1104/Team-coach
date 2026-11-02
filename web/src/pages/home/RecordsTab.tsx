import { useEffect, useState } from 'react';
import {
  listPublicTournamentRecords,
  type RecordKind,
} from '../../api/tournamentRecords';
import { FALLBACK_TOURNAMENT_RECORDS } from './tournamentRecords';

const PAGE_SIZE = 10;

type PublicRecord = {
  id: string;
  name: string;
  status: string;
  kind: RecordKind;
  progress?: string | null;
  qualifierDate?: string | null;
  rank?: string | null;
  resultImage?: string | null;
};

/** Reached the final. "Didn't qualify for final" stays off this list. */
export function isFinalPush(row: {
  status: string;
  progress?: string | null;
}) {
  if (row.status.trim().toLowerCase() === 'final') return true;
  const progress = (row.progress ?? '').toLowerCase();
  if (!progress.includes('final')) return false;
  if (
    progress.includes("didn't") ||
    progress.includes('did not') ||
    progress.includes('didnt')
  ) {
    return false;
  }
  return true;
}

function displayRank(row: PublicRecord) {
  const rank = row.rank?.trim();
  if (rank) return rank;
  const status = row.status.trim();
  if (/^top\s*\d+/i.test(status) || /^#?\d+(st|nd|rd|th)?$/i.test(status)) {
    return status;
  }
  return '—';
}

export function RecordsTab() {
  const [page, setPage] = useState(1);
  const [shot, setShot] = useState<PublicRecord | null>(null);
  const [all, setAll] = useState<PublicRecord[]>(
    FALLBACK_TOURNAMENT_RECORDS.filter(isFinalPush),
  );

  useEffect(() => {
    let cancelled = false;
    listPublicTournamentRecords(1, 100)
      .then((data) => {
        if (cancelled) return;
        setAll(data.items.filter(isFinalPush));
        setPage(1);
      })
      .catch(() => {
        if (cancelled) return;
        setAll(FALLBACK_TOURNAMENT_RECORDS.filter(isFinalPush));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = all.length;
  const showPagination = total > PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const snoBase = (safePage - 1) * PAGE_SIZE;
  const rows = showPagination
    ? all.slice(snoBase, snoBase + PAGE_SIZE)
    : all;

  return (
    <section className="landing-section landing-tab-panel">
      <div className="record-table-wrap">
        <table className="record-table record-table-public">
          <thead>
            <tr>
              <th className="record-sno">S.No</th>
              <th>Tournament</th>
              <th>Rank</th>
              <th className="record-result-col">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className="record-sno">{snoBase + index + 1}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td className="record-rank">{displayRank(row)}</td>
                <td className="record-result-col">
                  <button
                    type="button"
                    className="record-view-btn"
                    aria-label={`View result for ${row.name}`}
                    onClick={() => setShot(row)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No final-push records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <div className="records-pagination">
          <span className="muted">
            {`${snoBase + 1}–${snoBase + rows.length} of ${total}`}
          </span>
          <div className="records-pagination-actions">
            <button
              type="button"
              className="landing-cta-ghost tour-page-btn"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="records-page-label">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="landing-cta-ghost tour-page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {shot ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShot(null)}
        >
          <div
            className="modal-card record-shot-card"
            role="dialog"
            aria-modal="true"
            aria-label={`Result for ${shot.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="record-shot-head">
              <div>
                <p className="record-shot-kicker">View result</p>
                <h3>{shot.name}</h3>
              </div>
              <button
                type="button"
                className="record-shot-close"
                onClick={() => setShot(null)}
              >
                Close
              </button>
            </div>
            {shot.resultImage ? (
              <img src={shot.resultImage} alt={`${shot.name} result`} />
            ) : (
              <p className="record-shot-empty">
                Result screenshot is not added yet.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
