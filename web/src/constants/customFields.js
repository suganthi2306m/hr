/** Admin-configurable custom fields (Company.employeeCustomFieldDefs / companyCustomFieldDefs). */

export const CUSTOM_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'radio', label: 'Radio' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'image', label: 'Image' },
  { value: 'file', label: 'File' },
];

/** Max size when embedding a small file/image as a data URL (no separate upload API). */
export const MAX_INLINE_CUSTOM_FIELD_BYTES = 450 * 1024;
