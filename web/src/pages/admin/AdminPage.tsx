import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import {
  AdminDirectVoiceUser,
  AdminHealth,
  AdminMember,
  AdminOrgDetail,
  AdminOrgList,
  AdminOverview,
} from '../../api/admin';

const PAGE_SIZE = 25;
/** Health is the one panel worth re-reading on its own; the rest is manual. */
const HEALTH_REFRESH_MS = 30_000;

type Tab = 'overview' | 'guilds' | 'voice' | 'health';
type MemberTab = 'guild' | 'roster' | 'requests';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'guilds', label: 'Guilds' },
  { id: 'voice', label: 'Voice access' },
  { id: 'health', label: 'Health' },
];

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [list, setList] = useState<AdminOrgList | null>(null);
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<AdminOrgDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberTab, setMemberTab] = useState<MemberTab>('guild');
  const [voiceUsers, setVoiceUsers] = useState<AdminDirectVoiceUser[] | null>(
    null,
  );
  /** The user id a grant/revoke is in flight for — stops a double-click. */
  const [voiceBusyId, setVoiceBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(
    () =>
      adminApi
        .getOverview()
        .then(setOverview)
        .catch(() => setError('Could not load platform stats')),
    [],
  );

  const loadHealth = useCallback(
    () =>
      adminApi
        .getHealth()
        .then(setHealth)
        .catch(() => setError('Could not reach the backend health endpoint')),
    [],
  );

  const loadVoiceUsers = useCallback(
    () =>
      adminApi
        .listDirectVoiceUsers()
        .then(setVoiceUsers)
        .catch(() => setError('Could not load who has 1-on-1 voice')),
    [],
  );

  // Everything the dashboard shows is fetched once up front, in parallel, so
  // switching tabs is instant instead of a spinner per tab.
  useEffect(() => {
    void loadOverview();
    void loadHealth();
    void loadVoiceUsers();
  }, [loadOverview, loadHealth, loadVoiceUsers]);

  // Only poll while the health tab is actually on screen — a dashboard left
  // open on another tab has no business hitting the database every 30s.
  useEffect(() => {
    if (tab !== 'health') return;
    const timer = setInterval(() => void loadHealth(), HEALTH_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, loadHealth]);

  const loadOrgs = useCallback(() => {
    adminApi
      .listOrgs({ search: search.trim() || undefined, skip, take: PAGE_SIZE })
      .then(setList)
      .catch(() => setError('Could not load guilds'));
  }, [search, skip]);

  // Debounced so typing in the search box isn't one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(loadOrgs, 250);
    return () => clearTimeout(timer);
  }, [loadOrgs]);

  const openOrg = (id: string) => {
    setSelectedId(id);
    setMemberTab('guild');
    adminApi
      .getOrg(id)
      .then((detail) => {
        // A slower earlier request must not overwrite a newer selection.
        setSelected((prev) => (detail.id === id ? detail : prev));
      })
      .catch(() => setError('Could not load that guild'));
  };

  const refreshAll = () => {
    setError(null);
    setNotice(null);
    void loadOverview();
    void loadHealth();
    void loadVoiceUsers();
    loadOrgs();
    if (selectedId) openOrg(selectedId);
  };

  /**
   * Grant or revoke 1-on-1 voice. `who` carries an id when the admin clicked
   * a member row and an email when they typed one into the grant box.
   *
   * On success both the holders list and the open guild are re-read rather
   * than patched locally — the server is the only thing that actually knows
   * whether the write landed, and a stale toggle here would be a lie about a
   * permission.
   */
  const toggleDirectVoice = async (
    who: { userId?: string; email?: string },
    enabled: boolean,
  ) => {
    setError(null);
    setNotice(null);
    setVoiceBusyId(who.userId ?? who.email ?? 'pending');
    try {
      const result = await adminApi.setDirectVoice({ ...who, enabled });
      setNotice(
        `1-on-1 voice ${result.canDirectVoice ? 'granted to' : 'revoked from'} ${
          result.email ?? result.name ?? 'that account'
        }.`,
      );
      await loadVoiceUsers();
      if (selectedId) openOrg(selectedId);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          'Could not change that permission. Check the email and try again.',
      );
    } finally {
      setVoiceBusyId(null);
    }
  };

  /**
   * Delete a guild. The typed name is passed straight through to the server,
   * which checks it again — the field is not a client-side nicety, it is the
   * thing the API demands.
   */
  const deleteGuild = async (id: string, typedName: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await adminApi.deleteOrg(id, typedName);
      setNotice(
        `Deleted “${res.name}” — ${res.removed.members} member(s) sent back to the join screen.`,
      );
      setSelected(null);
      setSelectedId(null);
      loadOrgs();
      void loadOverview();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ?? 'Could not delete that guild.',
      );
    }
  };

  const downServices = health?.services.filter((s) => s.status === 'down') ?? [];

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Platform admin</h1>
          <p>Guilds, people, and backend health across the whole platform.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={refreshAll}>
            Refresh
          </button>
        </div>
      </div>

      <div className="content">
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="admin-notice">{notice}</p> : null}

        <div className="pill-switch" role="tablist" aria-label="Admin sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`pill-switch-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'health' && downServices.length > 0 ? (
                <span className="admin-dot admin-dot-down" aria-label="service down" />
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <OverviewTab overview={overview} health={health} onOpenHealth={() => setTab('health')} />
        ) : null}

        {tab === 'guilds' ? (
          <GuildsTab
            list={list}
            search={search}
            skip={skip}
            selected={selected}
            selectedId={selectedId}
            memberTab={memberTab}
            onSearch={(value) => {
              setSkip(0);
              setSearch(value);
            }}
            onSkip={setSkip}
            onOpen={openOrg}
            onMemberTab={setMemberTab}
            onClose={() => {
              setSelected(null);
              setSelectedId(null);
            }}
            voiceBusyId={voiceBusyId}
            onToggleVoice={(userId, enabled) =>
              void toggleDirectVoice({ userId }, enabled)
            }
            onDelete={(id, typedName) => void deleteGuild(id, typedName)}
          />
        ) : null}

        {tab === 'voice' ? (
          <VoiceAccessTab
            users={voiceUsers}
            busyId={voiceBusyId}
            onGrant={(email) => void toggleDirectVoice({ email }, true)}
            onRevoke={(userId) => void toggleDirectVoice({ userId }, false)}
          />
        ) : null}

        {tab === 'health' ? <HealthTab health={health} /> : null}
      </div>
    </>
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab({
  overview,
  health,
  onOpenHealth,
}: {
  overview: AdminOverview | null;
  health: AdminHealth | null;
  onOpenHealth: () => void;
}) {
  const down = health?.services.filter((s) => s.status === 'down') ?? [];

  return (
    <>
      <section className="admin-section">
        <h2>People</h2>
        <div className="admin-stats">
          <Stat label="Total users" value={overview?.users} />
          <Stat label="Verified" value={overview?.verifiedUsers} />
          <Stat label="New (24h)" value={overview?.newUsersLast24Hours} />
          <Stat label="New (7d)" value={overview?.newUsersLast7Days} />
          <Stat label="Platform admins" value={overview?.admins} />
        </div>
      </section>

      <section className="admin-section">
        <h2>Active</h2>
        <div className="admin-stats">
          <Stat label="Online now" value={overview?.onlineNow} accent />
          <Stat label="Active (24h)" value={overview?.activeUsers24h} />
          <Stat label="Active (7d)" value={overview?.activeUsers7d} />
          <Stat label="Active (30d)" value={overview?.activeUsers30d} />
        </div>
        <p className="muted admin-note">
          “Online now” is live socket presence and resets when the backend
          restarts. “Active” is last-seen time, which does not.
        </p>
      </section>

      <section className="admin-section">
        <h2>Guilds</h2>
        <div className="admin-stats">
          <Stat label="Guilds" value={overview?.orgs} />
          <Stat label="Guild members" value={overview?.guildMembers} />
          <Stat label="Roster seats" value={overview?.rosterMembers} />
          <Stat label="Pending requests" value={overview?.pendingJoinRequests} />
          <Stat label="Messages" value={overview?.messages} />
          <Stat label="Scrims" value={overview?.scrims} />
        </div>
      </section>

      <section className="admin-section">
        <h2>Backend</h2>
        {health ? (
          <button type="button" className="admin-health-summary" onClick={onOpenHealth}>
            <span className={`admin-dot ${down.length ? 'admin-dot-down' : 'admin-dot-up'}`} />
            <span>
              <strong>
                {down.length
                  ? `${down.length} service${down.length === 1 ? '' : 's'} need attention`
                  : 'All services reporting healthy'}
              </strong>
              <span className="muted">
                {health.process.env} · up {formatUptime(health.process.uptimeSeconds)} ·{' '}
                {health.process.memoryMb} MB
              </span>
            </span>
          </button>
        ) : (
          <p className="muted">Checking…</p>
        )}
      </section>
    </>
  );
}

/* ---------------- Guilds ---------------- */

function GuildsTab({
  list,
  search,
  skip,
  selected,
  selectedId,
  memberTab,
  onSearch,
  onSkip,
  onOpen,
  onMemberTab,
  onClose,
  voiceBusyId,
  onToggleVoice,
  onDelete,
}: {
  list: AdminOrgList | null;
  search: string;
  skip: number;
  selected: AdminOrgDetail | null;
  selectedId: string | null;
  memberTab: MemberTab;
  onSearch: (value: string) => void;
  onSkip: (skip: number) => void;
  onOpen: (id: string) => void;
  onMemberTab: (tab: MemberTab) => void;
  onClose: () => void;
  voiceBusyId: string | null;
  onToggleVoice: (userId: string, enabled: boolean) => void;
  onDelete: (id: string, typedName: string) => void;
}) {
  const total = list?.total ?? 0;
  const pageEnd = Math.min(skip + PAGE_SIZE, total);

  return (
    <>
      <input
        className="admin-search"
        placeholder="Search by guild name, join code, or owner…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        aria-label="Search guilds"
      />

      <div className="list admin-guild-list">
        {list?.orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            className={`list-row${selectedId === org.id ? ' active' : ''}`}
            onClick={() => onOpen(org.id)}
          >
            <span className="admin-cell">
              <strong>{org.name}</strong>
              <span>
                {org.owner ? `${org.owner.name} · ${org.owner.email}` : 'No owner'}
              </span>
            </span>
            <span className="admin-row-meta">
              {org.guildCount} guild · {org.rosterCount} roster · {org.messageCount} msgs
            </span>
          </button>
        ))}
        {list && list.orgs.length === 0 ? (
          <p className="muted">No guilds match that search.</p>
        ) : null}
        {!list ? <p className="muted">Loading guilds…</p> : null}
      </div>

      {total > PAGE_SIZE ? (
        <div className="admin-pager">
          <button type="button" disabled={skip === 0} onClick={() => onSkip(Math.max(0, skip - PAGE_SIZE))}>
            Previous
          </button>
          <span className="muted">
            {skip + 1}–{pageEnd} of {total}
          </span>
          <button type="button" disabled={pageEnd >= total} onClick={() => onSkip(skip + PAGE_SIZE)}>
            Next
          </button>
        </div>
      ) : null}

      {selectedId && !selected ? <p className="muted">Loading guild…</p> : null}

      {selected ? (
        <GuildDetail
          detail={selected}
          memberTab={memberTab}
          onMemberTab={onMemberTab}
          onClose={onClose}
          voiceBusyId={voiceBusyId}
          onToggleVoice={onToggleVoice}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

function GuildDetail({
  detail,
  memberTab,
  onMemberTab,
  onClose,
  voiceBusyId,
  onToggleVoice,
  onDelete,
}: {
  detail: AdminOrgDetail;
  memberTab: MemberTab;
  onMemberTab: (tab: MemberTab) => void;
  onClose: () => void;
  voiceBusyId: string | null;
  onToggleVoice: (userId: string, enabled: boolean) => void;
  onDelete: (id: string, typedName: string) => void;
}) {
  const tabs: { id: MemberTab; label: string; count: number }[] = [
    { id: 'guild', label: 'Guild members', count: detail.guild.length },
    { id: 'roster', label: 'Roster', count: detail.roster.length },
    { id: 'requests', label: 'Requests', count: detail.pendingRequests.length },
  ];

  return (
    <section className="admin-detail">
      <div className="admin-detail-head">
        <div>
          <h2>{detail.name}</h2>
          <p className="muted">
            {detail.owner ? `Owner: ${detail.owner.name} · ${detail.owner.email}` : 'No owner'}
            {' · '}Code {detail.orgCode} · Created {formatDate(detail.createdAt)}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="admin-stats">
        <Stat label="Guild members" value={detail.counts.guildMembers} />
        <Stat label="Active (24h)" value={detail.counts.activeGuildMembers24h} />
        <Stat label="Roster" value={detail.counts.rosterMembers} />
        <Stat label="Messages" value={detail.counts.messages} />
        <Stat label="Scrims" value={detail.counts.scrims} />
        <Stat label="Media" value={detail.counts.mediaPosts} />
        <Stat label="Stats" value={detail.counts.playerStats} />
      </div>

      <div className="pill-switch" role="tablist" aria-label="Members">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={memberTab === t.id}
            className={`pill-switch-btn${memberTab === t.id ? ' active' : ''}`}
            onClick={() => onMemberTab(t.id)}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {memberTab === 'requests' ? (
        <div className="list">
          {detail.pendingRequests.map((r) => (
            <div key={r.id} className="list-row" style={{ cursor: 'default' }}>
              <span className="admin-cell">
                <strong>{r.user.name}</strong>
                <span>{r.user.email}</span>
              </span>
              <span className="admin-row-meta">Asked {formatDate(r.requestedAt)}</span>
            </div>
          ))}
          {detail.pendingRequests.length === 0 ? (
            <p className="muted">No one is waiting to join.</p>
          ) : null}
        </div>
      ) : (
        <MemberList
          members={memberTab === 'guild' ? detail.guild : detail.roster}
          voiceBusyId={voiceBusyId}
          onToggleVoice={onToggleVoice}
        />
      )}

      <DangerZone detail={detail} onDelete={onDelete} />
    </section>
  );
}

/**
 * Guild deletion. The name has to be typed back rather than a yes/no box,
 * because this reaches across into an org the admin is not even in and wipes
 * its chat, media, stats and every membership — and the server demands the
 * same thing, so the field here is the API's requirement, not decoration.
 */
function DangerZone({
  detail,
  onDelete,
}: {
  detail: AdminOrgDetail;
  onDelete: (id: string, typedName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  // Reset whenever a different guild is opened, so a name typed for one
  // guild can never be left sitting in the box for another.
  useEffect(() => {
    setOpen(false);
    setTyped('');
  }, [detail.id]);

  if (!open) {
    return (
      <div className="admin-danger">
        <button type="button" className="admin-danger-btn" onClick={() => setOpen(true)}>
          Delete this guild
        </button>
      </div>
    );
  }

  return (
    <form
      className="admin-danger admin-danger-open"
      onSubmit={(e) => {
        e.preventDefault();
        onDelete(detail.id, typed.trim());
      }}
    >
      <p>
        This deletes <strong>{detail.name}</strong> and every message, media
        post, stat, scrim and member seat in it. It cannot be undone.{' '}
        {detail.counts.guildMembers + detail.counts.rosterMembers} member seat
        (s) will be sent back to the join screen.
      </p>
      <label>
        Type <strong>{detail.name}</strong> to confirm
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={detail.name}
          aria-label="Type the guild name to confirm deletion"
        />
      </label>
      <div className="admin-danger-actions">
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="submit"
          className="admin-danger-btn"
          disabled={typed.trim() !== detail.name}
        >
          Delete permanently
        </button>
      </div>
    </form>
  );
}

function MemberList({
  members,
  voiceBusyId,
  onToggleVoice,
}: {
  members: AdminMember[];
  voiceBusyId: string | null;
  onToggleVoice: (userId: string, enabled: boolean) => void;
}) {
  if (members.length === 0) return <p className="muted">Nobody here yet.</p>;
  return (
    <div className="list">
      {members.map((m) => (
        <div key={m.id} className="list-row admin-member" style={{ cursor: 'default' }}>
          <span className={`admin-dot ${m.online ? 'admin-dot-up' : 'admin-dot-idle'}`} />
          <span className="admin-cell">
            <strong>
              {m.name}
              {m.inGameName ? <span className="admin-ign"> · {m.inGameName}</span> : null}
            </strong>
            <span>
              {m.email}
              {m.emailVerified ? '' : ' (unverified)'}
              {m.phone ? ` · ${m.phone}` : ''}
              {m.inGameUid ? ` · UID ${m.inGameUid}` : ''}
            </span>
          </span>
          <span className="admin-row-meta">
            {m.isOwner ? 'Owner' : (m.role ?? 'No role')}
            <br />
            joined {formatDate(m.joinedAt)} · seen {formatRelative(m.lastSeenAt)}
          </span>
          <button
            type="button"
            className={`admin-voice-btn${m.canDirectVoice ? ' on' : ''}`}
            disabled={voiceBusyId === m.id}
            onClick={() => onToggleVoice(m.id, !m.canDirectVoice)}
            title={
              m.canDirectVoice
                ? 'Revoke 1-on-1 voice for this person'
                : 'Grant 1-on-1 voice to this person'
            }
          >
            {voiceBusyId === m.id
              ? '…'
              : m.canDirectVoice
                ? 'Voice on'
                : 'Voice off'}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Voice access ---------------- */

function VoiceAccessTab({
  users,
  busyId,
  onGrant,
  onRevoke,
}: {
  users: AdminDirectVoiceUser[] | null;
  busyId: string | null;
  onGrant: (email: string) => void;
  onRevoke: (userId: string) => void;
}) {
  const [email, setEmail] = useState('');
  const groups = groupByGuild(users ?? []);

  return (
    <>
      <section className="admin-section">
        <h2>Grant 1-on-1 voice</h2>
        <form
          className="admin-grant-form"
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (!value) return;
            onGrant(value);
            setEmail('');
          }}
        >
          <input
            className="admin-search"
            type="email"
            placeholder="Email of the owner or member to grant…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email to grant 1-on-1 voice to"
          />
          <button type="submit" disabled={!email.trim() || busyId !== null}>
            Grant
          </button>
        </form>
        <p className="muted admin-note">
          Only the people listed below see the 1-on-1 voice section at all. A
          call needs the permission on <strong>both</strong> sides and both
          people in the <strong>same guild</strong> — so grant it to a pair
          inside one guild. You can also toggle it straight from a member row
          under Guilds.
        </p>
      </section>

      <section className="admin-section">
        <h2>Who has it ({users?.length ?? 0})</h2>
        {!users ? <p className="muted">Loading…</p> : null}
        {users && users.length === 0 ? (
          <p className="muted">Nobody has 1-on-1 voice yet.</p>
        ) : null}
        {/* Grouped by guild, because that is the unit that can actually talk:
            two holders in different groups below cannot reach each other. */}
        {groups.map((group) => (
          <div key={group.key} className="admin-voice-group">
            <div className="admin-voice-group-head">
              <strong>{group.label}</strong>
              <span className="muted">
                {group.guildless
                  ? 'Granted, but in no guild — they can call nobody until they join one'
                  : group.users.length === 1
                    ? 'Only one person here — a call needs two in the same guild'
                    : `${group.users.length} people can call each other`}
              </span>
            </div>
            <div className="list">
              {group.users.map((u) => (
                <div key={u.id} className="list-row" style={{ cursor: 'default' }}>
                  <span className="admin-cell">
                    <strong>
                      {u.name}
                      {u.inGameName ? (
                        <span className="admin-ign"> · {u.inGameName}</span>
                      ) : null}
                    </strong>
                    <span>{u.email}</span>
                  </span>
                  <button
                    type="button"
                    className="admin-voice-btn on"
                    disabled={busyId === u.id}
                    onClick={() => onRevoke(u.id)}
                  >
                    {busyId === u.id ? '…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

/**
 * Bucket holders by guild, no-guild last. A holder with no guild cannot call
 * anyone at all, so they are called out rather than quietly listed as if the
 * permission were working for them.
 */
function groupByGuild(users: AdminDirectVoiceUser[]) {
  const NO_GUILD = '__none__';
  const byGuild = new Map<
    string,
    {
      key: string;
      label: string;
      guildless: boolean;
      users: AdminDirectVoiceUser[];
    }
  >();
  for (const user of users) {
    const key = user.guild?.id ?? NO_GUILD;
    let group = byGuild.get(key);
    if (!group) {
      group = {
        key,
        label: user.guild?.name ?? 'No guild',
        guildless: !user.guild,
        users: [],
      };
      byGuild.set(key, group);
    }
    group.users.push(user);
  }
  return [...byGuild.values()].sort((a, b) =>
    a.key === NO_GUILD ? 1 : b.key === NO_GUILD ? -1 : 0,
  );
}

/* ---------------- Health ---------------- */

function HealthTab({ health }: { health: AdminHealth | null }) {
  if (!health) return <p className="muted">Checking backend…</p>;

  const live = health.services.filter((s) => s.kind === 'live');
  const configured = health.services.filter((s) => s.kind === 'config');

  return (
    <>
      <section className="admin-section">
        <h2>API process</h2>
        <div className="admin-stats">
          <Stat label="Environment" text={health.process.env} />
          <Stat label="Uptime" text={formatUptime(health.process.uptimeSeconds)} />
          <Stat label="Memory" text={`${health.process.memoryMb} MB`} />
          <Stat label="Heap" text={`${health.process.heapUsedMb} MB`} />
          <Stat label="Node" text={health.process.nodeVersion} />
        </div>
        <p className="muted admin-note">
          Started {formatDate(health.process.startedAt)} · checked{' '}
          {formatRelative(health.checkedAt)} · re-checks every 30s on this tab.
        </p>
      </section>

      <section className="admin-section">
        <h2>Probed now</h2>
        <div className="list">
          {live.map((s) => (
            <ServiceRow key={s.key} check={s} />
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2>Configuration</h2>
        <div className="list">
          {configured.map((s) => (
            <ServiceRow key={s.key} check={s} />
          ))}
        </div>
        <p className="muted admin-note">
          These report whether credentials are present on the backend host —
          not that the provider answered. Nothing here calls out to a third
          party, so refreshing this page costs no quota.
        </p>
      </section>
    </>
  );
}

function ServiceRow({ check }: { check: adminApi.AdminServiceCheck }) {
  const dot =
    check.status === 'up'
      ? 'admin-dot-up'
      : check.status === 'down'
        ? 'admin-dot-down'
        : 'admin-dot-idle';
  return (
    <div className="list-row" style={{ cursor: 'default' }}>
      <span className={`admin-dot ${dot}`} />
      <span className="admin-cell">
        <strong>{check.label}</strong>
        <span>{check.detail}</span>
      </span>
      <span className="admin-row-meta">
        {check.status === 'up' ? 'OK' : check.status === 'down' ? 'Needs attention' : 'Off'}
        {typeof check.latencyMs === 'number' ? ` · ${check.latencyMs} ms` : ''}
      </span>
    </div>
  );
}

/* ---------------- Bits ---------------- */

function Stat({
  label,
  value,
  text,
  accent,
}: {
  label: string;
  value?: number;
  text?: string;
  accent?: boolean;
}) {
  const display = text ?? (typeof value === 'number' ? value.toLocaleString() : '—');
  return (
    <div className={`admin-stat${accent ? ' admin-stat-accent' : ''}`}>
      <span className="admin-stat-value">{display}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
