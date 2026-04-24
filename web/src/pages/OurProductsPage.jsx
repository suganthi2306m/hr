import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import apiClient, { getApiErrorMessage } from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import SlideOverPanel from '../components/common/SlideOverPanel';

function emptyForm() {
  return {
    name: '',
    shortDescription: '',
    fullDescription: '',
    bannerImage: '',
    imagesText: '',
    price: '',
    offerTag: '',
    showInApp: true,
    highlightProduct: false,
    showOnHomeBanner: false,
    status: 'active',
    ctaLabel: 'Contact Us',
    ctaType: 'none',
    ctaValue: '',
  };
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-dark">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export default function OurProductsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/company-products');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setError(getApiErrorMessage(e, 'Failed to load products.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId('');
    setForm(emptyForm());
    setPanelOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(String(row.id));
    setForm({
      name: row.name || '',
      shortDescription: row.shortDescription || '',
      fullDescription: row.fullDescription || '',
      bannerImage: row.bannerImage || '',
      imagesText: (Array.isArray(row.images) ? row.images : []).join('\n'),
      price: row.price != null && row.price !== '' ? String(row.price) : '',
      offerTag: row.offerTag || '',
      showInApp: Boolean(row.showInApp),
      highlightProduct: Boolean(row.highlightProduct),
      showOnHomeBanner: Boolean(row.showOnHomeBanner),
      status: row.status === 'inactive' ? 'inactive' : 'active',
      ctaLabel: row.ctaLabel || 'Contact Us',
      ctaType: row.ctaType || 'none',
      ctaValue: row.ctaValue || '',
    });
    setPanelOpen(true);
  };

  const persist = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('Product name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        shortDescription: form.shortDescription.trim(),
        fullDescription: form.fullDescription.trim(),
        bannerImage: form.bannerImage.trim(),
        imagesText: form.imagesText,
        price: form.price.trim() === '' ? null : form.price,
        offerTag: form.offerTag.trim(),
        showInApp: form.showInApp,
        highlightProduct: form.highlightProduct,
        showOnHomeBanner: form.showOnHomeBanner,
        status: form.status,
        ctaLabel: form.ctaLabel.trim() || 'Contact Us',
        ctaType: form.ctaType,
        ctaValue: form.ctaValue.trim(),
      };
      if (editingId) {
        await apiClient.put(`/company-products/${editingId}`, payload);
      } else {
        await apiClient.post('/company-products', payload);
      }
      setPanelOpen(false);
      setEditingId('');
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save product.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    setError('');
    try {
      await apiClient.delete(`/company-products/${id}`);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not delete product.'));
    }
  };

  const rows = useMemo(() => items.slice(), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-dark">Our Products</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Advertise products and offers to your team in the mobile app. Use image URLs (https) for banners and
            galleries.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:brightness-95"
        >
          Add product
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <LocationLoadingIndicator label="Loading products…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center text-sm text-slate-600">
          No products yet. Create one to show in the app.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-bold text-dark">{p.name}</p>
                    {p.offerTag ? (
                      <span className="mt-1 inline-block rounded-full bg-primary/25 px-2 py-0.5 text-xs font-semibold text-dark">
                        {p.offerTag}
                      </span>
                    ) : null}
                    {p.shortDescription ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{p.shortDescription}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    <ul className="space-y-1">
                      <li>{p.showInApp ? '✓ App' : '— App'}</li>
                      <li>{p.highlightProduct ? '✓ Highlight' : '— Highlight'}</li>
                      <li>{p.showOnHomeBanner ? '✓ Home banner' : '— Home banner'}</li>
                    </ul>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold',
                        p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700',
                      )}
                    >
                      {p.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="mr-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-dark hover:bg-neutral-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOverPanel
        open={panelOpen}
        onClose={() => {
          if (!saving) {
            setPanelOpen(false);
            setEditingId('');
          }
        }}
        title={editingId ? 'Edit product' : 'New product'}
        widthClass="max-w-lg"
      >
        <div className="space-y-4 px-1 pb-6">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Name *</label>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Short description</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              rows={2}
              value={form.shortDescription}
              onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Full description</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              rows={4}
              value={form.fullDescription}
              onChange={(e) => setForm((f) => ({ ...f, fullDescription: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Banner image URL</label>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              placeholder="https://…"
              value={form.bannerImage}
              onChange={(e) => setForm((f) => ({ ...f, bannerImage: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Additional image URLs (one per line)</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-xs"
              rows={3}
              value={form.imagesText}
              onChange={(e) => setForm((f) => ({ ...f, imagesText: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Price (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Offer tag</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder="New, 20% OFF…"
                value={form.offerTag}
                onChange={(e) => setForm((f) => ({ ...f, offerTag: e.target.value }))}
              />
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
            <p className="text-xs font-bold uppercase text-slate-500">Visibility</p>
            <Toggle
              checked={form.showInApp}
              onChange={(v) => setForm((f) => ({ ...f, showInApp: v }))}
              label="Show in app"
              disabled={saving}
            />
            <Toggle
              checked={form.highlightProduct}
              onChange={(v) => setForm((f) => ({ ...f, highlightProduct: v }))}
              label="Highlight (featured section)"
              disabled={saving}
            />
            <Toggle
              checked={form.showOnHomeBanner}
              onChange={(v) => setForm((f) => ({ ...f, showOnHomeBanner: v }))}
              label="Show on home banner slider"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="rounded-xl border border-neutral-200 p-3 space-y-2">
            <p className="text-xs font-bold uppercase text-slate-500">Action button</p>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Button label"
              value={form.ctaLabel}
              onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
            />
            <select
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={form.ctaType}
              onChange={(e) => setForm((f) => ({ ...f, ctaType: e.target.value }))}
            >
              <option value="none">No action</option>
              <option value="phone">Call number</option>
              <option value="url">Open URL</option>
              <option value="email">Send email</option>
            </select>
            {form.ctaType !== 'none' ? (
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder={form.ctaType === 'phone' ? '+91…' : form.ctaType === 'email' ? 'sales@…' : 'https://…'}
                value={form.ctaValue}
                onChange={(e) => setForm((f) => ({ ...f, ctaValue: e.target.value }))}
              />
            ) : null}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!saving) {
                  setPanelOpen(false);
                  setEditingId('');
                }
              }}
              className="flex-1 rounded-full border border-neutral-300 py-2.5 text-sm font-semibold text-dark hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={persist}
              className="flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-dark shadow-sm hover:brightness-95 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </SlideOverPanel>
    </div>
  );
}
