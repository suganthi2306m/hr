import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import apiClient from '../api/client';
import SlideOverPanel from '../components/common/SlideOverPanel';
import { holidayOverlapsYear, inclusiveDayCount } from '../utils/companyHolidays';

function IconEdit({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Edit"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100 disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

function IconDelete({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Delete"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20 disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

function branchLabelList(branches, ids) {
  const idSet = new Set((ids || []).map((id) => String(id)));
  if (!idSet.size) return 'All branches';
  const names = (branches || [])
    .filter((b) => b._id && idSet.has(String(b._id)))
    .map((b) => String(b.name || '').trim() || 'Branch');
  return names.length ? names.join(', ') : '—';
}

function HolidaysPage() {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [year, setYear] = useState(() => dayjs().year());
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formBranchIds, setFormBranchIds] = useState(() => new Set());

  const holidays = useMemo(
    () => (Array.isArray(company?.orgSetup?.holidays) ? company.orgSetup.holidays : []),
    [company],
  );
  const branches = useMemo(() => (Array.isArray(company?.branches) ? company.branches : []), [company]);

  const rowsForYear = useMemo(() => {
    return holidays
      .filter((h) => holidayOverlapsYear(h, year))
      .slice()
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  }, [holidays, year]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/company');
      setCompany(data?.company || null);
    } catch (e) {
      setCompany(null);
      setError(e?.response?.data?.message || 'Failed to load company.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persistHolidays = async (nextList) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.put('/company', {
        orgSetup: {
          holidays: nextList,
        },
      });
      setCompany(data?.company || null);
      setMessage('Saved.');
      setPanelOpen(false);
      setEditingId('');
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not save holidays.');
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditingId('');
    setFormName('');
    setFormStart(`${year}-01-01`);
    setFormEnd(`${year}-01-01`);
    setFormBranchIds(new Set());
    setPanelOpen(true);
  };

  const openEdit = (h) => {
    setEditingId(String(h._id));
    setFormName(String(h.name || ''));
    setFormStart(String(h.startDate || '').slice(0, 10));
    setFormEnd(String(h.endDate != null ? h.endDate : h.startDate || '').slice(0, 10));
    const ids = new Set((Array.isArray(h.branchIds) ? h.branchIds : []).map((id) => String(id)));
    setFormBranchIds(ids);
    setPanelOpen(true);
  };

  const toggleBranch = (id) => {
    const sid = String(id);
    setFormBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const handleSaveForm = async () => {
    const name = formName.trim();
    if (!name) {
      setError('Holiday name is required.');
      return;
    }
    const start = String(formStart).slice(0, 10);
    let end = String(formEnd || formStart).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      setError('Please choose valid from and to dates.');
      return;
    }
    if (end < start) end = start;
    const branchIds = formBranchIds.size ? [...formBranchIds] : [];
    const entry = editingId
      ? { _id: editingId, name, startDate: start, endDate: end, branchIds }
      : { name, startDate: start, endDate: end, branchIds };
    const others = holidays.filter((h) => String(h._id) !== editingId);
    await persistHolidays([...others, entry]);
  };

  const handleDelete = async (id) => {
    const sid = String(id);
    if (!window.confirm('Remove this holiday?')) return;
    await persistHolidays(holidays.filter((h) => String(h._id) !== sid));
  };

  return (
    <section className="space-y-4">
      <div className="flux-card space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-dark">Holiday list</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2 py-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-semibold text-dark hover:bg-neutral-100"
                onClick={() => setYear((y) => y - 1)}
                aria-label="Previous year"
              >
                ‹
              </button>
              <span className="min-w-[3.5rem] text-center text-sm font-bold tabular-nums">{year}</span>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-semibold text-dark hover:bg-neutral-100"
                onClick={() => setYear((y) => y + 1)}
                aria-label="Next year"
              >
                ›
              </button>
            </div>
            <button type="button" className="btn-primary px-4 py-2 text-sm font-semibold" onClick={openAdd}>
              + Add holiday
            </button>
          </div>
        </div>

        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {rowsForYear.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      No holidays for {year}. Add one to show on attendance calendars.
                    </td>
                  </tr>
                ) : (
                  rowsForYear.map((h, idx) => {
                    const sk = String(h.startDate || '').slice(0, 10);
                    const ek = String(h.endDate != null ? h.endDate : h.startDate || '').slice(0, 10);
                    const days = inclusiveDayCount(sk, ek);
                    return (
                      <tr key={String(h._id)} className="hover:bg-neutral-50/80">
                        <td className="px-3 py-2.5 tabular-nums text-slate-600">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-dark">{h.name}</td>
                        <td className="px-3 py-2.5 text-slate-700">{dayjs(sk).format('DD MMM YYYY')}</td>
                        <td className="px-3 py-2.5 text-slate-700">{dayjs(ek).format('DD MMM YYYY')}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {days} day{days === 1 ? '' : 's'}
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-600" title={branchLabelList(branches, h.branchIds)}>
                          {branchLabelList(branches, h.branchIds)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <IconEdit onClick={() => openEdit(h)} disabled={saving} />
                            <IconDelete onClick={() => handleDelete(h._id)} disabled={saving} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SlideOverPanel
        open={panelOpen}
        onClose={() => !saving && setPanelOpen(false)}
        title={editingId ? 'Edit holiday' : 'Add holiday'}
        description="Dates use the calendar day (local). Shown on employee and attendance-view calendars for matching branches."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveForm();
          }}
        >
          <div className="form-field">
            <label className="form-label-muted" htmlFor="holiday-name">
              Holiday name <span className="text-rose-600">*</span>
            </label>
            <input
              id="holiday-name"
              className="form-input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Republic Day"
              maxLength={160}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <label className="form-label-muted" htmlFor="holiday-from">
                From <span className="text-rose-600">*</span>
              </label>
              <input
                id="holiday-from"
                type="date"
                className="form-input"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted" htmlFor="holiday-to">
                To <span className="text-rose-600">*</span>
              </label>
              <input
                id="holiday-to"
                type="date"
                className="form-input"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-field">
            <p className="form-label-muted">Branch</p>
            <p className="mb-2 text-xs text-slate-500">Leave all unchecked to apply to every branch.</p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
              {branches.length === 0 ? (
                <p className="text-xs text-slate-500">No branches defined yet — holiday applies company-wide.</p>
              ) : (
                branches.map((b) => {
                  const id = String(b._id);
                  const checked = formBranchIds.has(id);
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-neutral-300"
                        checked={checked}
                        onChange={() => toggleBranch(id)}
                      />
                      <span>{String(b.name || 'Branch').trim()}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-dark hover:bg-neutral-50"
              onClick={() => !saving && setPanelOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className={clsx('btn-primary px-4 py-2 text-sm font-semibold')} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </SlideOverPanel>
    </section>
  );
}

export default HolidaysPage;
