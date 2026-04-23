import { useRef, useState } from 'react';
import UiSelect from '../common/UiSelect';
import { MAX_INLINE_CUSTOM_FIELD_BYTES } from '../../constants/customFields';
import { parseMultiCheckboxValue, stringifyMultiCheckboxValue } from '../../utils/customFieldValues';

function readFileAsDataUrl(file, maxBytes) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`Choose a file under ${Math.round(maxBytes / 1024)} KB, or paste a hosted URL.`));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });
}

/**
 * @param {{ key: string, label: string, fieldType?: string, options?: { value: string, label: string }[] }} def
 * @param {unknown} value
 * @param {(next: unknown) => void} onChange
 */
export default function CustomFieldControl({ def, value, onChange }) {
  const fileInputRef = useRef(null);
  const [fileHint, setFileHint] = useState('');

  const opts = Array.isArray(def.options) ? def.options : [];
  const ft = def.fieldType || 'text';

  const set = (next) => onChange(next);

  if (ft === 'textarea') {
    return (
      <textarea
        className="form-input min-h-[88px]"
        value={value != null ? String(value) : ''}
        onChange={(e) => set(e.target.value)}
      />
    );
  }

  if (ft === 'number') {
    return (
      <input
        type="number"
        className="form-input"
        value={value != null ? String(value) : ''}
        onChange={(e) => set(e.target.value)}
      />
    );
  }

  if (ft === 'date') {
    return <input type="date" className="form-input" value={value != null ? String(value) : ''} onChange={(e) => set(e.target.value)} />;
  }

  if (ft === 'dropdown') {
    const selectOpts = [{ value: '', label: 'Select…' }, ...opts.map((o) => ({ value: String(o.value), label: o.label || o.value }))];
    return <UiSelect value={value != null ? String(value) : ''} onChange={(v) => set(v)} options={selectOpts} />;
  }

  if (ft === 'radio') {
    if (!opts.length) {
      return <p className="text-xs text-amber-700">Add choices in Settings for this radio field.</p>;
    }
    return (
      <div className="space-y-2">
        {opts.map((o) => (
          <label key={String(o.value)} className="flex cursor-pointer items-center gap-2 text-sm text-dark">
            <input
              type="radio"
              className="h-4 w-4 border-neutral-300 text-primary focus:ring-primary"
              name={`custom-field-${def.key}`}
              checked={String(value ?? '') === String(o.value)}
              onChange={() => set(o.value)}
            />
            <span>{o.label || o.value}</span>
          </label>
        ))}
      </div>
    );
  }

  if (ft === 'checkbox') {
    if (!opts.length) {
      const on = value === true || value === 'true';
      return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
          <input type="checkbox" className="form-checkbox" checked={on} onChange={(e) => set(e.target.checked ? 'true' : '')} />
          <span>Yes</span>
        </label>
      );
    }
    const selected = new Set(parseMultiCheckboxValue(value));
    const toggle = (optVal) => {
      const k = String(optVal);
      if (selected.has(k)) selected.delete(k);
      else selected.add(k);
      set(stringifyMultiCheckboxValue([...selected]));
    };
    return (
      <div className="space-y-2">
        {opts.map((o) => (
          <label key={String(o.value)} className="flex cursor-pointer items-center gap-2 text-sm text-dark">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={selected.has(String(o.value))}
              onChange={() => toggle(o.value)}
            />
            <span>{o.label || o.value}</span>
          </label>
        ))}
      </div>
    );
  }

  if (ft === 'image') {
    const s = value != null ? String(value) : '';
    return (
      <div className="space-y-2">
        <input
          type="url"
          className="form-input"
          value={s.startsWith('data:') ? '' : s}
          onChange={(e) => set(e.target.value)}
          placeholder="https://… image URL"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="text-xs text-slate-600" />
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={async () => {
              const input = fileInputRef.current;
              const file = input?.files?.[0];
              if (!file) return;
              setFileHint('');
              try {
                const dataUrl = await readFileAsDataUrl(file, MAX_INLINE_CUSTOM_FIELD_BYTES);
                set(dataUrl);
              } catch (e) {
                setFileHint(e.message || 'Could not use file.');
              }
              if (input) input.value = '';
            }}
          >
            Use small image file
          </button>
        </div>
        {fileHint && <p className="text-xs text-rose-600">{fileHint}</p>}
        {s && (s.startsWith('http') || s.startsWith('data:image')) ? (
          <img src={s} alt="" className="max-h-36 max-w-full rounded border border-neutral-200 object-contain" />
        ) : null}
        <p className="text-xs text-slate-500">Paste a URL, or embed a small image (data URL). Large assets should be hosted elsewhere.</p>
      </div>
    );
  }

  if (ft === 'file') {
    const s = value != null ? String(value) : '';
    return (
      <div className="space-y-2">
        <input
          type="url"
          className="form-input"
          value={s.startsWith('data:') ? '' : s}
          onChange={(e) => set(e.target.value)}
          placeholder="https://… document URL"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" className="text-xs text-slate-600" />
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={async () => {
              const input = fileInputRef.current;
              const file = input?.files?.[0];
              if (!file) return;
              setFileHint('');
              try {
                const dataUrl = await readFileAsDataUrl(file, MAX_INLINE_CUSTOM_FIELD_BYTES);
                set(dataUrl);
              } catch (e) {
                setFileHint(e.message || 'Could not use file.');
              }
              if (input) input.value = '';
            }}
          >
            Embed small file
          </button>
        </div>
        {fileHint && <p className="text-xs text-rose-600">{fileHint}</p>}
        {s.startsWith('data:') || (s.startsWith('http') && s.length > 0) ? (
          <a href={s} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline">
            Open / download current value
          </a>
        ) : null}
        <p className="text-xs text-slate-500">Paste a link to a document, or embed a small file (size limit applies).</p>
      </div>
    );
  }

  return <input className="form-input" value={value != null ? String(value) : ''} onChange={(e) => set(e.target.value)} />;
}
