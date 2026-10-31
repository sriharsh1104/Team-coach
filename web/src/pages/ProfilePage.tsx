import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, ROLE_OPTIONS, RoleOption, knownRolesOnly } from '../api/roles';
import * as usersApi from '../api/users';
import { MembershipRole, Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type ProfileTab = 'user' | 'game' | 'devices' | 'social';

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'user', label: 'User' },
  { id: 'game', label: 'Game' },
  { id: 'devices', label: 'Devices' },
  { id: 'social', label: 'Social' },
];

function formatRoleBadge(
  role: MembershipRole | null,
  isOwner: boolean,
): string | null {
  if (!role) return null;
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

function CopyField({ label, value }: { label: string; value: string }) {
  if (!value) {
    return (
      <div className="profile-field">
        <span className="profile-field-label">{label}</span>
        <span className="muted">—</span>
      </div>
    );
  }
  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
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

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<ProfileTab>('user');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Profile</h1>
            <p>{user?.email}</p>
          </div>
        </div>
        <div className="content">
          <p className="muted">Loading…</p>
        </div>
      </>
    );
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

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{profile.name}</h1>
          <p>
            {roleBadge ? `${roleBadge} · ` : null}
            {user?.email}
          </p>
        </div>
      </div>
      <div className="content profile-page">
        <nav className="profile-tabs" aria-label="Profile sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`profile-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel profile-panel">
          {tab === 'user' ? (
            <UserSection
              profile={profile}
              email={user?.email ?? ''}
              onUpdated={onProfileUpdated}
            />
          ) : null}
          {tab === 'game' ? (
            <GameSection profile={profile} onUpdated={onProfileUpdated} />
          ) : null}
          {tab === 'devices' ? (
            <DevicesSection profile={profile} onDevicesChanged={load} />
          ) : null}
          {tab === 'social' ? (
            <SocialSection profile={profile} onUpdated={onProfileUpdated} />
          ) : null}
        </div>
      </div>
    </>
  );
}

function UserSection({
  profile,
  email,
  onUpdated,
}: {
  profile: Profile;
  email: string;
  onUpdated: (p: Profile) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');

  useEffect(() => {
    setName(profile.name);
    setPhone(profile.phone ?? '');
  }, [profile]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await usersApi.updateMyProfile({
        name: name.trim(),
        phone: phone.trim() || undefined,
      });
      await onUpdated(updated);
      setEditing(false);
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
        <label htmlFor="pf-phone">Phone</label>
        <input
          id="pf-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone number"
        />
      </div>
      <div className="field field-span">
        <label>Email</label>
        <p className="muted" style={{ margin: 0 }}>
          Signed up with {email || '—'}
        </p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="profile-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setName(profile.name);
            setPhone(profile.phone ?? '');
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function GameSection({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (p: Profile) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      const updated = await usersApi.updateMyProfile({
        roles: knownRolesOnly(roles),
        inGameName: ign.trim() || undefined,
        inGameUid: uid.trim() || undefined,
      });
      await onUpdated(updated);
      setEditing(false);
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
        <label htmlFor="pf-ign">In-Game Name (IGN)</label>
        <input
          id="pf-ign"
          value={ign}
          onChange={(e) => setIgn(e.target.value)}
          placeholder="Your in-game name"
        />
      </div>
      <div className="field">
        <label htmlFor="pf-uid">UID</label>
        <input
          id="pf-uid"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="Your in-game UID"
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="profile-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
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
      </div>
    </form>
  );
}

function DevicesSection({
  profile,
  onDevicesChanged,
}: {
  profile: Profile;
  onDevicesChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {profile.devices.length === 0 ? (
        <p className="muted">No devices yet.</p>
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
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !deviceName.trim() || !deviceModel.trim()}
            >
              {busy ? 'Adding…' : 'Add Device'}
            </button>
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
    </div>
  );
}

function SocialSection({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (p: Profile) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
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

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await usersApi.updateMyProfile({
        whatsappUrl: whatsappUrl.trim() || undefined,
        instagramUrl: instagramUrl.trim() || undefined,
        discordUrl: discordUrl.trim() || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
      });
      await onUpdated(updated);
      setEditing(false);
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
          <CopyField label="WhatsApp" value={profile.whatsappUrl ?? ''} />
          <CopyField label="Instagram" value={profile.instagramUrl ?? ''} />
          <CopyField label="Discord" value={profile.discordUrl ?? ''} />
          <CopyField label="YouTube" value={profile.youtubeUrl ?? ''} />
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
        <label htmlFor="pf-wa">WhatsApp</label>
        <input
          id="pf-wa"
          value={whatsappUrl}
          onChange={(e) => setWhatsappUrl(e.target.value)}
          placeholder="WhatsApp URL"
        />
      </div>
      <div className="field">
        <label htmlFor="pf-ig">Instagram</label>
        <input
          id="pf-ig"
          value={instagramUrl}
          onChange={(e) => setInstagramUrl(e.target.value)}
          placeholder="Instagram URL"
        />
      </div>
      <div className="field">
        <label htmlFor="pf-dc">Discord</label>
        <input
          id="pf-dc"
          value={discordUrl}
          onChange={(e) => setDiscordUrl(e.target.value)}
          placeholder="Discord URL"
        />
      </div>
      <div className="field">
        <label htmlFor="pf-yt">YouTube</label>
        <input
          id="pf-yt"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="YouTube URL"
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="profile-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
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
      </div>
    </form>
  );
}
