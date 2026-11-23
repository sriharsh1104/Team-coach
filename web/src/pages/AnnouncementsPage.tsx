import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/announcements';
import { Announcement, AnnouncementList } from '../api/announcements';
import {
  loadSavedAnnouncementTemplates,
  removeSavedAnnouncementTemplate,
  saveAnnouncementTemplate,
  type SavedAnnouncementTemplate,
} from './savedAnnouncementTemplates';

/** Fired once this page has cleared the unread count, so the shell can follow. */
export const ANNOUNCEMENTS_READ_EVENT = 'announcements:read';

const PAGE_SIZE = 20;
const TITLE_MAX = 120;
const BODY_MAX = 4000;

/**
 * Guild announcements. Everyone in the org reads; only the owner sees the
 * composer — and the server enforces that independently, so hiding the form
 * is presentation, not security.
 */
export function AnnouncementsPage() {
  const [list, setList] = useState<AnnouncementList | null>(null);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Which posts were unread when this visit started.
   *
   * Opening the page marks everything read a moment later, so reading "new"
   * off the server would make the markers vanish while the person is still
   * looking at them. Held for the visit instead, and only ever added to, so
   * a post that arrives mid-visit is marked too.
   */
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(
    async (nextSkip = skip) => {
      try {
        const data = await api.listAnnouncements({
          skip: nextSkip,
          take: PAGE_SIZE,
        });
        setList(data);
        setError(null);
        setNewIds((prev) => {
          const next = new Set(prev);
          for (const a of data.announcements) if (!a.read) next.add(a.id);
          return next;
        });
        return data;
      } catch (err: any) {
        setList(null);
        setError(
          err?.response?.status === 404
            ? 'Join a guild to see its announcements.'
            : 'Could not load announcements.',
        );
        return null;
      }
    },
    [skip],
  );

  // Opening the section is what marks everything read — so the list is
  // fetched FIRST (to render the unread styling the person came to see),
  // then cleared in the background for next time.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await load(skip);
      if (cancelled || !data || data.unread === 0) return;
      await api.markAllRead().catch(() => undefined);
      if (cancelled) return;
      // Tell the sidebar its badge is stale. Without this the count sits
      // there until the next navigation, which looks like the page did not
      // work.
      window.dispatchEvent(new Event(ANNOUNCEMENTS_READ_EVENT));
    })();
    return () => {
      cancelled = true;
    };
  }, [load, skip]);

  const refresh = () => void load(skip);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Announcements</h1>
          <p>
            Posts from your guild owner. Everyone in the guild gets a
            notification.
          </p>
        </div>
      </div>

      <div className="content">
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="admin-notice">{notice}</p> : null}

        {list?.canPost ? (
          <Composer
            onPosted={(created) => {
              setNotice(`Sent “${created.title}” to everyone in your guild.`);
              setSkip(0);
              void load(0);
            }}
            onError={setError}
          />
        ) : null}

        {/* Not `!list` alone: a failed load also leaves list null, and
            pairing an error with a permanent "Loading…" reads as a hang. */}
        {!list && !error ? <p className="muted">Loading…</p> : null}
        {!list && error ? (
          <button type="button" onClick={() => void load(skip)}>
            Try again
          </button>
        ) : null}

        {list && list.announcements.length === 0 ? (
          <p className="muted">
            {list.canPost
              ? 'Nothing posted yet. Your first announcement will reach every member.'
              : 'Your guild owner has not posted anything yet.'}
          </p>
        ) : null}

        <div className="announce-list">
          {list?.announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              isNew={newIds.has(a.id)}
              canDelete={!!list.canPost}
              onDeleted={refresh}
              onError={setError}
            />
          ))}
        </div>

        {list && list.total > PAGE_SIZE ? (
          <div className="admin-pager">
            <button
              type="button"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            >
              Newer
            </button>
            <span className="muted">
              {skip + 1}–{Math.min(skip + PAGE_SIZE, list.total)} of {list.total}
            </span>
            <button
              type="button"
              disabled={skip + PAGE_SIZE >= list.total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
            >
              Older
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Composer({
  onPosted,
  onError,
}: {
  onPosted: (created: Announcement) => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<SavedAnnouncementTemplate[]>(() =>
    loadSavedAnnouncementTemplates(),
  );

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending;
  const canSave = title.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <form
      className="announce-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSend) return;
        onError(null);
        setSending(true);
        try {
          const created = await api.createAnnouncement({
            title: title.trim(),
            body: body.trim(),
          });
          setTitle('');
          setBody('');
          onPosted(created);
        } catch (err: any) {
          onError(
            err?.response?.data?.message ?? 'Could not send that announcement.',
          );
        } finally {
          setSending(false);
        }
      }}
    >
      <input
        placeholder="Title — e.g. Scrim tonight at 9"
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Announcement title"
      />
      <textarea
        placeholder="What do you want everyone to know?"
        value={body}
        rows={4}
        maxLength={BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Announcement message"
      />
      <div className="announce-composer-foot">
        <span className="muted">
          {/* Said plainly before the click, not after — this pushes to every
              member's phone and cannot be unsent. */}
          Sends a notification to every member. Save only what you reuse —
          tap a saved title below to fill the fields.
        </span>
        <div className="announce-composer-actions">
          <button
            type="button"
            className="announce-save"
            disabled={!canSave}
            aria-label="Save announcement for reuse"
            onClick={() => {
              const next = saveAnnouncementTemplate({ title, body });
              setSaved(next);
            }}
          >
            Save
          </button>
          <button type="submit" disabled={!canSend}>
            {sending ? 'Sending…' : 'Send to everyone'}
          </button>
        </div>
      </div>
      {saved.length > 0 ? (
        <div className="announce-saved">
          <div className="announce-saved-heading">Saved</div>
          <ul className="announce-saved-list">
            {saved.map((item) => (
              <li key={item.id} className="announce-saved-row">
                <button
                  type="button"
                  className="announce-saved-title"
                  onClick={() => {
                    setTitle(item.title);
                    setBody(item.body);
                  }}
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  className="announce-saved-remove"
                  aria-label={`Remove saved ${item.title}`}
                  onClick={() =>
                    setSaved(removeSavedAnnouncementTemplate(item.id))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

function AnnouncementCard({
  announcement,
  isNew,
  canDelete,
  onDeleted,
  onError,
}: {
  announcement: Announcement;
  isNew: boolean;
  canDelete: boolean;
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <article className={`announce-card${isNew ? ' unread' : ''}`}>
      <header className="announce-card-head">
        <div className="admin-cell">
          <strong>{announcement.title}</strong>
          <span className="muted">
            {announcement.author?.name ?? 'Former owner'} ·{' '}
            {formatWhen(announcement.createdAt)}
          </span>
        </div>
        {isNew ? <span className="announce-new">New</span> : null}
        {canDelete ? (
          <button
            type="button"
            className="announce-delete"
            disabled={busy}
            onClick={async () => {
              // Already delivered to every phone — deleting only clears the
              // in-app record, so say that rather than implying a recall.
              if (
                !window.confirm(
                  'Remove this announcement? Notifications already sent cannot be taken back.',
                )
              ) {
                return;
              }
              setBusy(true);
              try {
                await api.deleteAnnouncement(announcement.id);
                onDeleted();
              } catch {
                onError('Could not remove that announcement.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '…' : 'Remove'}
          </button>
        ) : null}
      </header>
      <p className="announce-body">{announcement.body}</p>
    </article>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
