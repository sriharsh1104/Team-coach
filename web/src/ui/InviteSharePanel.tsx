import { useState } from 'react';
import { copyText } from '../lib/copyText';
import { publicInviteUrl } from '../lib/publicInviteUrl';
import { InviteQr } from './InviteQr';

export function InviteSharePanel({
  referralLink,
  orgCode,
  title = 'Invite To Join',
  hint = 'Share the link or QR. New people sign up, then join as Player if they are not already on another team.',
}: {
  referralLink: string;
  orgCode?: string | null;
  title?: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = publicInviteUrl(referralLink);

  async function onCopy() {
    const ok = await copyText(shareUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="panel invite-panel">
      <h2 className="profile-section-title">{title}</h2>
      <p className="muted invite-hint">{hint}</p>
      <div className="invite-layout">
        <InviteQr
          url={shareUrl}
          label="Scan To Join"
          size={168}
          fileName={`invite-${orgCode || 'org'}.png`}
        />
        <div className="invite-link-block">
          <label htmlFor="invite-link">Invite Link</label>
          <div className="invite-link-row">
            <input
              id="invite-link"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="btn btn-primary invite-copy-btn"
              onClick={() => void onCopy()}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {orgCode ? (
            <p className="muted invite-org-code">
              Org Code: <strong>{orgCode}</strong>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
