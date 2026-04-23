/**
 * @param {{ employeeCode?: string, employeeId?: string, empId?: string, code?: string, name?: string } | null | undefined} user
 * @returns {string}
 */
export function employeeCodeOnly(user) {
  if (!user) return '';
  return String(user.employeeCode || user.employeeId || user.empId || user.code || '').trim();
}

/**
 * Text for employee dropdown rows: "CODE Name" when a code/id exists, otherwise "Name" only
 * (no placeholder dashes). Used with searchable selects so typing matches id or name.
 *
 * @param {{ employeeCode?: string, employeeId?: string, empId?: string, code?: string, name?: string } | null | undefined} user
 */
export function employeeSelectLabel(user) {
  if (!user) return 'Employee';
  const code = employeeCodeOnly(user);
  const name = String(user.name || '').trim() || 'Employee';
  return code ? `${code} ${name}` : name;
}
