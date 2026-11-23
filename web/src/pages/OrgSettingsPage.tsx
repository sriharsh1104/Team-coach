import { FormEvent, useCallback, useEffect, useState } from 'react';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

/** Owner-only org settings (Free Fire guild ID, etc.). */
export function OrgSettingsPage() {
  const { org } = useAuth();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [ffDraft, setFfDraft] = useState('');
  const [ffSaving, setFfSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await orgApi.getMyOrg();
      setDetail(next);
      setFfDraft(next.freeFireGuildId ?? '');
      setError(null);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load org settings'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (org && !org.isOwner) {
    return (
      <div className="content">
        <h1>Org Settings</h1>
        <p className="muted">Only the org owner can change these settings.</p>
      </div>
    );
  }

  async function onSaveFf(e: FormEvent) {
    e.preventDefault();
    setFfSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await orgApi.setFreeFireGuildId(ffDraft.trim() || null);
      setDetail((prev) =>
        prev ? { ...prev, freeFireGuildId: res.freeFireGuildId } : prev,
      );
      setFfDraft(res.freeFireGuildId ?? '');
      setNotice(
        res.freeFireGuildId
          ? 'Free Fire guild ID saved'
          : 'Free Fire guild ID cleared',
      );
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save Free Fire guild ID'));
    } finally {
      setFfSaving(false);
    }
  }

  return (
    <div className="content">
      <h1>Org Settings</h1>
      <p className="muted">
        Owner controls for your org. The Free Fire guild ID is shown with a
        copy button on the Guild page.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      {detail ? (
        <form onSubmit={onSaveFf} className="card" style={{ maxWidth: 420 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>
            Free Fire Guild ID
          </h2>
          <div className="field">
            <label htmlFor="ff-guild">Guild ID</label>
            <input
              id="ff-guild"
              inputMode="numeric"
              pattern="[0-9]*"
              value={ffDraft}
              onChange={(e) =>
                setFfDraft(e.target.value.replace(/\D/g, ''))
              }
              placeholder="e.g. 3015174327"
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={
              ffSaving || ffDraft === (detail.freeFireGuildId ?? '')
            }
          >
            {ffSaving ? 'Saving…' : 'Save Guild ID'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
