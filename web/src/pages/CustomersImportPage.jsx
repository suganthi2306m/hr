import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import apiClient from '../api/client';
import { downloadCustomersSampleXlsx, parseCustomersWorkbook } from '../utils/customersExcelImport';

export default function CustomersImportPage() {
  const navigate = useNavigate();
  const { setDashboardTrail } = useOutletContext() || {};
  const [excelBusy, setExcelBusy] = useState(false);
  const excelInputRef = useRef(null);

  const runImport = useCallback(async () => {
    const input = excelInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      window.alert('Choose an Excel file first.');
      return;
    }
    setExcelBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const { customers: parsed, parseErrors } = await parseCustomersWorkbook(buf);
      if (parseErrors.length) {
        const msg = parseErrors
          .slice(0, 12)
          .map((e) => `Row ${e.row}: ${e.message}`)
          .join('\n');
        window.alert(`${parseErrors.length} row(s) skipped.\n\n${msg}${parseErrors.length > 12 ? '\n…' : ''}`);
      }
      if (!parsed.length) {
        window.alert('No valid customer rows to import.');
        return;
      }

      const errors = [];
      let created = 0;
      for (let i = 0; i < parsed.length; i += 1) {
        try {
          await apiClient.post('/customers', parsed[i]);
          created += 1;
        } catch (e) {
          errors.push(`Row ${i + 2}: ${e.response?.data?.message || e.message || 'Failed to import customer.'}`);
        }
      }
      if (errors.length) {
        const preview = errors.slice(0, 12).join('\n');
        window.alert(`Imported ${created}/${parsed.length} customers.\n\n${preview}${errors.length > 12 ? '\n…' : ''}`);
      } else {
        window.alert(`Imported ${created} customer(s).`);
      }
      if (input) input.value = '';
      navigate('/dashboard/track/customers');
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Import failed.');
    } finally {
      setExcelBusy(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!setDashboardTrail) return undefined;
    setDashboardTrail(
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/track/customers')}
          className="btn-secondary shrink-0 px-3 py-2 text-sm font-semibold"
        >
          ← Back to customers
        </button>
        <h1 className="min-w-0 truncate text-lg font-bold tracking-tight text-dark sm:text-xl">Import from Excel</h1>
      </div>,
    );
    return () => setDashboardTrail(null);
  }, [navigate, setDashboardTrail]);

  return (
    <section className="space-y-4">
      <div className="flux-card p-4 shadow-panel-lg sm:p-6">
        <p className="text-sm text-slate-600">
          Download the sample file, replace rows with your customers, then upload.
        </p>
        <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
          <li>
            Required: <span className="font-mono">customer_name</span>, <span className="font-mono">email</span>, <span className="font-mono">mobile</span>,{' '}
            <span className="font-mono">address</span>, <span className="font-mono">city</span>, <span className="font-mono">pincode</span>
          </li>
          <li>
            Optional: <span className="font-mono">company_name</span>, <span className="font-mono">country_code</span>,{' '}
            <span className="font-mono">state</span>, <span className="font-mono">country</span>, <span className="font-mono">status</span>
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" onClick={() => void downloadCustomersSampleXlsx()}>
            Download sample Excel
          </button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" />
          <button type="button" className="btn-secondary" onClick={() => excelInputRef.current?.click()}>
            Choose Excel file…
          </button>
          <button type="button" className="btn-primary disabled:opacity-60" disabled={excelBusy} onClick={() => void runImport()}>
            {excelBusy ? 'Importing…' : 'Run import'}
          </button>
        </div>
      </div>
    </section>
  );
}
