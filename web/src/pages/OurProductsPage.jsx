import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import apiClient, { API_BASE_URL, getApiErrorMessage } from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import SlideOverPanel from '../components/common/SlideOverPanel';
import PartnerSupportDetails from '../components/partner/PartnerSupportDetails';

function resolveProductMediaUrl(path) {
  if (!path || typeof path !== 'string') return '';
  const p = path.trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p) || p.startsWith('data:')) return p;
  const base = String(API_BASE_URL || '').replace(/\/api\/?$/i, '');
  if (!base) return p;
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

function openExternal(url) {
  if (!url) return;
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  window.open(u, '_blank', 'noopener,noreferrer');
}

/** Returns 11-char YouTube video id or null. */
function parseYoutubeVideoId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let href = s;
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }
  if (host === 'm.youtube.com' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (url.pathname.startsWith('/embed/')) {
      const id = url.pathname.slice(7).split('/')[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.slice(8).split('/')[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{6,}$/.test(v)) return v;
  }
  return null;
}

function isDirectVideoFileUrl(url) {
  return /\.(mp4|webm|ogg|m3u8)(\?|#|$)/i.test(String(url || ''));
}

function ProductInlineVideo({ rawUrl }) {
  const resolved = resolveProductMediaUrl(rawUrl);
  if (!resolved) return null;
  const yt = parseYoutubeVideoId(resolved);
  if (yt) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?rel=0`;
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-inner">
        <iframe
          className="absolute inset-0 h-full w-full border-0"
          src={src}
          title="Product video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (isDirectVideoFileUrl(resolved)) {
    return (
      <div className="overflow-hidden rounded-xl bg-black shadow-inner">
        <video className="w-full max-h-[50vh]" controls playsInline preload="metadata" src={resolved} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">This link cannot be embedded here. Open it in a new tab to watch.</p>
      <button
        type="button"
        onClick={() => openExternal(resolved)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-dark shadow-sm transition hover:brightness-95"
      >
        <span aria-hidden>▶</span> Open video
      </button>
    </div>
  );
}

export default function OurProductsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [partner, setPartner] = useState(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');

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

  const openPartnerContact = useCallback(async () => {
    setContactOpen(true);
    setContactLoading(true);
    setContactError('');
    setPartner(null);
    try {
      const { data } = await apiClient.get('/company/provisioning-partner');
      setPartner(data?.partner || null);
    } catch (e) {
      setPartner(null);
      setContactError(getApiErrorMessage(e, 'Could not load partner contact.'));
    } finally {
      setContactLoading(false);
    }
  }, []);

  const rows = useMemo(() => items.slice(), [items]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void openPartnerContact()}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:brightness-95"
        >
          Contact for more details
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
          No products published for your company yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const banner = resolveProductMediaUrl(p.bannerImage);
            const active = p.status === 'active';
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={clsx(
                  'group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:shadow-md',
                  active ? 'border-neutral-200' : 'border-neutral-200 opacity-75',
                )}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-100">
                  {banner ? (
                    <img
                      src={banner}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-medium text-slate-400">
                      No banner image
                    </div>
                  )}
                  {p.videoUrl?.trim() ? (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-bold text-white">
                      <span aria-hidden>▶</span> Video
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-black leading-snug text-dark">{p.name}</h3>
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                        active ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-600',
                      )}
                    >
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {p.portfolioWide ? (
                    <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                      Partner catalog
                    </span>
                  ) : null}
                  {p.offerTag ? (
                    <span className="inline-block rounded-full bg-primary/25 px-2 py-0.5 text-xs font-semibold text-dark">
                      {p.offerTag}
                    </span>
                  ) : null}
                  {p.shortDescription ? (
                    <p className="line-clamp-3 text-sm leading-relaxed text-slate-600">{p.shortDescription}</p>
                  ) : null}
                  {p.price != null && p.price !== '' ? (
                    <p className="text-sm font-black text-dark">₹{Number(p.price).toLocaleString('en-IN')}</p>
                  ) : null}
                  <p className="text-xs font-semibold text-primary">View details →</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SlideOverPanel
        open={Boolean(selected)}
        title={selected?.name || 'Product'}
        description={selected?.offerTag ? String(selected.offerTag) : undefined}
        onClose={() => setSelected(null)}
        widthClass="max-w-lg"
      >
        {selected ? (
          <ProductDetailBody product={selected} onClose={() => setSelected(null)} />
        ) : null}
      </SlideOverPanel>

      <SlideOverPanel
        open={contactOpen}
        title="Contact for more details"
        description="Your platform partner (super admin)"
        onClose={() => {
          setContactOpen(false);
          setPartner(null);
          setContactError('');
        }}
        widthClass="sm:max-w-lg"
      >
        <div className="space-y-4 overflow-y-auto px-1 pb-2">
          <PartnerSupportDetails partner={partner} loading={contactLoading} error={contactError} />
        </div>
      </SlideOverPanel>
    </div>
  );
}

function ProductDetailBody({ product: p, onClose }) {
  const banner = resolveProductMediaUrl(p.bannerImage);
  const extras = (Array.isArray(p.images) ? p.images : []).map(resolveProductMediaUrl).filter(Boolean);
  const uniqueExtras = extras.filter((u) => u && u !== banner);
  const video = String(p.videoUrl || '').trim();
  const bodyText = (p.fullDescription || '').trim() || (p.shortDescription || '').trim();
  const ctaType = String(p.ctaType || 'none').toLowerCase();
  const ctaVal = String(p.ctaValue || '').trim();
  const canCta = ctaType !== 'none' && ctaVal;

  return (
    <div className="space-y-5 pb-4 text-dark">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
        {banner ? (
          <img src={banner} alt="" className="max-h-64 w-full object-cover object-center" />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">No banner image</div>
        )}
      </div>

      {uniqueExtras.length > 0 ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">More photos</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {uniqueExtras.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => openExternal(url)}
                className="aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {video ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Video</p>
          <div className="mt-2">
            <ProductInlineVideo rawUrl={video} />
          </div>
        </div>
      ) : null}

      {bodyText ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Details</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{bodyText}</p>
        </div>
      ) : null}

      {p.price != null && p.price !== '' ? (
        <p className="text-lg font-black">₹{Number(p.price).toLocaleString('en-IN')}</p>
      ) : null}

      {canCta ? (
        <button
          type="button"
          onClick={() => {
            if (ctaType === 'phone') window.location.href = `tel:${ctaVal.replace(/\s/g, '')}`;
            else if (ctaType === 'email') window.location.href = `mailto:${ctaVal}`;
            else openExternal(ctaVal);
          }}
          className="w-full rounded-xl border-2 border-dark bg-dark py-3 text-sm font-bold text-white transition hover:bg-neutral-800"
        >
          {p.ctaLabel?.trim() || 'Contact us'}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold text-dark hover:bg-neutral-50"
      >
        Close
      </button>
    </div>
  );
}
