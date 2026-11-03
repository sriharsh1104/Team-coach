import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';

const DOWNLOAD_SIZE = 1024;

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"
      />
    </svg>
  );
}

export function InviteQr({
  url,
  label = 'Scan To Join',
  size = 168,
  fileName = 'invite-qr.png',
}: {
  url: string;
  label?: string;
  size?: number;
  fileName?: string;
}) {
  const titleId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hiResUrl, setHiResUrl] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let alive = true;
    setPreviewUrl(null);
    setHiResUrl(null);

    QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      color: { dark: '#0a0a0c', light: '#ffffff' },
    })
      .then((next) => {
        if (alive) setPreviewUrl(next);
      })
      .catch(() => {
        if (alive) setPreviewUrl(null);
      });

    QRCode.toDataURL(url, {
      width: DOWNLOAD_SIZE,
      margin: 2,
      color: { dark: '#0a0a0c', light: '#ffffff' },
    })
      .then((next) => {
        if (alive) setHiResUrl(next);
      })
      .catch(() => {
        if (alive) setHiResUrl(null);
      });

    return () => {
      alive = false;
    };
  }, [url, size]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (!previewUrl) return null;

  const exportUrl = hiResUrl ?? previewUrl;

  function onDownload(e: React.MouseEvent) {
    e.stopPropagation();
    downloadDataUrl(exportUrl, fileName);
  }

  return (
    <>
      <div className="invite-qr">
        <button
          type="button"
          className="invite-qr-open"
          onClick={() => setFullscreen(true)}
          aria-label="Open QR full screen"
          title="Open full screen"
        >
          <img src={previewUrl} alt={label} width={size} height={size} />
        </button>
        <div className="invite-qr-meta">
          <p className="muted">{label}</p>
          <button
            type="button"
            className="invite-qr-download"
            onClick={onDownload}
            aria-label="Download QR"
            title="Download QR"
            disabled={!exportUrl}
          >
            <DownloadIcon />
          </button>
        </div>
      </div>

      {fullscreen ? (
        <div
          className="modal-backdrop invite-qr-lightbox"
          role="presentation"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="invite-qr-lightbox-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invite-qr-lightbox-head">
              <h3 id={titleId}>{label}</h3>
              <div className="invite-qr-lightbox-actions">
                <button
                  type="button"
                  className="btn btn-ghost invite-qr-download-text"
                  onClick={onDownload}
                >
                  <DownloadIcon />
                  Download
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setFullscreen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <img
              className="invite-qr-lightbox-img"
              src={exportUrl}
              alt={label}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
