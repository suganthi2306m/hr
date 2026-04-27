import clsx from 'clsx';
import { Component, useCallback, useEffect, useState } from 'react';
import QRCodeLib from 'qrcode';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';

function formatInrFromPaise(paise) {
  const rupees = (Number(paise) || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

function IconLayers({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('h-5 w-5', className)} aria-hidden>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function IconCalendar({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('h-4 w-4', className)} aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconClock({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('h-4 w-4', className)} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconCard({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('h-6 w-6', className)} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconCopy({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('h-4 w-4', className)} aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconRefresh({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('h-4 w-4', className)} aria-hidden>
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function payStatusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'captured' || s === 'paid') return 'bg-emerald-100 text-emerald-900';
  if (s === 'failed') return 'bg-red-100 text-red-900';
  if (s === 'created' || s === 'pending') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-200 text-slate-800';
}

function paymentStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'captured' || s === 'paid') return 'Paid';
  if (s === 'failed') return 'Failed';
  if (s === 'created' || s === 'pending') return 'Pending';
  return s || 'Unknown';
}

function PaymentResultBanner({ result, onClose }) {
  if (!result) return null;
  const isSuccess = result.type === 'success';
  const isFailed = result.type === 'failed';
  return (
    <div
      className={clsx(
        'rounded-xl border px-4 py-3 text-sm',
        isSuccess
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : isFailed
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {isSuccess ? 'Payment successful' : isFailed ? 'Payment failed' : 'Payment status pending'}
          </p>
          <p className="mt-1">
            {result.planName} · {formatInrFromPaise(result.amountPaise)}
          </p>
          {result.expiresAt ? <p className="mt-1">Enjoy your plan till: {String(result.expiresAt).slice(0, 10)}</p> : null}
          {result.message ? <p className="mt-1 text-xs">{result.message}</p> : null}
        </div>
        <button type="button" className="text-xs underline" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

const DURATION_OPTIONS = [12, 24, 36];

class CheckoutModalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: String(error?.message || 'Failed to render payment modal.'),
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-300 bg-white p-5 text-sm text-red-700 shadow-2xl">
          <p className="font-semibold">Payment modal failed to render.</p>
          <p className="mt-2 break-words">{this.state.message}</p>
          <p className="mt-3 text-xs text-slate-600">
            Use refresh once, then retry. If it repeats, share this message.
          </p>
        </div>
      </div>
    );
  }
}

/** After initiate: in-modal payment (BizzPass-style) with QR from checkout URL. */
function PaymentCheckoutModal({ session, onClose, onCheckStatus, checkBusy }) {
  const checkoutUrl = String(session?.checkoutUrl || '').trim();
  const isUpi = /^upi:/i.test(checkoutUrl);
  const canOpenExternal = isUpi || /^https?:\/\//i.test(checkoutUrl);
  const copyLabel = isUpi ? 'Copy UPI link' : 'Copy payment link';
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');

  const [copyOk, setCopyOk] = useState(false);

  useEffect(() => {
    let alive = true;
    setQrDataUrl('');
    setQrError('');
    if (!checkoutUrl) {
      setQrError('Missing checkout URL.');
      return () => {
        alive = false;
      };
    }
    QRCodeLib.toDataURL(checkoutUrl, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!alive) return;
        setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!alive) return;
        setQrError('Could not generate QR. Copy the UPI link below.');
      });
    return () => {
      alive = false;
    };
  }, [checkoutUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      setCopyOk(false);
    }
  };

  const openExternal = () => {
    if (!canOpenExternal) return;
    try {
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore and let user copy link
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white text-dark shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="border-b border-neutral-200 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconCard className="text-violet-400" />
              <h3 id="payment-modal-title" className="text-lg font-bold tracking-tight">
                Payment
              </h3>
            </div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-slate-500 hover:bg-primary/10 hover:text-dark"
              onClick={onClose}
              aria-label="Close payment modal"
            >
              x
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {session.planName} · {session.durationMonths} months
          </p>
          <p className="mt-2 text-2xl font-black text-primary">{formatInrFromPaise(session.amountPaise)} INR</p>
          {session.amountRupees != null &&
          session.gatewayAmountRupees != null &&
          Number(session.amountRupees) !== Number(session.gatewayAmountRupees) ? (
            <p className="mt-1 text-xs text-slate-500">
              Plan line {Number(session.amountRupees)} INR · Charged at gateway {Number(session.gatewayAmountRupees)} INR
              (minimum / test rules).
            </p>
          ) : null}
        </div>
        <div className="space-y-4 px-5 py-5">
          <p className="text-center text-sm leading-5 text-slate-700">
            {isUpi
              ? `Pay ${formatInrFromPaise(session.amountPaise)} via UPI: scan the QR or copy the link and open it in PhonePe, GPay, Paytm, etc.`
              : `Pay ${formatInrFromPaise(session.amountPaise)}: scan the QR (opens the payment page on your phone) or use Open in browser / Copy link.`}
          </p>
          <div className="flex justify-center rounded-xl bg-white p-3 shadow-inner">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Payment QR code" className="h-[230px] w-[230px] rounded-lg object-contain" />
            ) : (
              <div className="flex h-[230px] w-[230px] items-center justify-center rounded-lg text-center text-xs text-slate-700">
                {qrError || 'Generating QR...'}
              </div>
            )}
          </div>
          <p className="text-center text-xs text-slate-500">
            Amount: {formatInrFromPaise(session.amountPaise)} — {session.gateway === 'paysharp' ? 'Paysharp' : 'Razorpay'}
          </p>
          <div className="grid grid-cols-1 gap-2 border-t border-neutral-200 pt-4 sm:grid-cols-2">
            <button
              type="button"
              className="btn-secondary border-neutral-200 bg-white text-sm text-slate-700 hover:bg-neutral-50"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap border-neutral-200 bg-white px-3 text-center text-sm text-slate-700 hover:bg-neutral-50"
              onClick={() => void onCheckStatus()}
              disabled={checkBusy}
            >
              <IconRefresh className="shrink-0" />
              {checkBusy ? 'Checking…' : "I've paid – Check status"}
            </button>
            {!isUpi ? (
              <button
                type="button"
                onClick={openExternal}
                disabled={!canOpenExternal}
                className="btn-secondary inline-flex min-h-11 items-center justify-center whitespace-nowrap border-neutral-200 bg-white px-3 text-center text-sm text-slate-700 hover:bg-neutral-50 disabled:opacity-60"
              >
                Open in browser
              </button>
            ) : null}
            <button
              type="button"
              className={`btn-primary inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap border border-primary/20 px-3 text-sm${isUpi ? ' sm:col-span-2' : ''}`}
              onClick={() => void copyLink()}
            >
              <IconCopy className="shrink-0" />
              {copyOk ? 'Copied!' : copyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionBillingPage() {
  const [searchParams] = useSearchParams();
  const mockMode = searchParams.get('mock') === '1';

  const [current, setCurrent] = useState(null);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscribePlan, setSubscribePlan] = useState(null);
  const [durationMonths, setDurationMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [activePayment, setActivePayment] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);

  const load = useCallback(async ({ showSpinner = true } = {}) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const [cRes, pRes, hRes] = await Promise.all([
        apiClient.get('/company/subscription/current'),
        apiClient.get('/company/subscription/plans'),
        apiClient.get('/company/subscription/payments'),
      ]);
      setCurrent(cRes.data);
      setPlans(pRes.data.items || []);
      setPayments(hRes.data.items || []);
      return { current: cRes.data, payments: hRes.data.items || [] };
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load billing.');
      return { current: null, payments: [] };
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sub = current?.subscription;
  const usage = current?.usage || { staffCount: 0, branchCount: 0 };

  const openSubscribe = (plan) => {
    setDurationMonths(Math.max(12, Number(plan.durationMonths) || 12));
    setSubscribePlan(plan);
  };

  const startCheckout = async (gateway) => {
    if (!subscribePlan) return;
    const planSnapshot = {
      name: subscribePlan.name || 'Plan',
      _id: subscribePlan._id,
    };
    const monthsSnapshot = durationMonths;
    setBusy(true);
    setError('');
    try {
      const path = gateway === 'razorpay' ? '/company/subscription/initiate-razorpay' : '/company/subscription/initiate';
      const { data } = await apiClient.post(path, {
        planId: subscribePlan._id,
        durationMonths,
      });
      if (!data.checkoutUrl) {
        setError('No checkout URL returned. Try again or contact support.');
        return;
      }
      setSubscribePlan(null);
      setActivePayment({
        gateway,
        checkoutUrl: String(data.checkoutUrl),
        amountPaise: Number(data.amountPaise) || 0,
        amountRupees: data.amount != null ? Number(data.amount) : null,
        gatewayAmountRupees: data.gatewayAmount != null ? Number(data.gatewayAmount) : null,
        planName: data.planName || planSnapshot.name,
        durationMonths: Number(data.durationMonths) || monthsSnapshot,
        paymentId: data.paymentId,
        paymentIntentId: data.paymentIntentId || data.gatewayOrderId,
      });
      await load({ showSpinner: false });
    } catch (e) {
      setError(e.response?.data?.message || 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  };

  const closePaymentModal = () => setActivePayment(null);

  const checkPaymentStatus = async () => {
    setCheckBusy(true);
    setError('');
    try {
      let verifyMsg = '';
      if (activePayment?.paymentId) {
        try {
          const { data } = await apiClient.post(`/company/subscription/payments/${encodeURIComponent(activePayment.paymentId)}/refresh`);
          verifyMsg = data?.verification?.ok === false ? data?.verification?.message || '' : '';
        } catch (e) {
          verifyMsg = e.response?.data?.message || 'Could not verify payment with gateway right now.';
        }
      }
      const latest = await load({ showSpinner: false });
      const tx = (latest?.payments || []).find((p) => String(p._id) === String(activePayment?.paymentId));
      if (tx) {
        const status = String(tx.status || '').toLowerCase();
        if (status === 'captured' || status === 'paid') {
          setPaymentResult({
            type: 'success',
            amountPaise: Number(tx.amountPaise) || Number(activePayment?.amountPaise) || 0,
            planName: tx.planName || activePayment?.planName || 'Plan',
            expiresAt: latest?.current?.subscription?.expiresAt || null,
            message: '',
          });
          setActivePayment(null);
        } else if (status === 'failed') {
          setPaymentResult({
            type: 'failed',
            amountPaise: Number(tx.amountPaise) || Number(activePayment?.amountPaise) || 0,
            planName: tx.planName || activePayment?.planName || 'Plan',
            expiresAt: null,
            message: tx.failureReason || 'Payment failed at gateway.',
          });
        } else {
          setPaymentResult({
            type: 'pending',
            amountPaise: Number(tx.amountPaise) || Number(activePayment?.amountPaise) || 0,
            planName: tx.planName || activePayment?.planName || 'Plan',
            expiresAt: null,
            message: verifyMsg || 'Payment is still pending confirmation. Please retry in a few seconds.',
          });
        }
      }
    } finally {
      setCheckBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-dark sm:text-2xl">Subscription &amp; billing</h2>
        <p className="mt-1 text-sm text-slate-600">
          View your plan, usage, and renew or upgrade. Payments are processed on the gateway; secrets never leave the server.
        </p>
      </div>

      {mockMode ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Mock checkout mode: complete payment in your real gateway, or use Razorpay test keys. Return here and refresh to see status updates.
        </div>
      ) : null}

      <PaymentResultBanner result={paymentResult} onClose={() => setPaymentResult(null)} />

      {error ? <p className="alert-error text-sm">{error}</p> : null}

      {sub ? (
        <div className="flux-card border border-neutral-200/90 p-5 shadow-panel sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <IconLayers />
              </div>
              <div>
                <p className="text-lg font-bold text-dark">{sub.planName || 'Plan'}</p>
                <p className="text-sm text-slate-600">
                  {sub.maxUsers != null
                    ? `${usage.staffCount} staff · ${usage.branchCount} branches (limit ${sub.maxUsers} staff · ${sub.maxBranches} branches)`
                    : '—'}
                </p>
              </div>
            </div>
            <span
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                sub.isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800',
              )}
            >
              {sub.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-200 pt-4 text-sm text-slate-600">
            {sub.expiresAt ? (
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar className="text-primary" />
                Valid until {String(sub.expiresAt).slice(0, 10)}
              </span>
            ) : null}
            {sub.daysLeft != null ? (
              <span className="inline-flex items-center gap-1.5">
                <IconClock className="text-primary" />
                {sub.daysLeft} days left{sub.isTrial ? ' (trial)' : ''}
              </span>
            ) : null}
            {sub.isTrial ? (
              <span className="inline-flex items-center gap-1.5 text-amber-800">
                Trial license — renew or subscribe before access ends.
              </span>
            ) : null}
            {sub.maxUsers != null ? (
              <span>
                Staff {usage.staffCount}/{sub.maxUsers}
              </span>
            ) : null}
            {sub.maxBranches != null ? (
              <span>
                Branches {usage.branchCount}/{sub.maxBranches}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-lg font-bold text-dark">Available plans</h3>
        <p className="text-sm text-slate-600">Choose a plan and billing period, then pay with Razorpay or Paysharp (as enabled by your platform).</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent =
              (sub?.planId && String(plan._id) === String(sub.planId)) ||
              String(sub?.planName || '').toLowerCase() === String(plan.name || '').toLowerCase();
            return (
              <div
                key={plan._id}
                className={clsx(
                  'flux-card flex flex-col border p-5 shadow-panel',
                  isCurrent ? 'border-primary ring-2 ring-primary/30' : 'border-neutral-200/90',
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <IconLayers />
                    <span className="font-bold text-dark">{plan.name}</span>
                  </div>
                  {isCurrent ? (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase text-dark">Current</span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">{plan.description || plan.planCode}</p>
                <p className="mt-3 text-2xl font-black text-primary">
                  {formatInrFromPaise(Math.round(Number(plan.priceInr || 0) * 100))}{' '}
                  <span className="text-sm font-semibold text-slate-600">/ {plan.durationMonths || 12} mo</span>
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {plan.maxUsers} staff · {plan.maxBranches} branches
                </p>
                <button type="button" className="btn-primary mt-4 w-full text-sm" onClick={() => openSubscribe(plan)}>
                  Subscribe
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-dark">Payment history</h3>
        <p className="text-sm text-slate-600">Recent subscription payments (created → captured or failed after gateway events).</p>
        <ul className="mt-4 space-y-2">
          {payments.length === 0 ? (
            <li className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-slate-500">No payments yet.</li>
          ) : (
            payments.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-dark">{row.planName || 'Subscription'}</p>
                  <p className="text-xs text-slate-500">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'} · {row.gateway}
                  </p>
                  <p className="text-xs text-slate-500">
                    Order: {row.gatewayOrderId || '-'} {row.externalPaymentId ? `· Txn: ${row.externalPaymentId}` : ''}
                  </p>
                  {row.paidAt ? <p className="text-xs text-emerald-700">Paid at: {new Date(row.paidAt).toLocaleString()}</p> : null}
                  {row.failureReason ? <p className="mt-1 text-xs text-red-700">{row.failureReason}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', payStatusTone(row.status))}>
                    {paymentStatusLabel(row.status)}
                  </span>
                  <span className="text-sm font-bold text-dark">{formatInrFromPaise(row.amountPaise)}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {subscribePlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-panel-lg">
            <h4 className="text-lg font-bold text-dark">Confirm subscription</h4>
            <p className="mt-1 text-sm text-slate-600">
              {subscribePlan.name} — choose how many months to bill for, then pay in the next step (QR in app, like BizzPass).
            </p>
            <div className="form-field mt-4">
              <label className="form-label" htmlFor="bill-months">
                Duration (months)
              </label>
              <select
                id="bill-months"
                className="form-select"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setSubscribePlan(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => startCheckout('razorpay')}>
                {busy ? '…' : 'Pay with Razorpay'}
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => startCheckout('paysharp')}>
                {busy ? '…' : 'Pay with Paysharp'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activePayment ? (
        <CheckoutModalErrorBoundary>
          <PaymentCheckoutModal
            session={activePayment}
            onClose={closePaymentModal}
            onCheckStatus={checkPaymentStatus}
            checkBusy={checkBusy}
          />
        </CheckoutModalErrorBoundary>
      ) : null}
    </div>
  );
}
