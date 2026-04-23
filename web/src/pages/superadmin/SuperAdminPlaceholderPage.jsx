export default function SuperAdminPlaceholderPage({ title, subtitle }) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="flux-card border border-neutral-200/90 p-8 text-center shadow-panel">
        <p className="text-base font-semibold text-dark">{title}</p>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      </div>
    </div>
  );
}
