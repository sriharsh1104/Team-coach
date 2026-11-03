import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { knownRolesOnly, roleLabel } from '../api/roles';
import * as usersApi from '../api/users';
import { MembershipRole, Profile } from '../api/types';
import { copyText } from '../lib/copyText';
import { SesLoader } from '../ui/SesLoader';

const SOCIAL: Array<{
  key: keyof Pick<
    Profile,
    'whatsappUrl' | 'instagramUrl' | 'discordUrl' | 'youtubeUrl'
  >;
  label: string;
}> = [
  { key: 'whatsappUrl', label: 'WhatsApp' },
  { key: 'instagramUrl', label: 'Instagram' },
  { key: 'discordUrl', label: 'Discord' },
  { key: 'youtubeUrl', label: 'YouTube' },
];

function roleBadge(role: MembershipRole | null, isOwner: boolean): string | null {
  if (!role) return isOwner ? 'Owner' : null;
  const label = role.charAt(0) + role.slice(1).toLowerCase();
  return `${label}${isOwner ? ' (Owner)' : ''}`;
}

function errorMessage(err: unknown) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Could not load profile';
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="member-profile-row">
      <div>
        <span className="muted">{label}</span>
        <strong>{value}</strong>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** Read-only teammate profile: game, devices, social — never phone/email. */
export function MemberProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setError('Missing member id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    usersApi
      .getMemberProfile(userId)
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <SesLoader label="Loading profile" />;

  if (error || !profile) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Member</h1>
            <p>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                Back
              </button>
            </p>
          </div>
        </div>
        <div className="content">
          <p className="error">{error ?? 'Not found'}</p>
        </div>
      </>
    );
  }

  const badge = roleBadge(profile.role, profile.isOwner);
  const gameRoles = knownRolesOnly(profile.roles);
  const socials = SOCIAL.filter((s) => profile[s.key]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{profile.name}</h1>
          <p>
            {badge ?? 'Guild member'}
            {' · '}
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Back
            </button>
          </p>
        </div>
      </div>
      <div className="content member-profile">
        <section className="panel">
          <h2 className="profile-section-title">Game</h2>
          {gameRoles.length > 0 ? (
            <p className="member-role-chips">
              {gameRoles.map((role) => (
                <span key={role} className="role-chip">
                  {roleLabel(role)}
                </span>
              ))}
            </p>
          ) : (
            <p className="muted">No in-game role set yet</p>
          )}
          {profile.inGameName ? (
            <CopyRow label="In-game name" value={profile.inGameName} />
          ) : null}
          {profile.inGameUid ? (
            <CopyRow label="UID" value={profile.inGameUid} />
          ) : null}
          {!profile.inGameName && !profile.inGameUid ? (
            <p className="muted">No IGN / UID yet</p>
          ) : null}
        </section>

        <section className="panel">
          <h2 className="profile-section-title">Devices</h2>
          {profile.devices.length === 0 ? (
            <p className="muted">No devices listed</p>
          ) : (
            profile.devices.map((device) => (
              <CopyRow
                key={device.id}
                label={device.name}
                value={device.model}
              />
            ))
          )}
        </section>

        <section className="panel">
          <h2 className="profile-section-title">Social</h2>
          {socials.length === 0 ? (
            <p className="muted">No social links yet</p>
          ) : (
            socials.map(({ key, label }) => {
              const url = profile[key] as string;
              return (
                <div key={key} className="member-profile-row">
                  <div>
                    <span className="muted">{label}</span>
                    <a href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => copyText(url)}
                  >
                    Copy
                  </button>
                </div>
              );
            })
          )}
        </section>

        <p className="muted">
          Phone and email stay private.{' '}
          <Link to="/profile">Edit your own profile</Link>
        </p>
      </div>
    </>
  );
}
