function DetailLine({ label, value, linkExternal }) {
  const raw = value != null ? String(value).trim() : '';
  const empty = raw === '';
  const href =
    linkExternal && !empty ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {empty ? (
        <p className="mt-1 text-sm font-semibold text-dark">—</p>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block break-all text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-2"
        >
          {raw}
        </a>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-dark">{raw}</p>
      )}
    </div>
  );
}

/**
 * Read-only partner (super admin) contact for company admins.
 * Expects `partner` shape from GET /company/provisioning-partner.
 */
export default function PartnerSupportDetails({ partner, loading, error }) {
  if (loading) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-700">{error}</p>;
  }
  if (!partner) {
    return <p className="text-sm text-slate-600">No partner contact is available.</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Company details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailLine label="Company name" value={partner.profile?.companyName} />
          <DetailLine label="Company email" value={partner.profile?.companyEmail} />
          <DetailLine label="Phone no." value={partner.profile?.companyPhone} />
          <DetailLine label="Company website" value={partner.profile?.companyWebsiteUrl} linkExternal />
          <DetailLine label="Support email" value={partner.profile?.supportEmail} />
          <DetailLine label="Contact person" value={partner.profile?.contactPersonName} />
          <DetailLine label="Alternative contact no." value={partner.profile?.altPhone} />
          <div className="sm:col-span-2">
            <DetailLine label="Description" value={partner.profile?.description} />
          </div>
          <div className="sm:col-span-2">
            <DetailLine label="Address" value={partner.profile?.address} />
          </div>
        </div>
      </div>
    </div>
  );
}
