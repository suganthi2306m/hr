import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import apiClient, { getApiErrorMessage } from '../../api/client';
import LocationLoadingIndicator from '../../components/common/LocationLoadingIndicator';
import SlideOverPanel from '../../components/common/SlideOverPanel';

const PRODUCTS_API = '/super/products';
const MAX_EXTRA_IMAGES = 3;

function emptyForm() {
  return {
    name: '',
    shortDescription: '',
    fullDescription: '',
    bannerImage: '',
    videoUrl: '',
    extraImages: [],
    price: '',
    offerTag: '',
    status: 'active',
    ctaLabel: 'Contact Us',
    ctaType: 'none',
    ctaValue: '',
  };
}

export default function SuperAdminOurProductsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(PRODUCTS_API);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setError(getApiErrorMessage(e, 'Failed to load products.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openCreate = useCallback(() => {
    setEditingId('');
    setForm(emptyForm());
    setPanelOpen(true);
  }, []);

  useEffect(() => {
    const onAdd = () => openCreate();
    window.addEventListener('livetrack-superadmin-add-product', onAdd);
    return () => window.removeEventListener('livetrack-superadmin-add-product', onAdd);
  }, [openCreate]);

  const openEdit = (row) => {
    setEditingId(String(row.id));
    setForm({
      name: row.name || '',
      shortDescription: row.shortDescription || '',
      fullDescription: row.fullDescription || '',
      bannerImage: row.bannerImage || '',
      videoUrl: row.videoUrl || '',
      extraImages: (Array.isArray(row.images) ? row.images : []).map(String).filter(Boolean).slice(0, MAX_EXTRA_IMAGES),
      price: row.price != null && row.price !== '' ? String(row.price) : '',
      offerTag: row.offerTag || '',
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
        videoUrl: form.videoUrl.trim(),
        images: form.extraImages.map((s) => String(s || '').trim()).filter(Boolean).slice(0, MAX_EXTRA_IMAGES),
        price: form.price.trim() === '' ? null : form.price,
        offerTag: form.offerTag.trim(),
        status: form.status,
        ctaLabel: form.ctaLabel.trim() || 'Contact Us',
        ctaType: form.ctaType,
        ctaValue: form.ctaValue.trim(),
      };
      if (!editingId) {
        payload.showInApp = true;
        payload.highlightProduct = false;
        payload.showOnHomeBanner = false;
      }
      if (editingId) {
        await apiClient.put(`${PRODUCTS_API}/${editingId}`, payload);
      } else {
        await apiClient.post(PRODUCTS_API, payload);
      }
      setPanelOpen(false);
      setEditingId('');
      await loadProducts();
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
      await apiClient.delete(`${PRODUCTS_API}/${id}`);
      await loadProducts();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not delete product.'));
    }
  };

  const rows = useMemo(() => items.slice(), [items]);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <LocationLoadingIndicator label="Loading products…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center text-sm text-slate-600">
          No products yet. Add one to advertise across your companies.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-bold text-dark">{p.name}</p>
                    {p.portfolioWide ? (
                      <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                        All companies
                      </span>
                    ) : (
                      <span className="mt-1 inline-block rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-700">
                        One company (legacy)
                      </span>
                    )}
                    {p.offerTag ? (
                      <span className="mt-1 inline-block rounded-full bg-primary/25 px-2 py-0.5 text-xs font-semibold text-dark">
                        {p.offerTag}
                      </span>
                    ) : null}
                    {p.shortDescription ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{p.shortDescription}</p>
                    ) : null}
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
            <label className="text-xs font-bold uppercase text-slate-500">Additional images (max {MAX_EXTRA_IMAGES})</label>
            <p className="mt-0.5 text-xs text-slate-500">Optional gallery photos shown with the product.</p>
            <div className="mt-2 space-y-2">
              {form.extraImages.map((url, idx) => (
                <div key={`extra-img-${idx}`} className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="https://…"
                    value={url}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.extraImages];
                        next[idx] = e.target.value;
                        return { ...f, extraImages: next };
                      })
                    }
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        extraImages: f.extraImages.filter((_, i) => i !== idx),
                      }))
                    }
                    className="shrink-0 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-neutral-50 disabled:opacity-50"
                    aria-label="Remove image URL"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {form.extraImages.length < MAX_EXTRA_IMAGES ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setForm((f) => ({ ...f, extraImages: [...f.extraImages, ''] }))}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 bg-white px-3 py-2 text-sm font-bold text-dark hover:bg-neutral-50 disabled:opacity-50"
                >
                  <span className="text-lg leading-none text-primary">+</span>
                  Add image URL
                </button>
              ) : null}
            </div>
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
