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

function statusClass(kind: string) {
  switch (kind) {
    case 'qualified':
    case 'result':
      return 'place-champ';
    case 'registered':
      return 'place-second';
    case 'upcoming':
      return 'place-top';
    case 'did_not_qualify':
      return 'place-dnf';
    default:
      return 'place-default';
  }
}

export function RecordsTab() {
  const [page, setPage] = useState(1);
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const snoBase = (safePage - 1) * PAGE_SIZE;
  const rows = all.slice(snoBase, snoBase + PAGE_SIZE);

  return (
    <section className="landing-section landing-tab-panel">
      <div className="record-table-wrap">
        <table className="record-table">
          <thead>
            <tr>
              <th className="record-sno">S.No</th>
              <th>Tournament</th>
              <th>Status</th>
              <th>How far</th>
              <th>Qualifier date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className="record-sno">{snoBase + index + 1}</td>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>
                  <span className={`place-pill ${statusClass(row.kind)}`}>
                    {row.status}
                  </span>
                </td>
                <td>
                  <span className="record-note">{row.progress || '—'}</span>
                </td>
                <td>{row.qualifierDate || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No final-push records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="records-pagination">
        <span className="muted">
          {total === 0
            ? '0 records'
            : `${snoBase + 1}–${snoBase + rows.length} of ${total}`}
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
    </section>
  );
}
