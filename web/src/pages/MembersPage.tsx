import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { InviteSharePanel } from '../ui/InviteSharePanel';

export function MembersPage() {
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    orgApi
      .getMyOrg()
      .then(setOrg)
      .catch(() => setError('Could not load roster'));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Roster</h1>
          <p>
            {org
              ? `${org.members.length} roster member(s)`
              : 'Loading…'}
          </p>
        </div>
      </div>
      <div className="content">
        {error ? <p className="error">{error}</p> : null}

        {org?.canInviteRoster && org.rosterReferralLink ? (
          <InviteSharePanel
            referralLink={org.rosterReferralLink}
            orgCode={org.rosterCode}
            title="Esports Roster Invite"
            hint="Owner/coach only. Separate from the guild code. Share this roster link (or roster code) — already registered users can join without leaving the platform. They land on the guild + roster as Player."
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
