/** Mirrors web `customFieldValues.isCustomFieldValueEmpty` for server-side checks. */

function parseMultiCheckboxValue(value) {
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

function isCustomFieldValueEmpty(def, value) {
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

function mergeEmployeeProfilesForValidation(prev, incoming) {
  const a = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  const b = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  const custom = {
    ...(a.custom && typeof a.custom === 'object' && !Array.isArray(a.custom) ? a.custom : {}),
    ...(b.custom && typeof b.custom === 'object' && !Array.isArray(b.custom) ? b.custom : {}),
  };
  return { ...a, ...b, custom };
}

/**
 * @param {object[]} defs Company.employeeCustomFieldDefs
 * @param {Record<string, unknown>} custom employeeProfile.custom
 * @returns {string[]} human labels for missing required fields
 */
function missingRequiredEmployeeCustomFieldLabels(defs, custom) {
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

module.exports = {
  missingRequiredEmployeeCustomFieldLabels,
  mergeEmployeeProfilesForValidation,
};
