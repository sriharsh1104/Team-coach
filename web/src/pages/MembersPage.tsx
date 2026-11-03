import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { copyText } from '../lib/copyText';
import { InviteSharePanel } from '../ui/InviteSharePanel';

export function MembersPage() {
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    orgApi
      .getMyOrg()
      .then(setOrg)
      .catch(() => setError('Could not load members'));
  }, []);

  async function onCopyOrgCode() {
    if (!org?.orgCode) return;
    const ok = await copyText(org.orgCode);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  const canInvite = !!org && (org.isOwner || org.myRole === 'COACH');

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Team Members</h1>
          <p>
            {org ? (
              <>
                <button
                  type="button"
                  className="copyable-code"
                  onClick={() => void onCopyOrgCode()}
                  aria-label="Copy org code"
                >
                  Org code {org.orgCode}
                </button>
                {copied ? ' · Copied' : ''}
                {` · ${org.members.length} member(s)`}
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>
      </div>
      <div className="content">
        {error ? <p className="error">{error}</p> : null}

        {canInvite && org?.referralLink ? (
          <InviteSharePanel
            referralLink={org.referralLink}
            orgCode={org.orgCode}
            title="Invite To Join"
          />
        ) : null}

        <div className="list">
          {org?.members.map((m, index) => (
            <div key={m.userId} className="list-row" style={{ cursor: 'default' }}>
              <span className="list-sno" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <Link className="member-name-link" to={`/members/${m.userId}`}>
                  <strong>
                    {m.name}
                    {m.isOwner ? ' · Owner' : ''}
                  </strong>
                </Link>
                <span>
                  {m.role ?? 'Owner'}
                  {m.inGameName ? ` · ${m.inGameName}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
