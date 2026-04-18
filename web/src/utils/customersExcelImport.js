let xlsxLoader;

async function loadXlsx() {
  if (!xlsxLoader) {
    xlsxLoader = import('xlsx');
  }
  return xlsxLoader;
}

const SAMPLE_HEADERS = [
  'customer_name',
  'mobile',
  'country_code',
  'company_name',
  'email',
  'address',
  'city',
  'pincode',
  'state',
  'country',
  'status',
];

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

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizeStatus(raw) {
  const s = String(raw || 'active')
    .trim()
    .toLowerCase();
  if (['inactive', '0', 'false', 'no'].includes(s)) return 'inactive';
  return 'active';
}

export async function parseCustomersWorkbook(buffer) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { customers: [], parseErrors: [{ row: 0, message: 'Workbook has no sheets.' }] };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
  const customers = [];
  const parseErrors = [];

  rows.forEach((raw, idx) => {
    const row = raw;
    const rowNum = idx + 2;
    const customerName = String(cell(row, 'customer_name', 'name') || '').trim();
    const emailId = String(cell(row, 'email', 'email_id') || '')
      .trim()
      .toLowerCase();
    const customerNumber = digitsOnly(cell(row, 'mobile', 'customer_number', 'phone'));
    const countryCode = digitsOnly(cell(row, 'country_code', 'code')) || '91';
    const companyName = String(cell(row, 'company_name', 'company') || '').trim();
    const address = String(cell(row, 'address') || '').trim();
    const city = String(cell(row, 'city') || '').trim();
    const pincode = digitsOnly(cell(row, 'pincode', 'zip'));
    const state = String(cell(row, 'state') || '').trim();
    const country = String(cell(row, 'country') || '').trim();
    const customerStatus = normalizeStatus(cell(row, 'status', 'customer_status', 'is_active'));

    if (!customerName) {
      parseErrors.push({ row: rowNum, message: 'Missing customer_name.' });
      return;
    }
    if (!emailId || !emailId.includes('@')) {
      parseErrors.push({ row: rowNum, message: 'Missing/invalid email.' });
      return;
    }
    if (!customerNumber) {
      parseErrors.push({ row: rowNum, message: 'Missing mobile number.' });
      return;
    }
    if (!address || !city || !pincode) {
      parseErrors.push({ row: rowNum, message: 'Address, city and pincode are required.' });
      return;
    }

    customers.push({
      customerName,
      customerNumber,
      countryCode,
      companyName,
      emailId,
      address,
      city,
      pincode,
      state,
      country,
      customerStatus,
    });
  });

  return { customers, parseErrors };
}

export async function downloadCustomersSampleXlsx() {
  const XLSX = await loadXlsx();
  const aoa = [
    SAMPLE_HEADERS,
    ['SRS Industry', '9876543210', '91', 'SRS Industry', 'srs@company.com', 'Hosur Main Road', 'Hosur', '635126', 'Tamil Nadu', 'India', 'active'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, 'customers-import-sample.xlsx');
}

export async function downloadCustomersExportXlsx(items) {
  const XLSX = await loadXlsx();
  const rows = (Array.isArray(items) ? items : []).map((c) => ({
    customer_name: c.customerName || '',
    company_name: c.companyName || '',
    email: c.emailId || '',
    mobile: c.customerNumber || '',
    country_code: c.countryCode || '',
    address: c.address || '',
    city: c.city || '',
    pincode: c.pincode || '',
    state: c.state || '',
    country: c.country || '',
    status: c.customerStatus || (c.isActive === false ? 'inactive' : 'active'),
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, 'customers-export.xlsx');
}
