let xlsxLoader;

async function loadXlsx() {
  if (!xlsxLoader) {
    xlsxLoader = import('xlsx');
  }
  return xlsxLoader;
}

const SAMPLE_HEADERS = ['name', 'email', 'phone', 'role', 'password', 'is_active'];

function cell(row, ...keys) {
  const lower = keys.map((k) => k.toLowerCase());
  for (const [rawKey, val] of Object.entries(row)) {
    const k = String(rawKey || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (lower.includes(k)) return val;
  }
  return '';
}

function normalizeRole(raw) {
  const r = String(raw || 'field_agent')
    .trim()
    .toLowerCase();
  if (r === 'field_user') return 'field_agent';
  if (r === 'supervisor') return 'manager';
  if (['admin', 'manager', 'field_agent'].includes(r)) return r;
  return 'field_agent';
}

function parseBool(raw, fallback = true) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 'yes', 'y', 'active'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'inactive'].includes(v)) return false;
  return fallback;
}

export async function parseUsersWorkbook(buffer) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { users: [], parseErrors: [{ row: 0, message: 'Workbook has no sheets.' }] };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
  const users = [];
  const parseErrors = [];

  rows.forEach((raw, idx) => {
    const row = raw;
    const rowNum = idx + 2;
    const name = String(cell(row, 'name', 'full_name') || '').trim();
    const email = String(cell(row, 'email', 'email_id') || '')
      .trim()
      .toLowerCase();
    const phone = String(cell(row, 'phone', 'mobile', 'phone_number') || '').trim();
    const password = String(cell(row, 'password', 'pass') || '').trim();
    if (!name) {
      parseErrors.push({ row: rowNum, message: 'Missing name.' });
      return;
    }
    if (!email || !email.includes('@')) {
      parseErrors.push({ row: rowNum, message: 'Missing/invalid email.' });
      return;
    }
    if (!password) {
      parseErrors.push({ row: rowNum, message: 'Missing password.' });
      return;
    }
    users.push({
      name,
      email,
      phone,
      role: normalizeRole(cell(row, 'role', 'user_role')),
      password,
      isActive: parseBool(cell(row, 'is_active', 'active', 'status'), true),
    });
  });

  return { users, parseErrors };
}

export async function downloadUsersSampleXlsx() {
  const XLSX = await loadXlsx();
  const aoa = [
    SAMPLE_HEADERS,
    ['Priya Sharma', 'priya@yourcompany.com', '9876543210', 'field_agent', 'Pass@1234', 'true'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  XLSX.writeFile(wb, 'users-import-sample.xlsx');
}

export async function downloadUsersExportXlsx(items) {
  const XLSX = await loadXlsx();
  const rows = (Array.isArray(items) ? items : []).map((u) => ({
    name: u.name || '',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role || '',
    is_active: u.isActive ? 'true' : 'false',
    company: u.companyId?.name || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  XLSX.writeFile(wb, 'users-export.xlsx');
}
