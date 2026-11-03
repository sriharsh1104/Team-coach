import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS, ROLE_OPTIONS, RoleOption, knownRolesOnly } from '../api/roles';
import * as orgApi from '../api/org';
import * as usersApi from '../api/users';
import { MembershipRole, Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { postAuthPath } from '../auth/postAuthPath';
import { BookStage, useBookTabs } from '../ui/BookTabs';
import { SesLoader } from '../ui/SesLoader';

type ProfileTab = 'user' | 'game' | 'devices' | 'social';
type SocialPlatform = 'whatsapp' | 'instagram' | 'discord' | 'youtube';

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'user', label: 'User' },
  { id: 'game', label: 'Game' },
  { id: 'devices', label: 'Devices' },
  { id: 'social', label: 'Social' },
];
const TAB_IDS = TABS.map((t) => t.id);

const SOCIAL_FIELDS: Array<{
  key: SocialPlatform;
  label: string;
  profileKey: keyof Pick<
    Profile,
    'whatsappUrl' | 'instagramUrl' | 'discordUrl' | 'youtubeUrl'
  >;
}> = [
  { key: 'whatsapp', label: 'WhatsApp', profileKey: 'whatsappUrl' },
  { key: 'instagram', label: 'Instagram', profileKey: 'instagramUrl' },
  { key: 'discord', label: 'Discord', profileKey: 'discordUrl' },
  { key: 'youtube', label: 'YouTube', profileKey: 'youtubeUrl' },
];

function SocialPlatformIcon({ name }: { name: SocialPlatform }) {
  switch (name) {
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-8.67 14.94L2 22l5.2-1.36A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 0 1 6.9 12.64l.4.7-.72 2.17-2.25-.59-.67.39A8.2 8.2 0 1 1 12 3.8zm4.55 10.63c-.22-.11-1.3-.64-1.5-.71-.2-.08-.35-.11-.5.11-.14.22-.57.71-.7.86-.13.14-.26.16-.48.05-.22-.11-.93-.34-1.77-1.1-.65-.58-1.1-1.3-1.23-1.52-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.4.11-.13.15-.22.22-.37.08-.15.04-.28-.02-.39-.06-.11-.5-1.2-.68-1.65-.18-.43-.36-.37-.5-.38h-.42c-.15 0-.39.06-.59.28-.2.22-.78.76-.78 1.86s.8 2.16.91 2.31c.11.15 1.57 2.4 3.81 3.36.53.23.95.37 1.27.47.54.17 1.03.15 1.42.09.43-.06 1.3-.53 1.49-1.05.18-.51.18-.95.13-1.05-.05-.09-.2-.15-.42-.26z"
          />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5zm0 7.2A2.7 2.7 0 1 1 14.7 12 2.7 2.7 0 0 1 12 14.7zM17.8 6.9a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1z"
          />
        </svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.27 5.33A16.6 16.6 0 0 0 14.9 4.2l-.2.37a14.8 14.8 0 0 1 3.55 1.4 12.7 12.7 0 0 0-11.5 0 14.5 14.5 0 0 1 3.5-1.4l-.2-.37A16.5 16.5 0 0 0 5.7 5.33 17.7 17.7 0 0 0 2.5 16.6a16.3 16.3 0 0 0 5 2.5l.64-.99a10.7 10.7 0 0 1-1.6-.76l.4-.3a12.1 12.1 0 0 0 10.1 0l.4.3a10.7 10.7 0 0 1-1.6.76l.64.99a16.3 16.3 0 0 0 5-2.5 17.6 17.6 0 0 0-3.28-11.27zM9.3 14.3c-.9 0-1.64-.8-1.64-1.78S8.4 10.74 9.3 10.74s1.65.8 1.64 1.78-.74 1.78-1.64 1.78zm5.4 0c-.9 0-1.64-.8-1.64-1.78s.74-1.78 1.64-1.78 1.65.8 1.64 1.78-.74 1.78-1.64 1.78z"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7L16 12z"
          />
        </svg>
      );
  }
}

function formatRoleBadge(
  role: MembershipRole | null,
  isOwner: boolean,
): string | null {
  if (!role) return isOwner ? 'Owner' : null;
  const label = role.charAt(0) + role.slice(1).toLowerCase();
  return `${label}${isOwner ? ' (Owner)' : ''}`;
}

function apiError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg?.toString() || 'Please try again.';
}

async function copyText(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* ignore */
  }
}

function CopyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  const heading = (
    <span className="profile-field-label">
      {icon}
      {label}
    </span>
  );

  if (!value) {
    return (
      <div className="profile-field">
        {heading}
        <span className="muted">—</span>
      </div>
    );
  }
  return (
    <div className="profile-field">
      {heading}
      <div className="profile-field-row">
        <span className="profile-field-value">{value}</span>
        <button
          type="button"
          className="btn btn-ghost profile-copy"
          onClick={() => copyText(value)}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function RoleChips({
  selected,
  onToggle,
  editable = true,
}: {
  selected: string[];
  onToggle?: (role: RoleOption) => void;
  editable?: boolean;
}) {
  return (
    <div className="role-chips">
      {ROLE_OPTIONS.map((role) => {
        const active = selected.includes(role);
        return (
          <button
            key={role}
            type="button"
            className={`role-chip${active ? ' active' : ''}`}
            disabled={!editable}
            onClick={() => onToggle?.(role)}
          >
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}

function isRequiredProfileFilled(profile: {
  phone?: string | null;
  inGameName?: string | null;
  inGameUid?: string | null;
}) {
  return !!(profile.phone && profile.inGameName && profile.inGameUid);
}

export function ProfilePage() {
  const { user, org, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { tab, openTab, turn } = useBookTabs(TAB_IDS, 'user');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Sticky for the whole User→Game→Devices→Social walk — stays true even
  // after required fields flip profileComplete, so optional tabs still get Continue.
  const [onboarding] = useState(() => !(user?.profileComplete ?? false));

  const load = useCallback(async () => {
    const data = await usersApi.getMyProfile();
    setProfile(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => {
      setError('Could not load profile');
      setLoading(false);
    });
  }, [load]);

  async function onProfileUpdated(updated: Profile) {
    setProfile(updated);
    await refreshUser();
  }

  if (loading) {
    return <SesLoader label="Loading profile" />;
  }

  if (!profile) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Profile</h1>
            <p>{user?.email}</p>
          </div>
        </div>
        <div className="content">
          {error ? <p className="error">{error}</p> : null}
        </div>
      </>
    );
  }

  const roleBadge = formatRoleBadge(profile.role, profile.isOwner);
  const current = profile;
  const userDone = !!current.phone;
  const gameDone = !!(current.inGameName && current.inGameUid);

  function canOpenTab(next: ProfileTab) {
    if (!onboarding) return true;
    if (next === 'user') return true;
    if (next === 'game') return userDone;
    // Devices / Social only after required User + Game are saved.
    return userDone && gameDone;
  }

  function tryOpenTab(next: ProfileTab) {
    if (!canOpenTab(next)) {
      setError(
        !userDone
          ? 'Save your name and phone first.'
          : 'Save your in-game name and UID first.',
      );
      openTab(!userDone ? 'user' : 'game');
      return;
    }
    setError(null);
    openTab(next);
  }

  async function onRequiredSaved(updated: Profile, fromTab: ProfileTab) {
    await onProfileUpdated(updated);
    if (!onboarding) return;
    if (fromTab === 'user') {
      openTab('game');
      return;
    }
    if (fromTab === 'game') {
      // Required fields done — walk optional Devices → Social before leaving.
      openTab('devices');
    }
  }

  async function finishProfileGate() {
    const me = await usersApi.getMyProfile();
    setProfile(me);
    await refreshUser();
    if (!isRequiredProfileFilled(me)) {
      setError('Phone, in-game name, and UID are required before you continue.');
      openTab(!me.phone ? 'user' : 'game');
      return;
    }
    navigate(postAuthPath({ profileComplete: true }, org));
  }

  function renderTab(active: string) {
    if (active === 'user') {
      return (
        <UserSection
          profile={current}
          email={user?.email ?? ''}
          mustComplete={onboarding}
          onUpdated={
            onboarding
              ? (updated) => onRequiredSaved(updated, 'user')
              : onProfileUpdated
          }
        />
      );
    }
    if (active === 'game') {
      return (
        <GameSection
          profile={current}
          mustComplete={onboarding}
          onUpdated={
            onboarding
              ? (updated) => onRequiredSaved(updated, 'game')
              : onProfileUpdated
          }
        />
      );
    }
    if (active === 'devices') {
      return (
        <DevicesSection
          profile={current}
          onDevicesChanged={load}
          mustComplete={onboarding}
          onContinue={() => openTab('social')}
        />
      );
    }
    return (
      <SocialSection
        profile={current}
        onUpdated={onProfileUpdated}
        mustComplete={onboarding}
        onContinue={() => void finishProfileGate()}
      />
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{onboarding ? 'Complete your profile' : profile.name}</h1>
          <p>
            {onboarding
              ? 'Phone, in-game name, and UID are required before you continue.'
              : null}
            {!onboarding && roleBadge ? `${roleBadge} · ` : null}
            {user?.email}
          </p>
        </div>
      </div>
      <div className="content profile-page">
        {onboarding ? (
          <p className="muted" style={{ marginTop: 0 }}>
            User and Game are required. Devices and Social are optional — use
            Continue to skip ahead.
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <nav className="profile-tabs" aria-label="Profile sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`profile-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => tryOpenTab(t.id)}
              aria-disabled={onboarding && !canOpenTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <BookStage
          tab={tab}
          turn={turn}
          className="panel profile-panel book-profile-panel"
        >
          {(active) => renderTab(active)}
        </BookStage>
      </div>
    </>
  );
}

function UserSection({
  profile,
  email,
  mustComplete = false,
  onUpdated,
}: {
  profile: Profile;
  email: string;
  mustComplete?: boolean;
  onUpdated: (p: Profile) => Promise<void>;
}) {
  const [editing, setEditing] = useState(mustComplete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [rosterRole, setRosterRole] = useState<MembershipRole | ''>(
    profile.role ?? '',
  );

  useEffect(() => {
    setName(profile.name);
    setPhone(profile.phone ?? '');
    setRosterRole(profile.role ?? '');
  }, [profile]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await usersApi.updateMyProfile({
        name: name.trim(),
        phone: phone.trim(),
      });
      let role = updated.role;
      if (profile.isOwner) {
        const saved = await orgApi.setOwnRosterRole(rosterRole || null);
        role = saved.role;
      }
      await onUpdated({ ...updated, role });
      if (!mustComplete) setEditing(false);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div className="profile-fields-grid">
          <CopyField label="Name" value={profile.name} />
          <CopyField label="Email" value={email} />
          <CopyField label="Phone" value={profile.phone ?? ''} />
        </div>
        <button
          type="button"
          className="btn profile-edit-btn"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form className="profile-form-grid" onSubmit={onSave}>
      <div className="field">
        <label htmlFor="pf-name">Name *</label>
        <input
          id="pf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pf-phone">Phone *</label>
        <input
          id="pf-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone number"
          required
        />
      </div>
      <div className="field field-span">
        <label htmlFor="pf-email">Email</label>
        <input
          id="pf-email"
          type="email"
          value={email || ''}
          disabled
          readOnly
        />
      </div>
      {profile.isOwner ? (
        <div className="field">
          <label htmlFor="pf-roster-role">Roster role</label>
          <select
            id="pf-roster-role"
            value={rosterRole}
            onChange={(e) => setRosterRole(e.target.value as MembershipRole | '')}
          >
            <option value="">Owner</option>
            <option value="PLAYER">Player</option>
            <option value="COACH">Coach</option>
            <option value="ANALYST">Analyst</option>
          </select>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Optional. You remain the owner if you leave this unset.
          </p>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="profile-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {mustComplete ? 'Continue' : 'Save'}
        </button>
        {!mustComplete ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setName(profile.name);
              setPhone(profile.phone ?? '');
              setRosterRole(profile.role ?? '');
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {busy ? <SesLoader label="Saving profile" /> : null}
    </form>
  );
}

function GameSection({
  profile,
  mustComplete = false,
  onUpdated,
}: {
  profile: Profile;
  mustComplete?: boolean;
  onUpdated: (p: Profile) => Promise<void>;
}) {
  const [editing, setEditing] = useState(mustComplete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState(() => knownRolesOnly(profile.roles));
  const [ign, setIgn] = useState(profile.inGameName ?? '');
  const [uid, setUid] = useState(profile.inGameUid ?? '');

  useEffect(() => {
    setRoles(knownRolesOnly(profile.roles));
    setIgn(profile.inGameName ?? '');
    setUid(profile.inGameUid ?? '');
  }, [profile]);

  function toggleRole(role: RoleOption) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!ign.trim() || !uid.trim()) {
      setError('In-game name and UID are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await usersApi.updateMyProfile({
        roles: knownRolesOnly(roles),
        inGameName: ign.trim(),
        inGameUid: uid.trim(),
      });
      await onUpdated(updated);
      if (!mustComplete) setEditing(false);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div className="profile-fields-grid">
          <div className="profile-field profile-field-span">
            <span className="profile-field-label">Role(s)</span>
            {knownRolesOnly(profile.roles).length > 0 ? (
              <RoleChips selected={profile.roles} editable={false} />
            ) : (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                No role set yet
              </p>
            )}
          </div>
          <CopyField
            label="In-Game Name (IGN)"
            value={profile.inGameName ?? ''}
          />
          <CopyField label="UID" value={profile.inGameUid ?? ''} />
        </div>
        <button
          type="button"
          className="btn profile-edit-btn"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form className="profile-form-grid" onSubmit={onSave}>
      <div className="field field-span">
        <label>Role(s)</label>
        <RoleChips selected={roles} onToggle={toggleRole} />
      </div>
      <div className="field">
        <label htmlFor="pf-ign">In-Game Name (IGN) *</label>
        <input
          id="pf-ign"
          value={ign}
          onChange={(e) => setIgn(e.target.value)}
          placeholder="Your in-game name"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pf-uid">UID *</label>
        <input
          id="pf-uid"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="Your in-game UID"
          required
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="profile-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {mustComplete ? 'Continue' : 'Save'}
        </button>
        {!mustComplete ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRoles(knownRolesOnly(profile.roles));
              setIgn(profile.inGameName ?? '');
              setUid(profile.inGameUid ?? '');
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {busy ? <SesLoader label="Saving game profile" /> : null}
    </form>
  );
}

function DevicesSection({
  profile,
  onDevicesChanged,
  mustComplete = false,
  onContinue,
}: {
  profile: Profile;
  onDevicesChanged: () => Promise<void>;
  mustComplete?: boolean;
  onContinue?: () => void;
}) {
  const empty = profile.devices.length === 0;
  // Empty list / first-time gate opens the add form so Name/Model are visible.
  const [editing, setEditing] = useState(empty || mustComplete);
  const [deviceName, setDeviceName] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (empty || mustComplete) setEditing(true);
  }, [empty, mustComplete]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!deviceName.trim() || !deviceModel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await usersApi.addDevice(deviceName.trim(), deviceModel.trim());
      setDeviceName('');
      setDeviceModel('');
      await onDevicesChanged();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await usersApi.removeDevice(id);
      await onDevicesChanged();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="profile-section-title">My Devices</h3>
      {empty ? (
        <p className="muted">No devices yet — add your first below.</p>
      ) : (
        <ul className="profile-device-list">
          {profile.devices.map((device) => (
            <li key={device.id} className="profile-device-row">
              <span>
                {device.name} — {device.model}
              </span>
              <div className="profile-device-actions">
                <button
                  type="button"
                  className="btn btn-ghost profile-copy"
                  onClick={() =>
                    copyText(`${device.name} — ${device.model}`)
                  }
                >
                  Copy
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)' }}
                    disabled={busy}
                    onClick={() => onRemove(device.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <form className="profile-form-grid" onSubmit={onAdd} style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="pf-dev-name">Device name</label>
            <input
              id="pf-dev-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Main rig"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pf-dev-model">Device model</label>
            <input
              id="pf-dev-model"
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
              placeholder="ROG Phone 8"
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="profile-actions">
            {mustComplete ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onContinue?.()}
              >
                Continue
              </button>
            ) : null}
            <button
              className={mustComplete ? 'btn btn-ghost' : 'btn btn-primary'}
              type="submit"
              disabled={busy || !deviceName.trim() || !deviceModel.trim()}
            >
              Add Device
            </button>
            {!empty && !mustComplete ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDeviceName('');
                  setDeviceModel('');
                  setEditing(false);
                  setError(null);
                }}
              >
                Done
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn profile-edit-btn"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      )}
      {busy ? <SesLoader label="Adding device" /> : null}
    </div>
  );
}

function SocialSection({
  profile,
  onUpdated,
  mustComplete = false,
  onContinue,
}: {
  profile: Profile;
  onUpdated: (p: Profile) => Promise<void>;
  mustComplete?: boolean;
  onContinue?: () => void;
}) {
  const [editing, setEditing] = useState(mustComplete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState(profile.whatsappUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(profile.instagramUrl ?? '');
  const [discordUrl, setDiscordUrl] = useState(profile.discordUrl ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(profile.youtubeUrl ?? '');

  useEffect(() => {
    setWhatsappUrl(profile.whatsappUrl ?? '');
    setInstagramUrl(profile.instagramUrl ?? '');
    setDiscordUrl(profile.discordUrl ?? '');
    setYoutubeUrl(profile.youtubeUrl ?? '');
  }, [profile]);

  async function persistSocial() {
    const updated = await usersApi.updateMyProfile({
      whatsappUrl: whatsappUrl.trim() || undefined,
      instagramUrl: instagramUrl.trim() || undefined,
      discordUrl: discordUrl.trim() || undefined,
      youtubeUrl: youtubeUrl.trim() || undefined,
    });
    await onUpdated(updated);
    return updated;
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await persistSocial();
      if (!mustComplete) setEditing(false);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onContinueClick() {
    setBusy(true);
    setError(null);
    try {
      // Save whatever they typed (all optional), then leave the gate.
      const hasAny =
        whatsappUrl.trim() ||
        instagramUrl.trim() ||
        discordUrl.trim() ||
        youtubeUrl.trim();
      if (hasAny) await persistSocial();
      onContinue?.();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const draftByKey: Record<SocialPlatform, string> = {
    whatsapp: whatsappUrl,
    instagram: instagramUrl,
    discord: discordUrl,
    youtube: youtubeUrl,
  };
  const setDraftByKey: Record<SocialPlatform, (v: string) => void> = {
    whatsapp: setWhatsappUrl,
    instagram: setInstagramUrl,
    discord: setDiscordUrl,
    youtube: setYoutubeUrl,
  };

  if (!editing) {
    return (
      <div>
        <div className="profile-fields-grid">
          {SOCIAL_FIELDS.map((field) => (
            <CopyField
              key={field.key}
              label={field.label}
              value={profile[field.profileKey] ?? ''}
              icon={
                <span
                  className={`profile-social-icon platform-${field.key}`}
                  aria-hidden="true"
                >
                  <SocialPlatformIcon name={field.key} />
                </span>
              }
            />
          ))}
        </div>
        <button
          type="button"
          className="btn profile-edit-btn"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form className="profile-form-grid" onSubmit={onSave}>
      {SOCIAL_FIELDS.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={`pf-${field.key}`} className="profile-social-label">
            <span
              className={`profile-social-icon platform-${field.key}`}
              aria-hidden="true"
            >
              <SocialPlatformIcon name={field.key} />
            </span>
            {field.label}
          </label>
          <input
            id={`pf-${field.key}`}
            value={draftByKey[field.key]}
            onChange={(e) => setDraftByKey[field.key](e.target.value)}
            placeholder={`${field.label} URL`}
          />
        </div>
      ))}
      {error ? <p className="error">{error}</p> : null}
      <div className="profile-actions">
        {mustComplete ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void onContinueClick()}
          >
            Continue
          </button>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save
          </button>
        )}
        {!mustComplete ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setWhatsappUrl(profile.whatsappUrl ?? '');
              setInstagramUrl(profile.instagramUrl ?? '');
              setDiscordUrl(profile.discordUrl ?? '');
              setYoutubeUrl(profile.youtubeUrl ?? '');
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {busy ? <SesLoader label="Saving social links" /> : null}
    </form>
  );
}
