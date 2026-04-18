let xlsxLoader;

async function loadXlsx() {
  if (!xlsxLoader) {
    xlsxLoader = import('xlsx');
  }
  return xlsxLoader;
}

const SAMPLE_HEADERS = [
  'title',
  'description',
  'assigned_user_email',
  'destination_lat',
  'destination_lng',
  'destination_address',
  'destination_city',
  'destination_pincode',
  'customer_company_name',
];

/** @param {Record<string, unknown>} row */
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

function num(v) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{ users: { _id: string, name?: string, email?: string }[], customers: { _id: string, companyName?: string, customerName?: string }[] }} ctx
 * @returns {Promise<{ tasks: object[], parseErrors: { row: number, message: string }[] }>}
 */
export async function parseFieldTasksWorkbook(buffer, ctx) {
  const XLSX = await loadXlsx();
  const users = Array.isArray(ctx.users) ? ctx.users : [];
  const customers = Array.isArray(ctx.customers) ? ctx.customers : [];

  const emailToUserId = new Map();
  users.forEach((u) => {
    const em = String(u.email || '')
      .trim()
      .toLowerCase();
    if (em) emailToUserId.set(em, String(u._id));
  });

  const companyKeyToCustomerId = new Map();
  customers.forEach((c) => {
    const key = String(c.companyName || '')
      .trim()
      .toLowerCase();
    if (key && !companyKeyToCustomerId.has(key)) companyKeyToCustomerId.set(key, String(c._id));
  });

  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { tasks: [], parseErrors: [{ row: 0, message: 'Workbook has no sheets.' }] };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const tasks = [];
  const parseErrors = [];

  rows.forEach((raw, idx) => {
    const row = /** @type {Record<string, unknown>} */ (raw);
    const rowNum = idx + 2;
    const title = String(cell(row, 'title', 'task_title', 'task_name', 'taskname') || '').trim();
    if (!title) {
      parseErrors.push({ row: rowNum, message: 'Missing title.' });
      return;
    }

    let assignedUser = String(
      cell(row, 'assigned_user_id', 'assigneduserid', 'assigned_user', 'assignee_id') || '',
    ).trim();
    const email = String(cell(row, 'assigned_user_email', 'assignee_email', 'user_email', 'email') || '')
      .trim()
      .toLowerCase();
    if (!assignedUser && email) {
      assignedUser = emailToUserId.get(email) || '';
    }
    if (!assignedUser) {
      parseErrors.push({ row: rowNum, message: 'Missing assignee (use assigned_user_email or assigned_user_id).' });
      return;
    }

    const lat = num(cell(row, 'destination_lat', 'lat', 'latitude'));
    const lng = num(cell(row, 'destination_lng', 'lng', 'longitude'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      parseErrors.push({ row: rowNum, message: 'Invalid or missing destination_lat / destination_lng.' });
      return;
    }

    const address = String(cell(row, 'destination_address', 'address', 'full_address') || '').trim();
    const city = String(cell(row, 'destination_city', 'city') || '').trim();
    const pincode = String(cell(row, 'destination_pincode', 'pincode', 'zip') || '').trim();
    const state = String(cell(row, 'destination_state', 'state') || '').trim();
    const country = String(cell(row, 'destination_country', 'country') || '').trim();
    const description = String(cell(row, 'description', 'desc', 'notes') || '').trim() || 'Imported from spreadsheet';

    const companyName = String(cell(row, 'customer_company_name', 'company_name', 'company') || '').trim();
    let customerId = '';
    if (companyName) {
      customerId = companyKeyToCustomerId.get(companyName.toLowerCase()) || '';
      if (!customerId) {
        parseErrors.push({
          row: rowNum,
          message: `No customer found with company name "${companyName}".`,
        });
        return;
      }
    }

    const task = {
      title,
      description,
      assignedUser,
      destinationLocation: {
        lat,
        lng,
        address: address || `${lat}, ${lng}`,
        city,
        pincode,
        state,
        country,
      },
      taskType: 'visit',
      priority: 'medium',
      status: 'assigned',
    };
    if (customerId) task.customerId = customerId;
    tasks.push(task);
  });

  return { tasks, parseErrors };
}

export async function downloadFieldTasksSampleXlsx() {
  const XLSX = await loadXlsx();
  const aoa = [
    SAMPLE_HEADERS,
    [
      'Site visit — demo',
      'Routine inspection',
      'field.agent@yourcompany.com',
      12.9716,
      77.5946,
      'MG Road, Bengaluru',
      'Bengaluru',
      '560001',
      '',
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.writeFile(wb, 'field-tasks-import-sample.xlsx');
}
