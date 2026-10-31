import { useEffect, useState } from 'react';
import * as usersApi from '../api/users';
import { Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    usersApi
      .getMyProfile()
      .then(setProfile)
      .catch(() => setError('Could not load profile'));
  }, []);

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
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{profile?.name ?? user?.name}</h2>
          <p className="muted">
            IGN: {profile?.inGameName ?? '—'}
            <br />
            UID: {profile?.inGameUid ?? '—'}
            <br />
            Roles: {(profile?.roles ?? []).join(', ') || '—'}
          </p>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Devices</h3>
          {(profile?.devices ?? []).length === 0 ? (
            <p className="muted">No devices listed.</p>
          ) : (
            <div className="list">
              {profile!.devices.map((d) => (
                <div key={d.id} className="list-row" style={{ cursor: 'default' }}>
                  <div>
                    <strong>{d.name}</strong>
                    <span>{d.model}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
