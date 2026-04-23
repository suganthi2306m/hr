/**
 * @param {Array<{ status?: string, paidAt?: string | Date | null }>} items
 * @returns {object | null}
 */
export function pickLatestCapturedPayment(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const captured = items.filter((p) => p && String(p.status || '').toLowerCase() === 'captured' && p.paidAt);
  if (!captured.length) return null;
  captured.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  return captured[0];
}

/**
 * @param {object | null} pay
 * @returns {string}
 */
export function formatRenewalDetailsFromPayment(pay) {
  if (!pay) return '';
  const rupees = Math.max(0, Math.round(Number(pay.amountPaise || 0) / 100));
  const lines = [
    `Plan: ${String(pay.planName || '').trim() || '—'}`,
    `Billing period: ${Math.max(1, Number(pay.durationMonths) || 12)} month(s)`,
    `Amount paid: ₹${rupees.toLocaleString('en-IN')} ${String(pay.currency || 'INR').trim() || 'INR'}`,
    `Gateway: ${String(pay.gateway || '').trim() || '—'}`,
  ];
  const pid = String(pay.gatewayPaymentId || pay.externalPaymentId || '').trim();
  if (pid) lines.push(`Payment ID: ${pid}`);
  const oid = String(pay.gatewayOrderId || '').trim();
  if (oid) lines.push(`Order ref: ${oid}`);
  return lines.join('\n');
}
