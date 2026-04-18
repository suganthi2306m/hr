import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import { formatDay, formatDt, durationLabel, visitSourceLabel } from '../utils/visitFormatters';

function VisitDetailPage() {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const { setDashboardTrail } = useOutletContext() || {};
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const goBackToVisits = useCallback(() => {
    navigate('/dashboard/track/visits');
  }, [navigate]);

  const load = useCallback(async () => {
    if (!visitId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/company-visits/company/${visitId}`);
      if (!data?.success || !data.item) {
        setError(data?.message || 'Unable to load visit.');
        setDetail(null);
        return;
      }
      setDetail(data.item);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Unable to load visit.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!setDashboardTrail) return undefined;
    setDashboardTrail(
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-dark shadow-sm transition hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          onClick={goBackToVisits}
          aria-label="Back to company visits"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="min-w-0 truncate text-2xl font-black tracking-tight sm:text-3xl">
          <span className="text-primary">Visit</span>
          <span className="text-dark"> details</span>
        </h1>
      </div>,
    );
    return () => setDashboardTrail(null);
  }, [setDashboardTrail, goBackToVisits]);

  const detailUser = detail?.userId && typeof detail.userId === 'object' ? detail.userId : null;
  const userLine = detailUser
    ? [detailUser.name, detailUser.email].filter(Boolean).join(' · ') || String(detailUser._id)
    : String(detail?.userId || '—');

  const companyLine = [detail?.companyName, detail?.customerName].filter(Boolean).join(' · ') || '—';

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={goBackToVisits}>
          ← Company visits
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <LocationLoadingIndicator label="Loading visit…" />
        </div>
      )}

      {!loading && error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {!loading && detail && (
        <div className="flux-card p-5 shadow-panel-lg">
          <div className="border-b border-neutral-100 pb-4">
            <p className="text-base font-bold text-dark sm:text-lg">{companyLine}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
              Recorded as{' '}
              <span className="font-bold text-dark normal-case tracking-normal">
                {visitSourceLabel(detail.source)}
              </span>
            </p>
          </div>

          <div className="border-b border-neutral-100 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">User</p>
            <p className="mt-1 break-words text-sm font-semibold text-dark">{userLine}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 py-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Check-in</p>
              <p className="mt-1 break-words text-sm font-semibold text-dark">{formatDt(detail.checkInTime)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Check-out</p>
              <p className="mt-1 break-words text-sm font-semibold text-dark">{formatDt(detail.checkOutTime)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 py-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Duration</p>
              <p className="mt-1 text-sm font-semibold text-dark">{durationLabel(detail)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Visit day</p>
              <p className="mt-1 text-sm font-semibold text-dark">
                {formatDay(detail.checkInTime || detail.visitDate)}
              </p>
            </div>
          </div>

          <div className={`py-4 ${detail.siteAddress ? 'border-b border-neutral-100' : ''}`}>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Status</p>
            <p className="mt-1">
              <span
                className={
                  detail.status === 'completed'
                    ? 'inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800'
                    : 'inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800'
                }
              >
                {detail.status || '—'}
              </span>
            </p>
          </div>

          {detail.siteAddress ? (
            <div className="pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Site address</p>
              <p className="mt-1 text-sm font-semibold text-dark">{detail.siteAddress}</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default VisitDetailPage;
