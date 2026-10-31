import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_RECORDS_PAGE_SIZE,
  RECORD_KINDS,
  RecordKind,
  TournamentRecord,
  TournamentRecordInput,
  createTournamentRecord,
  deleteTournamentRecord,
  listTournamentRecords,
  updateTournamentRecord,
} from '../api/tournamentRecords';
import { useAuth } from '../auth/AuthContext';

const EMPTY: TournamentRecordInput = {
  name: '',
  status: '',
  kind: 'upcoming',
  progress: '',
  qualifierDate: '',
};

function statusClass(kind: string) {
  switch (kind) {
    case 'qualified':
    case 'result':
      return 'place-champ';
    case 'registered':
      return 'place-second';
    case 'upcoming':
      return 'place-top';
    case 'did_not_qualify':
      return 'place-dnf';
    default:
      return 'place-default';
  }
}

/**
 * After login — every org member (player / coach / analyst) sees the tournament
 * list. Only coaches / owners get add-edit-delete controls.
 */
export function ManageTournamentRecordsPage() {
  const { org } = useAuth();
  const canEdit = !!org && (org.isOwner || org.role === 'COACH');
  const [rows, setRows] = useState<TournamentRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(DEFAULT_RECORDS_PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TournamentRecordInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload(nextPage = page) {
    const data = await listTournamentRecords(nextPage, pageSize);
    setRows(data.items);
    setPage(data.page);
    setTotalPages(data.totalPages);
    setTotal(data.total);
  }

  useEffect(() => {
    reload(page).catch(() => setListError('Could not load records'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when page changes
  }, [page, pageSize]);

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) closeModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, busy]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(row: TournamentRecord) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      status: row.status,
      kind: row.kind,
      progress: row.progress ?? '',
      qualifierDate: row.qualifierDate ?? '',
      sortOrder: row.sortOrder,
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    const payload: TournamentRecordInput = {
      name: form.name.trim(),
      status: form.status.trim(),
      kind: form.kind,
      progress: form.progress?.toString().trim() || null,
      qualifierDate: form.qualifierDate?.toString().trim() || null,
      sortOrder: form.sortOrder,
    };
    const wasEdit = !!editingId;
    try {
      if (editingId) {
        await updateTournamentRecord(editingId, payload);
      } else {
        await createTournamentRecord(payload);
      }
      setModalOpen(false);
      setForm(EMPTY);
      setEditingId(null);
      if (!wasEdit) {
        setPage(1);
        await reload(1);
      } else {
        await reload(page);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg.join(', ')
          : msg?.toString() || 'Save failed (coach/owner only)',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!canEdit) return;
    if (!confirm('Delete this tournament record?')) return;
    setBusy(true);
    try {
      await deleteTournamentRecord(id);
      if (editingId === id) closeModal();
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      else await reload(nextPage);
    } catch {
      setListError('Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const snoBase = (page - 1) * pageSize;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Tournament records</h1>
          <p>
            {canEdit
              ? 'Coach / owner — add or edit Sacred tournament records'
              : 'Sacred team tournament list (login required)'}
          </p>
        </div>
        <div className="topbar-actions">
          <Link to="/" className="btn btn-ghost">
            View public site
          </Link>
        </div>
      </div>
      <div className="content">
        <div className="panel">
          <div className="records-panel-head">
            <h3 style={{ margin: 0 }}>Records list</h3>
            {canEdit ? (
              <button
                type="button"
                className="btn btn-primary topbar-add-btn"
                onClick={openCreate}
              >
                Add record
              </button>
            ) : null}
          </div>
          {listError ? <p className="error">{listError}</p> : null}
          <div className="record-table-wrap" style={{ marginTop: 8 }}>
            <table className="record-table">
              <thead>
                <tr>
                  <th className="record-sno">S.No</th>
                  <th>Tournament</th>
                  <th>Status</th>
                  <th>How far</th>
                  <th>Qualifier date</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <td className="record-sno">{snoBase + index + 1}</td>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>
                      <span className={`place-pill ${statusClass(row.kind)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <span className="record-note">{row.progress ?? '—'}</span>
                    </td>
                    <td>{row.qualifierDate ?? '—'}</td>
                    {canEdit ? (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => onDelete(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="muted">
                      No records yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="records-pagination">
            <span className="muted">
              {total === 0
                ? '0 records'
                : `${snoBase + 1}–${snoBase + rows.length} of ${total}`}
            </span>
            <div className="records-pagination-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page <= 1 || busy}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="records-page-label">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page >= totalPages || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {!canEdit ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Only coaches / owners can add or edit records. You can view the full
            list above.
          </p>
        ) : null}
      </div>

      {modalOpen && canEdit ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="record-modal-title">
                {editingId ? 'Edit record' : 'Add record'}
              </h2>
              <button
                type="button"
                className="btn btn-ghost modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="name">Tournament</label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="status">Status pill</label>
                <input
                  id="status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                  placeholder="Registered / Qualified / Top 7…"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="kind">Kind</label>
                <select
                  id="kind"
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      kind: e.target.value as RecordKind,
                    }))
                  }
                >
                  {RECORD_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="progress">How far</label>
                <input
                  id="progress"
                  value={form.progress ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, progress: e.target.value }))
                  }
                  placeholder="Qualified till round 4"
                />
              </div>
              <div className="field">
                <label htmlFor="date">Qualifier date</label>
                <input
                  id="date"
                  value={form.qualifierDate ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, qualifierDate: e.target.value }))
                  }
                  placeholder="1 Nov"
                />
              </div>
              {error ? <p className="error">{error}</p> : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary modal-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? 'Saving…'
                    : editingId
                      ? 'Save changes'
                      : 'Add record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
