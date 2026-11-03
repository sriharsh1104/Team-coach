import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import * as orgApi from '../../api/org';
import {
  GuildDetail,
  GuildMemberRow,
  GuildRole,
  GuildRosterMember,
  MembershipRole,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { copyText } from '../../lib/copyText';
import { BookStage, useBookTabs } from '../../ui/BookTabs';
import { InviteSharePanel } from '../../ui/InviteSharePanel';
import { SesLoader } from '../../ui/SesLoader';

const PAGE_SIZE = 10;
const GUILD_TABS = [
  { id: 'members', label: 'Members' },
  { id: 'roster', label: 'Roster' },
] as const;
type GuildTabId = (typeof GUILD_TABS)[number]['id'];
const GUILD_TAB_IDS = GUILD_TABS.map((t) => t.id);

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    safePage,
    totalPages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
  };
}

const GUILD_ROLE_LABEL: Record<GuildRole, string> = {
  MEMBER: 'Member',
  ELDER: 'Elder',
  ACTIVE_LEADER: 'Active Leader',
  LEADER: 'Leader',
};

const ROSTER_ROLE_LABEL: Record<MembershipRole, string> = {
  PLAYER: 'Player',
  COACH: 'Coach',
  ANALYST: 'Analyst',
};

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

function personLabel(name: string, inGameName: string | null) {
  return inGameName ? `${inGameName} · ${name}` : name;
}

export function GuildSpacePage() {
  const { user, org, guild, setOrg, setGuild } = useAuth();
  if (!user) return null;
  if (org && !org.isOwner) return <Navigate to="/app" replace />;
  if (!guild && !org) {
    return <GuildSetup setOrg={setOrg} setGuild={setGuild} />;
  }
  return <GuildHome />;
}

function GuildSetup({
  setOrg,
  setGuild,
}: {
  setOrg: (org: {
    id: string;
    name: string;
    role: MembershipRole | null;
    isOwner: boolean;
  }) => void;
  setGuild: (guild: { id: string; name: string; role: GuildRole }) => void;
}) {
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice');
  const [name, setName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await orgApi.createOrg(name.trim());
      setOrg({
        id: created.id,
        name: created.name,
        role: created.myRole,
        isOwner: created.isOwner,
      });
      setGuild({ id: created.id, name: created.name, role: 'LEADER' });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not create the org'));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const joined = await orgApi.joinGuild({ orgCode: orgCode.trim() });
      setGuild({ id: joined.id, name: joined.name, role: joined.role });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not join that guild'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {mode === 'choice' ? (
          <>
            <h1 className="brand">Join a Guild</h1>
            <p className="auth-sub">
              Enter your org code to join the guild, or create a new org. Guild
              join does not put you on the esports roster.
            </p>
            <button className="btn btn-primary" type="button" onClick={() => setMode('join')}>
              Join with org code
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setMode('create')}>
              Create a new org
            </button>
          </>
        ) : null}

        {mode === 'join' ? (
          <form onSubmit={onJoin}>
            <h1 className="brand">Join Guild</h1>
            <p className="auth-sub">
              You can see the roster and use guild chat. The owner adds you to
              the roster separately.
            </p>
            <div className="field">
              <label htmlFor="guild-org-code">Org code</label>
              <input
                id="guild-org-code"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                autoCapitalize="characters"
                required
              />
            </div>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Join guild
            </button>
            <p className="auth-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setMode('choice')}>
                Back
              </button>
            </p>
          </form>
        ) : null}

        {mode === 'create' ? (
          <form onSubmit={onCreate}>
            <h1 className="brand">Create Org</h1>
            <p className="auth-sub">
              You become the owner. Next you&apos;ll fill in your profile. A
              coach can be you or someone else — that choice is optional.
            </p>
            <div className="field">
              <label htmlFor="new-org-name">Org name</label>
              <input
                id="new-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Create org
            </button>
            <p className="auth-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setMode('choice')}>
                Back
              </button>
            </p>
          </form>
        ) : null}
      </div>
      {busy ? (
        <SesLoader label={mode === 'join' ? 'Joining guild' : 'Creating org'} />
      ) : null}
    </div>
  );
}

function ListPagination({
  total,
  from,
  to,
  page,
  totalPages,
  onPage,
}: {
  total: number;
  from: number;
  to: number;
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="records-pagination">
      <span className="muted">
        {from}–{to} of {total}
      </span>
      <div className="records-pagination-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <span className="records-page-label">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function GuildHome() {
  const { user, refreshUser } = useAuth();
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [membersPage, setMembersPage] = useState(1);
  const [rosterPage, setRosterPage] = useState(1);
  const { tab, openTab, turn } = useBookTabs(GUILD_TAB_IDS, 'members');

  async function onCopyOrgCode() {
    if (!detail?.orgCode) return;
    const ok = await copyText(detail.orgCode);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  async function load() {
    const next = await orgApi.getMyGuild();
    setDetail(next);
    await refreshUser();
  }

  useEffect(() => {
    load().catch(() => setError('Could not load the guild'));
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(next: GuildTabId) {
    openTab(next);
    if (next === 'members') setMembersPage(1);
    else setRosterPage(1);
  }

  async function onAdd(userId: string, role: MembershipRole) {
    setBusyId(userId);
    setError(null);
    try {
      await orgApi.addGuildMemberToRoster(userId, role);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not add them to the roster'));
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      await orgApi.removeFromRoster(userId);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not remove them from the roster'));
    } finally {
      setBusyId(null);
    }
  }

  const guildMembers = detail?.members ?? [];
  const roster = detail?.roster ?? [];
  const waitingCount = guildMembers.filter((m) => !m.onRoster).length;
  const membersPaging = paginate(guildMembers, membersPage, PAGE_SIZE);
  const rosterPaging = paginate(roster, rosterPage, PAGE_SIZE);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{detail?.name ?? 'Guild'}</h1>
          <p>
            {detail?.orgCode ? (
              <>
                <button
                  type="button"
                  className="copyable-code"
                  onClick={onCopyOrgCode}
                  aria-label="Copy guild code"
                >
                  Guild code {detail.orgCode}
                </button>
                {copied ? ' · Copied' : ''}
              </>
            ) : (
              'Roster is view only'
            )}
            {detail ? ` · ${GUILD_ROLE_LABEL[detail.myGuildRole]}` : ''}
            {detail
              ? ` · ${guildMembers.length} member(s) · ${roster.length} on roster`
              : ''}
          </p>
        </div>
      </div>
      <div className="content">
        {error ? <p className="error">{error}</p> : null}

        {detail?.referralLink ? (
          <InviteSharePanel
            referralLink={detail.referralLink}
            orgCode={detail.orgCode}
            title="Invite To Join"
          />
        ) : null}

        <nav className="pill-switch" aria-label="Guild lists" role="tablist">
          {GUILD_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`pill-switch-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <BookStage tab={tab} turn={turn} className="guild-list-stage">
          {(active) =>
            active === 'members' ? (
              <MembersTab
                members={membersPaging.slice}
                canManage={!!detail?.canManageRoster}
                busyId={busyId}
                waitingCount={waitingCount}
                total={membersPaging.total}
                onAdd={onAdd}
                paging={membersPaging}
                onPage={setMembersPage}
              />
            ) : (
              <RosterTab
                roster={rosterPaging.slice}
                canManage={!!detail?.canManageRoster}
                selfId={user?.id}
                busyId={busyId}
                onRemove={onRemove}
                paging={rosterPaging}
                onPage={setRosterPage}
              />
            )
          }
        </BookStage>
      </div>
      {busyId ? <SesLoader label="Updating roster" /> : null}
    </>
  );
}

function MembersTab({
  members,
  canManage,
  busyId,
  waitingCount,
  total,
  onAdd,
  paging,
  onPage,
}: {
  members: GuildMemberRow[];
  canManage: boolean;
  busyId: string | null;
  waitingCount: number;
  total: number;
  onAdd: (userId: string, role: MembershipRole) => void;
  paging: ReturnType<typeof paginate<GuildMemberRow>>;
  onPage: (page: number) => void;
}) {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Everyone who joined the guild. Tap a name to open their game profile
        (devices + social — phone and email stay private).
      </p>
      <div className="list">
        {members.map((member) => (
          <div
            key={member.userId}
            className="list-row guild-add-row"
            style={{ cursor: 'default' }}
          >
            <div>
              <Link
                className="member-name-link"
                to={`/members/${member.userId}`}
              >
                <strong>
                  {personLabel(member.name, member.inGameName)}
                  {member.isOwner ? ' · Owner' : ''}
                </strong>
              </Link>
              <span>
                {GUILD_ROLE_LABEL[member.guildRole]}
                {member.onRoster
                  ? member.rosterRole
                    ? ` · Roster ${ROSTER_ROLE_LABEL[member.rosterRole]}`
                    : ' · On roster'
                  : ' · Not on roster'}
              </span>
            </div>
            {canManage && !member.onRoster ? (
              <AddActions
                label={personLabel(member.name, member.inGameName)}
                busy={busyId === member.userId}
                onAdd={(role) => onAdd(member.userId, role)}
              />
            ) : null}
          </div>
        ))}
        {total === 0 ? <p className="muted">No guild members yet.</p> : null}
      </div>
      {canManage && waitingCount === 0 && total > 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Everyone in the guild is already on the roster.
        </p>
      ) : null}
      <ListPagination
        total={paging.total}
        from={paging.from}
        to={paging.to}
        page={paging.safePage}
        totalPages={paging.totalPages}
        onPage={onPage}
      />
    </>
  );
}

function RosterTab({
  roster,
  canManage,
  selfId,
  busyId,
  onRemove,
  paging,
  onPage,
}: {
  roster: GuildRosterMember[];
  canManage: boolean;
  selfId?: string;
  busyId: string | null;
  onRemove: (userId: string) => void;
  paging: ReturnType<typeof paginate<GuildRosterMember>>;
  onPage: (page: number) => void;
}) {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Esports roster seats. Tap a name for their game profile.
      </p>
      <div className="list">
        {roster.map((member) => (
          <div
            key={member.userId}
            className="list-row"
            style={{ cursor: 'default' }}
          >
            <div>
              <Link
                className="member-name-link"
                to={`/members/${member.userId}`}
              >
                <strong>
                  {personLabel(member.name, member.inGameName)}
                  {member.isOwner ? ' · Owner' : ''}
                </strong>
              </Link>
              <span>
                {member.role ? ROSTER_ROLE_LABEL[member.role] : 'Owner'}
              </span>
            </div>
            {canManage && !member.isOwner && member.userId !== selfId ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId === member.userId}
                onClick={() => onRemove(member.userId)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {paging.total === 0 ? (
          <p className="muted">No one is on the roster yet.</p>
        ) : null}
      </div>
      <ListPagination
        total={paging.total}
        from={paging.from}
        to={paging.to}
        page={paging.safePage}
        totalPages={paging.totalPages}
        onPage={onPage}
      />
    </>
  );
}

function AddActions({
  label,
  busy,
  onAdd,
}: {
  label: string;
  busy: boolean;
  onAdd: (role: MembershipRole) => void;
}) {
  const [role, setRole] = useState<MembershipRole>('PLAYER');
  return (
    <div className="guild-add-actions">
      <select
        aria-label={`Roster role for ${label}`}
        value={role}
        onChange={(e) => setRole(e.target.value as MembershipRole)}
      >
        <option value="PLAYER">Player</option>
        <option value="COACH">Coach</option>
        <option value="ANALYST">Analyst</option>
      </select>
      <button
        type="button"
        className="btn btn-primary topbar-add-btn"
        disabled={busy}
        onClick={() => onAdd(role)}
      >
        Add
      </button>
    </div>
  );
}
