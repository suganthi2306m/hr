import UiSelect from '../common/UiSelect';
import { CUSTOM_FIELD_TYPE_OPTIONS } from '../../constants/customFields';

const TYPES_WITH_CHOICES = ['dropdown', 'radio', 'checkbox'];

export function emptyCustomFieldDef() {
  return { key: '', label: '', category: 'General', fieldType: 'text', options: [], isActive: true, isRequired: false };
}

function baseRow(prev) {
  return { ...emptyCustomFieldDef(), ...(prev && typeof prev === 'object' ? prev : {}) };
}

/**
 * Scrollable form body for one custom field definition (add or edit).
 * @param {(updater: (prev: object) => object) => void} onDraftChange - functional updates recommended
 */
export default function SingleCustomFieldDefForm({ draft, onDraftChange, keyReadOnly }) {
  const row = baseRow(draft);

  const patch = (p) => onDraftChange((prev) => ({ ...baseRow(prev), ...p }));

  const setFieldType = (v) => {
    onDraftChange((prev) => {
      const r = baseRow(prev);
      if (!TYPES_WITH_CHOICES.includes(v)) {
        return { ...r, fieldType: v, options: [] };
      }
      const prevOpts = Array.isArray(r.options) ? r.options : [];
      const nextOpts =
        v === 'checkbox'
          ? prevOpts
          : prevOpts.length
            ? prevOpts
            : [{ value: '', label: '' }];
      return { ...r, fieldType: v, options: nextOpts };
    });
  };

  const addOption = () => {
    onDraftChange((prev) => {
      const r = baseRow(prev);
      const opts = Array.isArray(r.options) ? r.options : [];
      return { ...r, options: [...opts, { value: '', label: '' }] };
    });
  };

  const updateOption = (optIndex, p) => {
    onDraftChange((prev) => {
      const r = baseRow(prev);
      const opts = Array.isArray(r.options) ? r.options : [];
      return { ...r, options: opts.map((o, k) => (k === optIndex ? { ...o, ...p } : o)) };
    });
  };

  const removeOption = (optIndex) => {
    onDraftChange((prev) => {
      const r = baseRow(prev);
      const opts = Array.isArray(r.options) ? r.options : [];
      return { ...r, options: opts.filter((_, k) => k !== optIndex) };
    });
  };

  return (
    <div className="form-stack space-y-5 pb-2">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200/80 bg-flux-panel px-4 py-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          className="form-checkbox"
          checked={row.isActive !== false}
          onChange={(e) => patch({ isActive: e.target.checked })}
        />
        Field is active (inactive fields stay in data but are hidden on employee forms)
      </label>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200/80 bg-flux-panel px-4 py-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          className="form-checkbox"
          checked={row.isRequired === true}
          onChange={(e) => patch({ isRequired: e.target.checked })}
        />
        Required field (employee create / full record save is blocked until this has a value)
      </label>

      <div className="form-field">
        <label className="form-label-muted">
          Key (slug)<span className="text-rose-600"> *</span>
        </label>
        <input
          className="form-input font-mono text-sm"
          value={row.key}
          onChange={(e) => patch({ key: e.target.value })}
          placeholder="e.g. uniform_size"
          readOnly={keyReadOnly}
          disabled={keyReadOnly}
        />
        {keyReadOnly && <p className="mt-1 text-xs text-slate-500">Key cannot be changed after creation (values are stored under this key).</p>}
      </div>

      <div className="form-field">
        <label className="form-label-muted">
          Label<span className="text-rose-600"> *</span>
        </label>
        <input
          className="form-input"
          value={row.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder="Shown in forms"
        />
      </div>

      <div className="form-field">
        <label className="form-label-muted">
          Category<span className="text-rose-600"> *</span>
        </label>
        <input
          className="form-input"
          value={row.category || ''}
          onChange={(e) => patch({ category: e.target.value })}
          placeholder="e.g. Personal, Documents, Payroll"
        />
      </div>

      <div className="form-field">
        <label className="form-label-muted">Type</label>
        <UiSelect value={row.fieldType || 'text'} onChange={setFieldType} options={CUSTOM_FIELD_TYPE_OPTIONS} />
      </div>

      {TYPES_WITH_CHOICES.includes(row.fieldType || '') && (
        <div className="rounded-xl border border-neutral-200/80 bg-flux-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Choices (value / label)</p>
          <p className="mt-1 text-xs text-slate-500">
            {row.fieldType === 'checkbox'
              ? 'Leave empty for a single on/off checkbox. Add rows for multiple checkboxes.'
              : 'Add at least one choice for dropdown and radio.'}
          </p>
          <div className="mt-3 space-y-2">
            {(Array.isArray(row.options) ? row.options : []).map((opt, oi) => (
              <div key={`opt-${oi}`} className="flex flex-wrap items-end gap-2">
                <div className="form-field min-w-[7rem] flex-1">
                  <label className="form-label-muted text-[10px]">Value</label>
                  <input
                    className="form-input font-mono text-sm"
                    value={opt.value}
                    onChange={(e) => updateOption(oi, { value: e.target.value })}
                  />
                </div>
                <div className="form-field min-w-[7rem] flex-1">
                  <label className="form-label-muted text-[10px]">Label</label>
                  <input className="form-input text-sm" value={opt.label} onChange={(e) => updateOption(oi, { label: e.target.value })} />
                </div>
                <button type="button" className="mb-0.5 text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeOption(oi)}>
                  Remove choice
                </button>
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={addOption}>
              + Add choice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
