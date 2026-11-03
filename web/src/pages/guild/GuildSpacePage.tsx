import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import * as orgApi from '../../api/org';
import { GuildDetail, GuildRole, MembershipRole } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { copyText } from '../../lib/copyText';
import { SesLoader } from '../../ui/SesLoader';

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

function GuildHome() {
  const { user, refreshUser } = useAuth();
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const waiting = detail?.members.filter((member) => !member.onRoster) ?? [];

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
          </p>
        </div>
      </div>
      <div className="content">
        {error ? <p className="error">{error}</p> : null}
        <h2 className="sidebar-label" style={{ marginLeft: 0 }}>
          Roster
        </h2>
        <div className="list">
          {detail?.roster.map((member) => (
            <div key={member.userId} className="list-row" style={{ cursor: 'default' }}>
              <div>
                <strong>
                  {personLabel(member.name, member.inGameName)}
                  {member.isOwner ? ' · Owner' : ''}
                </strong>
                <span>
                  {member.role ? ROSTER_ROLE_LABEL[member.role] : 'Owner'}
                </span>
              </div>
              {detail.canManageRoster && !member.isOwner && member.userId !== user?.id ? (
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
          {detail && detail.roster.length === 0 ? (
            <p className="muted">No one is on the roster yet.</p>
          ) : null}
        </div>

        {detail?.canManageRoster ? (
          <>
            <h2 className="sidebar-label" style={{ margin: '22px 0 10px' }}>
              Guild members
            </h2>
            <p className="muted">
              Add someone here to put them on the esports roster. Removing them
              from the roster keeps their guild seat.
            </p>
            <div className="list">
              {waiting.map((member) => (
                <AddRow
                  key={member.userId}
                  label={personLabel(member.name, member.inGameName)}
                  roleLabel={GUILD_ROLE_LABEL[member.guildRole]}
                  busy={busyId === member.userId}
                  onAdd={(role) => onAdd(member.userId, role)}
                />
              ))}
              {waiting.length === 0 ? (
                <p className="muted">Everyone in the guild is already on the roster.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {busyId ? <SesLoader label="Updating roster" /> : null}
    </>
  );
}

function AddRow({
  label,
  roleLabel,
  busy,
  onAdd,
}: {
  label: string;
  roleLabel: string;
  busy: boolean;
  onAdd: (role: MembershipRole) => void;
}) {
  const [role, setRole] = useState<MembershipRole>('PLAYER');
  return (
    <div className="list-row guild-add-row" style={{ cursor: 'default' }}>
      <div>
        <strong>{label}</strong>
        <span>{roleLabel}</span>
      </div>
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
    </div>
  );
}
