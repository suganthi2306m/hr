import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import { downloadFieldTasksSampleXlsx, parseFieldTasksWorkbook } from '../utils/fieldTasksExcelImport';

export default function FieldTasksImportPage() {
  const navigate = useNavigate();
  const { setDashboardTrail } = useOutletContext() || {};
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [excelBusy, setExcelBusy] = useState(false);
  const excelInputRef = useRef(null);

  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const [{ data: usersData }, { data: custData }] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/customers'),
      ]);
      setUsers(Array.isArray(usersData?.items) ? usersData.items : []);
      setCustomers(Array.isArray(custData?.items) ? custData.items : []);
    } catch {
      setUsers([]);
      setCustomers([]);
    } finally {
      setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!setDashboardTrail) return undefined;
    setDashboardTrail(
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/track/fieldtasks')}
          className="btn-secondary shrink-0 px-3 py-2 text-sm font-semibold"
        >
          ← Back to tasks
        </button>
        <h1 className="min-w-0 truncate text-lg font-bold tracking-tight text-dark sm:text-xl">Import from Excel</h1>
      </div>,
    );
    return () => setDashboardTrail(null);
  }, [navigate, setDashboardTrail]);

  return (
    <section className="space-y-4">
      <div className="flux-card p-4 shadow-panel-lg sm:p-6">
        {loadingContext ? <LocationLoadingIndicator label="Loading users and customers..." className="mb-4" /> : null}
        <p className="text-sm text-slate-600">
          Download the sample file, replace rows with your tasks, then upload. Columns support common aliases (e.g.{' '}
          <span className="font-mono text-xs">lat</span> for <span className="font-mono text-xs">destination_lat</span>
          ).
        </p>
        <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
          <li>
            <span className="font-mono">title</span> — task title (required)
          </li>
          <li>
            <span className="font-mono">description</span>, <span className="font-mono">assigned_user_email</span> (or{' '}
            <span className="font-mono">assigned_user_id</span>)
          </li>
          <li>
            <span className="font-mono">destination_lat</span>, <span className="font-mono">destination_lng</span>,{' '}
            <span className="font-mono">destination_address</span> — optional city / pincode / state / country columns
          </li>
          <li>
            <span className="font-mono">customer_company_name</span> — optional; must match a customer in your directory
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" onClick={() => void downloadFieldTasksSampleXlsx()}>
            Download sample Excel
          </button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" />
          <button type="button" className="btn-secondary" onClick={() => excelInputRef.current?.click()}>
            Choose Excel file…
          </button>
          <button
            type="button"
            className="btn-primary disabled:opacity-60"
            disabled={excelBusy}
            onClick={async () => {
              const input = excelInputRef.current;
              const file = input?.files?.[0];
              if (!file) {
                window.alert('Choose an Excel file first.');
                return;
              }
              setExcelBusy(true);
              try {
                const buf = await file.arrayBuffer();
                const { tasks: parsed, parseErrors } = await parseFieldTasksWorkbook(buf, { users, customers });
                if (parseErrors.length) {
                  const msg = parseErrors
                    .slice(0, 12)
                    .map((e) => `Row ${e.row}: ${e.message}`)
                    .join('\n');
                  window.alert(
                    `${parseErrors.length} row(s) skipped.\n\n${msg}${parseErrors.length > 12 ? '\n…' : ''}`,
                  );
                }
                if (!parsed.length) {
                  window.alert('No valid task rows to import.');
                  return;
                }
                const { data } = await apiClient.post('/fieldtasks/bulk', { tasks: parsed });
                const n = data.items?.length || 0;
                const errN = data.errors?.length || 0;
                window.alert(`Imported ${n} task(s).${errN ? ` Server reported ${errN} error(s).` : ''}`);
                if (input) input.value = '';
                navigate('/dashboard/track/fieldtasks');
              } catch (e) {
                window.alert(e.response?.data?.message || e.message || 'Import failed.');
              } finally {
                setExcelBusy(false);
              }
            }}
          >
            {excelBusy ? 'Importing…' : 'Run import'}
          </button>
        </div>
      </div>
    </section>
  );
}
