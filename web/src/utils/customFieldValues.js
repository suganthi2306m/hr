/** Parse stored value for multi-option checkboxes (array or JSON string). */
export function parseMultiCheckboxValue(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === '') return [];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const a = JSON.parse(value);
      return Array.isArray(a) ? a.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function stringifyMultiCheckboxValue(arr) {
  if (!Array.isArray(arr) || !arr.length) return [];
  return arr.map(String);
}

/**
 * @param {{ fieldType?: string, options?: { value?: string, label?: string }[] }} def
 * @param {unknown} value
 */
export function isCustomFieldValueEmpty(def, value) {
  if (!def || typeof def !== 'object') return true;
  const ft = def.fieldType || 'text';
  const opts = Array.isArray(def.options) ? def.options : [];

  if (ft === 'checkbox' && !opts.length) {
    return !(value === true || value === 'true');
  }
  if (ft === 'checkbox' && opts.length) {
    return parseMultiCheckboxValue(value).length === 0;
  }
  if (ft === 'number') {
    if (value == null || value === '') return true;
    const n = Number(value);
    return !Number.isFinite(n);
  }
  if (ft === 'dropdown' || ft === 'radio') {
    const s = value == null ? '' : String(value).trim();
    return !s;
  }
  if (ft === 'image' || ft === 'file') {
    const s = value == null ? '' : String(value).trim();
    return !s;
  }
  const s = value == null ? '' : String(value).trim();
  return !s;
}

/**
 * Labels of active defs marked required that are empty in `custom`.
 * @param {object[]} defs
 * @param {Record<string, unknown>} custom
 * @returns {string[]}
 */
export function missingRequiredCustomFieldLabels(defs, custom) {
  const map = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
  const labels = [];
  for (const def of defs || []) {
    if (def.isActive === false) continue;
    if (!def.isRequired) continue;
    if (!isCustomFieldValueEmpty(def, map[def.key])) continue;
    labels.push(String(def.label || def.key || 'Field').trim() || def.key);
  }
  return labels;
}
