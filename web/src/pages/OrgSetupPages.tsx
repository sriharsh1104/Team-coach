import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { extractInviteToken } from '../auth/invitePending';
import { SesLoader } from '../ui/SesLoader';

export function OrgChoicePage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="brand">Join your org</h1>
        <p className="auth-sub">
          Create a new Sacred Esports workspace or join with an org code.
        </p>
        <Link className="btn btn-primary" to="/org/create" style={{ textDecoration: 'none' }}>
          Create org
        </Link>
        <div style={{ height: 10 }} />
        <Link className="btn btn-ghost" to="/org/join" style={{ width: '100%', justifyContent: 'center' }}>
          Join with code
        </Link>
      </div>
    </div>
  );
}

export function CreateOrgPage() {
  const { setOrg } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const org = await orgApi.createOrg(name.trim());
      setOrg({
        id: org.id,
        name: org.name,
        role: org.myRole,
        isOwner: org.isOwner,
      });
      navigate('/guild');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Create failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="brand">Create org</h1>
        <p className="auth-sub">
          You become the owner. Next you&apos;ll fill in your profile.
        </p>
        <div className="field">
          <label htmlFor="orgName">Org name</label>
          <input
            id="orgName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Create
        </button>
        <p className="auth-footer">
          <Link to="/org">Back</Link>
        </p>
      </form>
      {busy ? <SesLoader label="Creating org" /> : null}
    </div>
  );
}

export function JoinOrgPage() {
  const { setOrg, setGuild } = useAuth();
  const navigate = useNavigate();
  const [orgCode, setOrgCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmed = orgCode.trim();
      const token = extractInviteToken(trimmed);
      const org = await orgApi.joinOrg(
        trimmed.length === 6 && !trimmed.includes('/')
          ? { orgCode: trimmed.toUpperCase() }
          : { referralToken: token || trimmed },
      );
      setOrg({
        id: org.id,
        name: org.name,
        role: org.myRole,
        isOwner: org.isOwner,
      });
      setGuild({ id: org.id, name: org.name, role: 'MEMBER' });
      navigate('/app');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Join failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="brand">Join org</h1>
        <div className="field">
          <label htmlFor="code">Org code or invite link</label>
          <input
            id="code"
            value={orgCode}
            onChange={(e) => setOrgCode(e.target.value)}
            placeholder="6-char code or /join/… link"
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Join
        </button>
        <p className="auth-footer">
          <Link to="/org">Back</Link>
        </p>
      </form>
      {busy ? <SesLoader label="Joining org" /> : null}
    </div>
  );
}
