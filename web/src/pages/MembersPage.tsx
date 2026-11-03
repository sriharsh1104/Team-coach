import { useEffect, useState } from 'react';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { copyText } from '../lib/copyText';

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
                  onClick={onCopyOrgCode}
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
