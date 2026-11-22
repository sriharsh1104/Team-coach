import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import { AdminOrgDetail, AdminOrgList, AdminOverview } from '../../api/admin';

const PAGE_SIZE = 25;

export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [list, setList] = useState<AdminOrgList | null>(null);
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<AdminOrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getOverview()
      .then(setOverview)
      .catch(() => setError('Could not load platform stats'));
  }, []);

  const loadOrgs = useCallback(() => {
    adminApi
      .listOrgs({ search: search.trim() || undefined, skip, take: PAGE_SIZE })
      .then(setList)
      .catch(() => setError('Could not load orgs'));
  }, [search, skip]);

  // Debounced so typing in the search box isn't one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(loadOrgs, 250);
    return () => clearTimeout(timer);
  }, [loadOrgs]);

  const openOrg = (id: string) => {
    setSelected(null);
    adminApi
      .getOrg(id)
      .then(setSelected)
      .catch(() => setError('Could not load that org'));
  };

  const total = list?.total ?? 0;
  const pageEnd = Math.min(skip + PAGE_SIZE, total);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Admin</h1>
          <p>Everything across the platform. Read-only.</p>
        </div>
      </div>

      <div className="content">
        {error ? <p className="error">{error}</p> : null}

        <div className="admin-stats">
          <Stat label="Orgs" value={overview?.orgs} />
          <Stat label="Users" value={overview?.users} />
          <Stat label="Verified" value={overview?.verifiedUsers} />
          <Stat label="New (7d)" value={overview?.newUsersLast7Days} />
          <Stat label="Messages" value={overview?.messages} />
          <Stat label="Scrims" value={overview?.scrims} />
          <Stat label="Admins" value={overview?.admins} />
        </div>

        <input
          placeholder="Search orgs by name…"
          value={search}
          onChange={(e) => {
            setSkip(0);
            setSearch(e.target.value);
          }}
          aria-label="Search orgs by name"
        />

        <div className="list">
          {list?.orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              className="list-row"
              onClick={() => openOrg(org.id)}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{org.name}</strong>
                <span>
                  {org.owner ? `${org.owner.name} · ${org.owner.email}` : 'No owner'}
                </span>
              </span>
              <span>
                {org.rosterCount} roster · {org.guildCount} guild · {org.messageCount} msgs
              </span>
            </button>
          ))}
          {list && list.orgs.length === 0 ? (
            <p className="muted">No orgs match that search.</p>
          ) : null}
        </div>

        {total > PAGE_SIZE ? (
          <div className="admin-pager">
            <button
              type="button"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            >
              Previous
            </button>
            <span className="muted">
              {skip + 1}–{pageEnd} of {total}
            </span>
            <button
              type="button"
              disabled={pageEnd >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        ) : null}

        {selected ? (
          <section className="admin-detail">
            <h2>{selected.name}</h2>
            <div className="admin-stats">
              <Stat label="Guild" value={selected.counts.guildMembers} />
              <Stat label="Messages" value={selected.counts.messages} />
              <Stat label="Scrims" value={selected.counts.scrims} />
              <Stat label="Media" value={selected.counts.mediaPosts} />
              <Stat label="Stats" value={selected.counts.playerStats} />
            </div>
            <div className="list">
              {selected.roster.map((m) => (
                <div key={m.id} className="list-row" style={{ cursor: 'default' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{m.name}</strong>
                    <span>
                      {m.inGameName ? `${m.inGameName} · ` : ''}
                      {m.email}
                    </span>
                  </span>
                  <span>{m.isOwner ? 'Owner' : (m.role ?? 'No role')}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-value">{value ?? '—'}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  );
}
