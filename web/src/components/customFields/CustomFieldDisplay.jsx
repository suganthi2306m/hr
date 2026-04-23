import { parseMultiCheckboxValue } from '../../utils/customFieldValues';

function isLikelyImageUrl(s) {
  return /^https?:\/\//i.test(s) || s.startsWith('data:image');
}

/**
 * Read-only value for employee profile custom fields.
 */
export default function CustomFieldDisplay({ def, value }) {
  const opts = Array.isArray(def.options) ? def.options : [];
  const ft = def.fieldType || 'text';

  if (ft === 'checkbox' && !opts.length) {
    const on = value === true || value === 'true';
    return <span>{on ? 'Yes' : 'No'}</span>;
  }

  if (value == null || value === '') {
    return <span className="text-slate-500">—</span>;
  }

  if (ft === 'dropdown' || ft === 'radio') {
    const o = opts.find((x) => String(x.value) === String(value));
    return <span className="break-words">{o ? o.label || o.value : String(value)}</span>;
  }

  if (ft === 'checkbox') {
    const sel = parseMultiCheckboxValue(value);
    if (!sel.length) return <span className="text-slate-500">—</span>;
    const labels = sel.map((val) => opts.find((x) => String(x.value) === String(val))?.label || val);
    return <span className="break-words">{labels.join(', ')}</span>;
  }

  if (ft === 'image') {
    const s = String(value);
    if (isLikelyImageUrl(s)) {
      return (
        <div className="space-y-1">
          <img src={s} alt="" className="max-h-40 max-w-full rounded border border-neutral-200 object-contain" />
          {!s.startsWith('data:') && <p className="break-all text-xs text-slate-500">{s}</p>}
        </div>
      );
    }
    return <span className="break-all">{s}</span>;
  }

  if (ft === 'file') {
    const s = String(value);
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-primary hover:underline">
        {s.startsWith('data:') ? 'Download embedded file' : s}
      </a>
    );
  }

  if (ft === 'textarea') {
    return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
  }

  return <span className="break-words">{String(value)}</span>;
}
