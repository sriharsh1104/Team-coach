import { FormEvent, useCallback, useEffect, useState } from 'react';
import * as orgApi from '../api/org';
import { GuildAchievement, GuildDetail } from '../api/types';
import { resolveMediaUrl } from '../api/client';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

function formatAchievementDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Guild trophy shelf — grand finals. Everyone in the guild reads; only the
 * org owner can add/remove (server-enforced). Points come as a table image.
 */
export function AchievementsPage() {
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [standing, setStanding] = useState('');
  const [link, setLink] = useState('');
  const [pointsTable, setPointsTable] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await orgApi.getMyGuild();
      setDetail(next);
      setError(null);
    } catch (err: unknown) {
      setDetail(null);
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      setError(
        status === 404
          ? 'Join a guild to see its achievements.'
          : errorMessage(err, 'Could not load achievements'),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pointsTable) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pointsTable);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pointsTable]);

  const canManage = !!detail?.canManageRoster;
  const achievements = detail?.achievements ?? [];

  const canSubmit =
    name.trim().length >= 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) &&
    standing.trim().length >= 1 &&
    !saving;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await orgApi.createGuildAchievement({
        name: name.trim(),
        date: date.trim(),
        standing: standing.trim(),
        ...(link.trim() ? { grandFinalLink: link.trim() } : {}),
        ...(pointsTable ? { pointsTable } : {}),
      });
      setName('');
      {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        setDate(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        );
      }
      setStanding('');
      setLink('');
      setPointsTable(null);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not add achievement'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item: GuildAchievement) {
    if (!window.confirm(`Remove “${item.name}” from achievements?`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await orgApi.deleteGuildAchievement(item.id);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not remove achievement'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="content">
      <h1>Achievements</h1>
      <p className="muted">
        Grand finals this guild played — standing and optional points-table
        screenshot. Only the org owner can add or remove entries.
      </p>
      {error ? <p className="error">{error}</p> : null}

      {canManage ? (
        <form onSubmit={onAdd} className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Add achievement</h2>
          <div className="field">
            <label htmlFor="ach-name">Tournament name</label>
            <input
              id="ach-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="ach-date">Date</label>
            <input
              id="ach-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ach-standing">Standing</label>
            <input
              id="ach-standing"
              value={standing}
              onChange={(e) => setStanding(e.target.value)}
              placeholder="e.g. 1st"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ach-link">Grand final link (optional)</label>
            <input
              id="ach-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="field">
            <label htmlFor="ach-table">Points table image (optional)</label>
            <input
              id="ach-table"
              type="file"
              accept="image/*"
              onChange={(e) =>
                setPointsTable(e.target.files?.[0] ?? null)
              }
            />
          </div>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Points table preview"
              style={{
                maxWidth: '100%',
                maxHeight: 200,
                borderRadius: 8,
                marginBottom: 12,
              }}
            />
          ) : null}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!canSubmit}
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
        </form>
      ) : null}

      <div className="list">
        {achievements.map((item) => {
          const tableUrl = resolveMediaUrl(item.pointsTableUrl);
          return (
            <div
              key={item.id}
              className="list-row"
              style={{ cursor: 'default', alignItems: 'flex-start' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{item.name}</strong>
                <span>
                  {formatAchievementDate(item.date)} · {item.standing}
                </span>
                {item.grandFinalLink ? (
                  <span>
                    <a
                      href={item.grandFinalLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Grand final
                    </a>
                  </span>
                ) : null}
                {tableUrl ? (
                  <img
                    src={tableUrl}
                    alt={`${item.name} points table`}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: 220,
                      marginTop: 8,
                      borderRadius: 8,
                    }}
                  />
                ) : null}
              </div>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busyId === item.id}
                  onClick={() => void onDelete(item)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          );
        })}
        {detail && achievements.length === 0 ? (
          <p className="muted">No grand finals logged yet.</p>
        ) : null}
      </div>
    </div>
  );
}
