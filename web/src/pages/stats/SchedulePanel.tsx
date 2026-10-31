import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as scrimsApi from '../../api/scrims';
import { uploadMediaFile } from '../../api/media';
import * as statsApi from '../../api/stats';
import { useAuth } from '../../auth/AuthContext';
import {
  ScrimEvent,
  ScrimEventType,
  ScrimRoundResult,
  StatExtraction,
  StatMode,
} from '../../api/types';
import { ExtractionReviewModal } from './ExtractionReviewModal';

type RoundDraft = {
  roundNumber: number;
  scheduledAt: string;
  result: ScrimRoundResult;
};

const RESULT_OPTIONS: Array<{ value: ScrimRoundResult; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'ELIMINATED', label: 'Eliminated' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local datetime-local value; default evening slot like mobile. */
function defaultEventLocal(): string {
  const d = new Date();
  if (d.getHours() < 12) d.setHours(18, 0, 0, 0);
  else {
    d.setMinutes(0, 0, 0);
  }
  return toLocalInput(d);
}

function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  const d = new Date(value);
  return d;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function emptyRounds(): RoundDraft[] {
  return [
    {
      roundNumber: 1,
      scheduledAt: defaultEventLocal(),
      result: 'PENDING',
    },
  ];
}

function resultClass(result: ScrimRoundResult) {
  switch (result) {
    case 'QUALIFIED':
      return 'place-champ';
    case 'ELIMINATED':
      return 'place-dnf';
    default:
      return 'place-top';
  }
}

export function SchedulePanel({ eventType }: { eventType: ScrimEventType }) {
  const { org } = useAuth();
  const isReviewer = org?.role === 'COACH' || org?.isOwner === true;
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUploadId = useRef<string | null>(null);
  const [uploadForId, setUploadForId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<StatExtraction | null>(null);
  const tab = eventType;
  const [items, setItems] = useState<ScrimEvent[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScrimEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<ScrimEventType>('TOURNAMENT');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');
  const [remind30, setRemind30] = useState(true);
  const [remind10, setRemind10] = useState(true);
  const [rounds, setRounds] = useState<RoundDraft[]>(emptyRounds);

  async function reload() {
    const data = await scrimsApi.listScrims();
    setItems(data);
  }

  useEffect(() => {
    reload().catch(() => setListError('Could not load scrims / tournaments'));
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) closeModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, busy]);

  const filtered = useMemo(
    () => items.filter((e) => e.type === tab),
    [items, tab],
  );

  const typeLabel = tab === 'TOURNAMENT' ? 'Tournament' : 'Scrim';

  function openCreate() {
    setEditing(null);
    setType(tab);
    setTitle('');
    setPlatform('');
    setNotes('');
    setRemind30(true);
    setRemind10(true);
    setRounds(emptyRounds());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(event: ScrimEvent) {
    setEditing(event);
    setType(event.type);
    setTitle(event.title);
    setPlatform(event.platform ?? '');
    setNotes(event.notes ?? '');
    setRemind30(event.remind30);
    setRemind10(event.remind10);
    const source =
      event.rounds?.length > 0
        ? event.rounds
        : [
            {
              roundNumber: 1,
              scheduledAt: event.scheduledAt,
              result: 'PENDING' as ScrimRoundResult,
            },
          ];
    setRounds(
      source.map((r) => ({
        roundNumber: r.roundNumber,
        scheduledAt: toLocalInput(new Date(r.scheduledAt)),
        result: r.result,
      })),
    );
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }

  function updateRound(index: number, patch: Partial<RoundDraft>) {
    setRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function addRound() {
    setRounds((prev) => {
      const last = prev[prev.length - 1];
      const next = fromLocalInput(last?.scheduledAt ?? defaultEventLocal());
      next.setDate(next.getDate() + 1);
      return [
        ...prev,
        {
          roundNumber: (last?.roundNumber ?? 0) + 1,
          scheduledAt: toLocalInput(next),
          result: 'PENDING',
        },
      ];
    });
  }

  function removeRound(index: number) {
    if (rounds.length <= 1) return;
    setRounds((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, roundNumber: i + 1 })),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    const parsed = rounds.map((r) => ({
      roundNumber: r.roundNumber,
      scheduledAt: fromLocalInput(r.scheduledAt),
      result: r.result,
    }));
    if (parsed.some((r) => Number.isNaN(r.scheduledAt.getTime()))) {
      setError('Check every round date / time');
      return;
    }

    const activeRounds =
      type === 'SCRIM'
        ? [{ ...parsed[0], result: 'PENDING' as ScrimRoundResult }]
        : parsed;

    setBusy(true);
    setError(null);
    try {
      const input = {
        type,
        title: title.trim(),
        scheduledAt: activeRounds[0].scheduledAt.toISOString(),
        platform: platform.trim() || undefined,
        notes: notes.trim() || undefined,
        remind30,
        remind10,
        rounds: activeRounds.map((r) => ({
          roundNumber: r.roundNumber,
          scheduledAt: r.scheduledAt.toISOString(),
          result: r.result,
        })),
      };
      if (editing) {
        await scrimsApi.updateScrim(editing.id, input);
      } else {
        await scrimsApi.createScrim(input);
      }
      await reload();
      setModalOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg.join(', ')
          : typeof msg === 'string'
            ? msg
            : 'Could not save. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(event: ScrimEvent) {
    if (!window.confirm(`Remove "${event.title}"?`)) return;
    setBusy(true);
    try {
      await scrimsApi.deleteScrim(event.id);
      await reload();
      if (editing?.id === event.id) {
        setModalOpen(false);
        setEditing(null);
        setError(null);
      }
    } catch {
      setListError('Could not delete entry');
    } finally {
      setBusy(false);
    }
  }

  async function uploadResult(event: ScrimEvent, file: File) {
    setUploadForId(event.id);
    setListError(null);
    try {
      const post = await uploadMediaFile(
        file,
        `${event.type} result: ${event.title}`,
      );
      const mode: StatMode =
        event.type === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM';
      const { created } = await statsApi.requestExtractions({
        mode,
        mediaPostIds: [post.id],
        scrimEventId: event.id,
      });
      if (created[0]) setReviewing(created[0]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setListError(
        typeof msg === 'string'
          ? msg
          : 'Could not run OCR — try a clearer scoreboard.',
      );
    } finally {
      setUploadForId(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pendingUploadId.current;
          pendingUploadId.current = null;
          if (file && id) {
            const event = items.find((x) => x.id === id);
            if (event) void uploadResult(event, file);
          } else {
            setUploadForId(null);
          }
        }}
      />
      {listError ? <p className="error">{listError}</p> : null}
      <div className="panel stats-schedule-panel">
          <div className="records-panel-head">
            <h3 style={{ margin: 0 }}>
              {typeLabel} schedule
              <span className="muted" style={{ marginLeft: 8, fontWeight: 500 }}>
                ({filtered.length})
              </span>
            </h3>
            <button
              type="button"
              className="btn btn-primary topbar-add-btn"
              onClick={openCreate}
            >
              + Add {typeLabel}
            </button>
          </div>

          <div className="record-table-wrap" style={{ marginTop: 8 }}>
            <table className="record-table">
              <thead>
                <tr>
                  <th className="record-sno">#</th>
                  <th>Title</th>
                  <th>When</th>
                  <th>Status</th>
                  <th>Platform</th>
                  <th>By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event, index) => {
                  const lastRound =
                    event.rounds?.[event.rounds.length - 1] ?? null;
                  const when = lastRound?.scheduledAt ?? event.scheduledAt;
                  const status =
                    event.type === 'TOURNAMENT' && lastRound
                      ? lastRound.result
                      : 'PENDING';
                  return (
                    <tr key={event.id}>
                      <td className="record-sno">{index + 1}</td>
                      <td>
                        <strong>{event.title}</strong>
                        {event.type === 'TOURNAMENT' && event.rounds?.length ? (
                          <span className="record-note">
                            {event.rounds.length} round
                            {event.rounds.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </td>
                      <td>{formatWhen(when)}</td>
                      <td>
                        <span className={`place-pill ${resultClass(status)}`}>
                          {status === 'PENDING'
                            ? 'Pending'
                            : status === 'QUALIFIED'
                              ? 'Qualified'
                              : 'Eliminated'}
                        </span>
                      </td>
                      <td>
                        <span className="record-note">
                          {event.platform?.trim() || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="record-note">{event.createdByName}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={uploadForId === event.id}
                            onClick={() => {
                              pendingUploadId.current = event.id;
                              setUploadForId(event.id);
                              fileRef.current?.click();
                            }}
                          >
                            {uploadForId === event.id ? 'OCR…' : 'Upload result'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => openEdit(event)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => onDelete(event)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No {typeLabel.toLowerCase()}s yet. Tap Add {typeLabel} to
                      schedule one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

      {reviewing ? (
        <ExtractionReviewModal
          extraction={reviewing}
          isReviewer={isReviewer}
          onClose={() => setReviewing(null)}
          onDone={() => undefined}
        />
      ) : null}

      {modalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scrim-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="scrim-modal-title">
                {editing ? 'Edit entry' : 'Add Scrim / Tournament'}
              </h2>
              <button
                type="button"
                className="btn btn-ghost modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={onSubmit}>
              <div className="scrim-type-row" role="group" aria-label="Type">
                {(
                  [
                    ['SCRIM', 'Scrim'],
                    ['TOURNAMENT', 'Tournament'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`profile-tab${type === id ? ' active' : ''}`}
                    onClick={() => {
                      setType(id);
                      if (id === 'SCRIM') {
                        setRounds((prev) => [
                          { ...prev[0], result: 'PENDING' },
                        ]);
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="field">
                <label htmlFor="scrim-title">Title</label>
                <input
                  id="scrim-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    type === 'TOURNAMENT'
                      ? 'e.g. FFWS Qualifier Day 1'
                      : 'e.g. Practice vs Team Beta'
                  }
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <span className="field-label">Team reminders</span>
                <div className="scrim-check-row">
                  <label className="scrim-check">
                    <input
                      type="checkbox"
                      checked={remind30}
                      onChange={(e) => setRemind30(e.target.checked)}
                    />
                    30 minutes before
                  </label>
                  <label className="scrim-check">
                    <input
                      type="checkbox"
                      checked={remind10}
                      onChange={(e) => setRemind10(e.target.checked)}
                    />
                    10 minutes before
                  </label>
                </div>
              </div>

              {type === 'SCRIM' ? (
                <div className="field">
                  <label htmlFor="scrim-when">Date &amp; time</label>
                  <input
                    id="scrim-when"
                    type="datetime-local"
                    value={rounds[0]?.scheduledAt ?? defaultEventLocal()}
                    onChange={(e) =>
                      updateRound(0, { scheduledAt: e.target.value })
                    }
                    required
                  />
                </div>
              ) : (
                <div className="field">
                  <span className="field-label">Rounds</span>
                  <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                    Add rounds as you qualify. Set the next round date after
                    each qualify.
                  </p>
                  <div className="scrim-rounds">
                    {rounds.map((round, index) => (
                      <div key={`round-${round.roundNumber}-${index}`} className="scrim-round-card">
                        <div className="scrim-round-head">
                          <strong>Round {round.roundNumber}</strong>
                          {rounds.length > 1 ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => removeRound(index)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <label className="scrim-round-label" htmlFor={`round-when-${index}`}>
                          Date &amp; time
                        </label>
                        <input
                          id={`round-when-${index}`}
                          type="datetime-local"
                          value={round.scheduledAt}
                          onChange={(e) =>
                            updateRound(index, { scheduledAt: e.target.value })
                          }
                          required
                        />
                        <div className="scrim-type-row" style={{ marginTop: 10 }}>
                          {RESULT_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={`profile-tab${round.result === opt.value ? ' active' : ''}`}
                              onClick={() => {
                                updateRound(index, { result: opt.value });
                                if (
                                  opt.value === 'QUALIFIED' &&
                                  index === rounds.length - 1
                                ) {
                                  addRound();
                                }
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {rounds[rounds.length - 1]?.result === 'QUALIFIED' ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ marginTop: 8 }}
                      onClick={addRound}
                    >
                      + Add round
                    </button>
                  ) : null}
                </div>
              )}

              <div className="field">
                <label htmlFor="scrim-platform">Platform / link</label>
                <input
                  id="scrim-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  placeholder="Discord invite, lobby ID…"
                />
              </div>
              <div className="field">
                <label htmlFor="scrim-notes">Notes</label>
                <textarea
                  id="scrim-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Drop plan, roster, custom room…"
                />
              </div>

              {error ? <p className="error">{error}</p> : null}

              <div className="modal-actions">
                {editing ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)', marginRight: 'auto' }}
                    disabled={busy}
                    onClick={() => onDelete(editing)}
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary modal-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? 'Saving…' : editing ? 'Save changes' : `Add ${type === 'TOURNAMENT' ? 'Tournament' : 'Scrim'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
