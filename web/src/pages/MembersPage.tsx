import { useEffect, useState } from 'react';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';

export function MembersPage() {
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    orgApi
      .getMyOrg()
      .then(setOrg)
      .catch(() => setError('Could not load members'));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Team Members</h1>
          <p>
            {org
              ? `Org code ${org.orgCode} · ${org.members.length} member(s)`
              : 'Loading…'}
          </p>
        </div>
      </div>
      <div className="content">
        {error ? <p className="error">{error}</p> : null}
        <div className="list">
          {org?.members.map((m, index) => (
            <div key={m.userId} className="list-row" style={{ cursor: 'default' }}>
              <span className="list-sno" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <strong>
                  {m.name}
                  {m.isOwner ? ' · Owner' : ''}
                </strong>
                <span>
                  {m.role}
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
