import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../api/client';
import * as mediaApi from '../api/media';
import * as orgApi from '../api/org';
import { MediaPost, OrgMember } from '../api/types';
import { SesLoader } from '../ui/SesLoader';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

/** Org media feed — every scrim/stream screenshot and clip uploaded by a
 * teammate, filterable by uploader. Mirrors mobile's MediaFeedScreen. */
export function MediaFeedPage() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [uploaderId, setUploaderId] = useState<string | null>(null);
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MediaPost | null>(null);

  useEffect(() => {
    orgApi.getMyOrg().then((org) => setMembers(org.members)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    mediaApi
      .listMedia(uploaderId ?? undefined)
      .then((data) => {
        if (!cancelled) setPosts(data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load media'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uploaderId]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Media</h1>
          <p>Scrim and stream screenshots/clips uploaded by the team.</p>
        </div>
      </div>
      <div className="content">
        <nav className="pill-switch" aria-label="Filter by uploader" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={uploaderId === null}
            className={`pill-switch-btn${uploaderId === null ? ' active' : ''}`}
            onClick={() => setUploaderId(null)}
          >
            All
          </button>
          {members.map((m) => (
            <button
              key={m.userId}
              type="button"
              role="tab"
              aria-selected={uploaderId === m.userId}
              className={`pill-switch-btn${uploaderId === m.userId ? ' active' : ''}`}
              onClick={() => setUploaderId(m.userId)}
            >
              {m.name}
            </button>
          ))}
        </nav>

        {error ? <p className="error">{error}</p> : null}

        {loading ? (
          <SesLoader label="Loading media" />
        ) : (
          <div className="media-grid">
            {posts.map((post) => {
              const url = resolveMediaUrl(post.url) ?? '';
              return (
                <button
                  key={post.id}
                  type="button"
                  className="media-card"
                  onClick={() => setViewer(post)}
                >
                  {post.type === 'IMAGE' ? (
                    <img src={url} alt={post.caption ?? 'Upload'} className="media-thumb" />
                  ) : (
                    <div className="media-thumb media-thumb-video">▶</div>
                  )}
                  <div className="media-card-meta">
                    <strong>{post.uploaderName}</strong>
                    {post.caption ? (
                      <span className="media-caption">{post.caption}</span>
                    ) : null}
                    <span className="muted">
                      {new Date(post.createdAt).toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
            {posts.length === 0 ? <p className="muted">No uploads yet.</p> : null}
          </div>
        )}
      </div>

      {viewer ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setViewer(null)}
        >
          <div
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                <Link to={`/members/${viewer.uploaderId}`} className="member-name-link">
                  {viewer.uploaderName}
                </Link>
              </h2>
              <button
                type="button"
                className="btn btn-ghost modal-close"
                onClick={() => setViewer(null)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              {viewer.type === 'IMAGE' ? (
                <img
                  src={resolveMediaUrl(viewer.url) ?? ''}
                  alt={viewer.caption ?? 'Upload'}
                  className="media-viewer-image"
                />
              ) : (
                <video
                  src={resolveMediaUrl(viewer.url) ?? ''}
                  controls
                  autoPlay
                  className="media-viewer-video"
                />
              )}
              {viewer.caption ? <p>{viewer.caption}</p> : null}
              <p className="muted">{new Date(viewer.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
