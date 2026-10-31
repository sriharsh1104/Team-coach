import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadMediaFile } from '../../api/media';
import * as statsApi from '../../api/stats';
import {
  LeaderboardRow,
  ModeHistoryEntry,
  StatExtraction,
  StatMode,
} from '../../api/types';
import { ExtractionReviewModal } from './ExtractionReviewModal';

function pendingLabel(
  status: StatExtraction['status'],
  isReviewer: boolean,
): string {
  if (status === 'QUEUED' || status === 'PROCESSING') return 'Processing…';
  if (status === 'PENDING' && !isReviewer) return 'Pending coach review';
  return 'Review';
}

export function GrindPanel({
  mode,
  isReviewer,
}: {
  mode: 'BR' | 'CS';
  isReviewer: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [history, setHistory] = useState<ModeHistoryEntry[]>([]);
  const [pending, setPending] = useState<StatExtraction[]>([]);
  const [viewTab, setViewTab] = useState<'board' | 'days'>('board');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<StatExtraction | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    const [board, extractions, modeHistory] = await Promise.all([
      statsApi.getLeaderboard(mode),
      statsApi.listExtractions(mode),
      statsApi.getModeHistory(mode),
    ]);
    setLeaderboard(board);
    setPending(
      extractions.filter((e) =>
        ['QUEUED', 'PROCESSING', 'PENDING', 'FAILED'].includes(e.status),
      ),
    );
    setHistory(modeHistory.entries);
  }, [mode]);

  useEffect(() => {
    setError(null);
    setNotice(null);
    load().catch(() => setError('Could not load stats'));
  }, [load]);

  // Soft-poll while OCR jobs are running
  useEffect(() => {
    const active = pending.some(
      (e) => e.status === 'QUEUED' || e.status === 'PROCESSING',
    );
    if (!active) return;
    const t = setInterval(() => {
      load().catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [pending, load]);

  async function processFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (!images.length) {
      setError('Pick Free Fire scoreboard screenshots (images only)');
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const mediaPostIds: string[] = [];
      for (const file of images.slice(0, 10)) {
        const post = await uploadMediaFile(file, `${mode} grind scoreboard`);
        mediaPostIds.push(post.id);
      }
      const { created, skipped } = await statsApi.requestExtractions({
        mode: mode as StatMode,
        mediaPostIds,
      });
      await load();
      const skippedNote =
        skipped.length > 0
          ? ` (${skipped.length} already had an extraction)`
          : '';
      setNotice(
        `${created.length} screenshot(s) queued for Gemini Flash OCR${skippedNote}.`,
      );
      if (created[0]) setReviewing(created[0]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(
        typeof msg === 'string'
          ? msg
          : 'Could not queue OCR — try a clearer scoreboard shot.',
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRetry(id: string) {
    try {
      await statsApi.retryExtraction(id);
      await load();
    } catch {
      setError('Could not retry');
    }
  }

  async function onDiscard(id: string) {
    try {
      await statsApi.rejectExtraction(id);
      await load();
    } catch {
      setError('Could not discard');
    }
  }

  const label = mode === 'BR' ? 'Battle Royale' : 'Clash Squad';

  return (
    <div className="stats-grind">
      <div
        className={`stats-dropzone${dragOver ? ' drag' : ''}${uploading ? ' busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
        }}
      >
        <div>
          <strong>Upload {label} scoreboard</strong>
          <p>
            Drop screenshots or browse — Gemini Flash reads K / A / DMG and
            queues teammate review
          </p>
        </div>
        <div className="stats-dropzone-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) processFiles(e.target.files);
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Choose screenshots'}
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="stats-notice">{notice}</p> : null}

      {pending.length > 0 ? (
        <section className="stats-section">
          <h3>Pending review</h3>
          <div className="stats-pending-list">
            {pending.map((extraction) => (
              <div key={extraction.id} className="stats-pending-row">
                <div>
                  <strong>
                    {extraction.status === 'FAILED'
                      ? "Couldn't read screenshot"
                      : `${extraction.rows.length || '…'} player(s)`}
                  </strong>
                  <span className="record-note">
                    {new Date(extraction.createdAt).toLocaleString()} ·{' '}
                    {extraction.status}
                  </span>
                </div>
                <div className="stats-pending-actions">
                  {extraction.status === 'FAILED' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onRetry(extraction.id)}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => onDiscard(extraction.id)}
                      >
                        Discard
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={
                        extraction.status !== 'PENDING' || !isReviewer
                      }
                      onClick={() => setReviewing(extraction)}
                    >
                      {pendingLabel(extraction.status, isReviewer)}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <nav className="stats-subtabs" aria-label="Grind view">
        {(
          [
            ['board', 'Leaderboard'],
            ['days', 'Recent'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            className={`stats-subtab${viewTab === id ? ' active' : ''}`}
            onClick={() => setViewTab(id)}
          >
            {text}
          </button>
        ))}
      </nav>

      {viewTab === 'board' ? (
        <div className="record-table-wrap">
          <table className="record-table points-table">
            <thead>
              <tr>
                <th className="record-sno">#</th>
                <th>Player</th>
                <th className="points-col">K</th>
                <th className="points-col">D</th>
                <th className="points-col">A</th>
                <th className="points-col">DMG</th>
                <th className="points-col">Matches</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.userId} className={i < 3 ? `points-row-${i + 1}` : undefined}>
                  <td className="record-sno">{i + 1}</td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td className="points-col">{row.kills}</td>
                  <td className="points-col">{row.deaths}</td>
                  <td className="points-col">{row.assists}</td>
                  <td className="points-col">{row.damage}</td>
                  <td className="points-col">{row.matches}</td>
                </tr>
              ))}
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No {label} stats yet — upload a scoreboard to start.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Player</th>
                <th className="points-col">K</th>
                <th className="points-col">D</th>
                <th className="points-col">A</th>
                <th className="points-col">DMG</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {new Date(entry.recordedAt).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <strong>{entry.name}</strong>
                  </td>
                  <td className="points-col">{entry.kills}</td>
                  <td className="points-col">{entry.deaths}</td>
                  <td className="points-col">{entry.assists}</td>
                  <td className="points-col">{entry.damage}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No recent entries.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {reviewing ? (
        <ExtractionReviewModal
          extraction={reviewing}
          isReviewer={isReviewer}
          onClose={() => setReviewing(null)}
          onDone={() => {
            load().catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}
