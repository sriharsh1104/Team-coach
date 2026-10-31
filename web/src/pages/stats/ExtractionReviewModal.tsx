import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getMyOrg } from '../../api/org';
import { resolveMediaUrl } from '../../api/client';
import * as statsApi from '../../api/stats';
import {
  ExtractionRow,
  OrgMember,
  StatExtraction,
} from '../../api/types';

const POLL_MS = 3000;

function normalizeIgn(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[~·•._\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchMemberId(rawName: string, members: OrgMember[]): string | null {
  const key = normalizeIgn(rawName);
  if (!key) return null;
  const byIgn = members.find(
    (m) => m.inGameName && normalizeIgn(m.inGameName) === key,
  );
  if (byIgn) return byIgn.userId;
  const byName = members.find((m) => normalizeIgn(m.name) === key);
  return byName?.userId ?? null;
}

export function ExtractionReviewModal({
  extraction: initial,
  isReviewer,
  onClose,
  onDone,
}: {
  extraction: StatExtraction;
  isReviewer: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [extraction, setExtraction] = useState(initial);
  const [rows, setRows] = useState<ExtractionRow[]>(initial.rows);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stillProcessing =
    extraction.status === 'QUEUED' || extraction.status === 'PROCESSING';

  useEffect(() => {
    if (!stillProcessing) return;
    const timer = setInterval(async () => {
      try {
        const latest = await statsApi.getExtraction(extraction.id);
        setExtraction(latest);
        if (latest.status === 'PENDING') setRows(latest.rows);
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stillProcessing, extraction.id]);

  useEffect(() => {
    if (extraction.status !== 'PENDING') return;
    getMyOrg().then((org) => {
      setMembers(org.members);
      setRows((prev) =>
        prev.map((row) =>
          row.matchedUserId
            ? row
            : {
                ...row,
                matchedUserId: matchMemberId(row.rawName, org.members),
              },
        ),
      );
    });
  }, [extraction.status]);

  const teammateRows = useMemo(
    () => rows.filter((r) => r.matchedUserId),
    [rows],
  );
  const outsiderRows = useMemo(
    () => rows.filter((r) => !r.matchedUserId),
    [rows],
  );

  function updateRow(index: number, patch: Partial<ExtractionRow>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        if (patch.rawName !== undefined && patch.matchedUserId === undefined) {
          next.matchedUserId = matchMemberId(patch.rawName, members);
        }
        return next;
      }),
    );
  }

  async function onRetry() {
    setBusy(true);
    setError(null);
    try {
      const updated = await statsApi.retryExtraction(extraction.id);
      setExtraction(updated);
      setRows(updated.rows);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Could not retry OCR');
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    setBusy(true);
    try {
      await statsApi.rejectExtraction(extraction.id);
      onDone();
      onClose();
    } catch {
      setError('Could not discard');
      setBusy(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    if (!isReviewer) return;
    if (teammateRows.length === 0) {
      setError(
        'Match at least one teammate IGN (set In-Game Name on Profile).',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await statsApi.updateExtractionRows(extraction.id, teammateRows);
      await statsApi.confirmExtraction(extraction.id);
      onDone();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Could not confirm stats');
      setBusy(false);
    }
  }

  const mediaSrc = resolveMediaUrl(extraction.mediaUrl);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="ocr-review-title">Scoreboard review</h2>
          <button
            type="button"
            className="btn btn-ghost modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="modal-body" onSubmit={onConfirm}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Gemini Flash OCR · match teammates, then confirm to update
            leaderboard
          </p>

          {mediaSrc ? (
            <div className="ocr-media">
              <img src={mediaSrc} alt="Scoreboard screenshot" />
            </div>
          ) : null}

          {stillProcessing ? (
            <div className="ocr-status">
              <span className="ocr-pulse" aria-hidden="true" />
              Reading scoreboard with Gemini Flash…
            </div>
          ) : null}

          {extraction.status === 'FAILED' ? (
            <div className="ocr-status ocr-status-fail">
              Couldn&apos;t read this screenshot
              {extraction.failureReason
                ? ` — ${extraction.failureReason}`
                : ''}
            </div>
          ) : null}

          {extraction.status === 'PENDING' ? (
            <div className="ocr-rows">
              {rows.map((row, index) => (
                <div key={`${row.rawName}-${index}`} className="ocr-row-card">
                  <div className="ocr-row-top">
                    <input
                      className="ocr-name-input"
                      value={row.rawName}
                      onChange={(e) =>
                        updateRow(index, { rawName: e.target.value })
                      }
                      disabled={!isReviewer}
                    />
                    <span
                      className={`ocr-match-pill${row.matchedUserId ? ' matched' : ''}`}
                    >
                      {row.matchedUserId
                        ? members.find((m) => m.userId === row.matchedUserId)
                            ?.name ?? 'Matched'
                        : 'No teammate'}
                    </span>
                  </div>
                  {isReviewer && members.length > 0 ? (
                    <div className="ocr-member-chips">
                      {members.map((m) => (
                        <button
                          key={m.userId}
                          type="button"
                          className={`ocr-chip${row.matchedUserId === m.userId ? ' active' : ''}`}
                          onClick={() =>
                            updateRow(index, {
                              matchedUserId:
                                row.matchedUserId === m.userId
                                  ? null
                                  : m.userId,
                            })
                          }
                        >
                          {m.inGameName || m.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="ocr-stat-grid">
                    {(
                      [
                        ['kills', 'K'],
                        ['deaths', 'D'],
                        ['assists', 'A'],
                        ['damage', 'DMG'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="ocr-stat">
                        <span>{label}</span>
                        <input
                          type="number"
                          min={0}
                          value={row[key]}
                          disabled={!isReviewer}
                          onChange={(e) =>
                            updateRow(index, {
                              [key]: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {outsiderRows.length > 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>
                  {outsiderRows.length} non-team name(s) will be ignored on
                  confirm.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}

          <div className="modal-actions">
            {extraction.status === 'FAILED' ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger)', marginRight: 'auto' }}
                  disabled={busy}
                  onClick={onDiscard}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={onRetry}
                >
                  {busy ? 'Retrying…' : 'Retry OCR'}
                </button>
              </>
            ) : null}

            {extraction.status === 'PENDING' && isReviewer ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger)', marginRight: 'auto' }}
                  disabled={busy}
                  onClick={onDiscard}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={onClose}
                >
                  Later
                </button>
                <button
                  className="btn btn-primary modal-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? 'Saving…'
                    : `Confirm (${teammateRows.length} teammate${teammateRows.length === 1 ? '' : 's'})`}
                </button>
              </>
            ) : null}

            {(stillProcessing ||
              (extraction.status === 'PENDING' && !isReviewer)) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
