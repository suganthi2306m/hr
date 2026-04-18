import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';

const EXPENSE_CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'travel', label: 'Travel' },
  { value: 'collection', label: 'Collection' },
  { value: 'general', label: 'General' },
];

const PAYMENT_METHODS = [
  { value: 'digital', label: 'Digital' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

function ExpensesPage() {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(null);
  const [form, setForm] = useState({
    amount: '',
    category: 'fuel',
    paymentMethod: 'digital',
    notes: '',
  });

  const load = useCallback(async () => {
    const { data } = await apiClient.get('/ops/expenses');
    setItems(data.items || []);
    setTotals(data.totals || null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    await apiClient.post('/ops/expenses', {
      amount: Number(form.amount),
      category: form.category,
      paymentMethod: form.paymentMethod,
      notes: form.notes,
    });
    setForm({ amount: '', category: 'fuel', paymentMethod: 'digital', notes: '' });
    load();
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Expenses & collections</h1>
        <p className="mt-1 text-sm text-slate-500">Fuel, travel, and cash vs digital collection tracking.</p>
      </div>

      {totals && (
        <div className="grid gap-3 sm:grid-cols-4">
          {['cash', 'digital', 'other'].map((k) => (
            <div key={k} className="flux-card p-4 shadow-panel">
              <p className="text-xs uppercase text-slate-500">{k}</p>
              <p className="mt-1 text-xl font-black text-dark">₹{Number(totals[k] || 0).toFixed(2)}</p>
            </div>
          ))}
          <div className="flux-card p-4 shadow-panel sm:col-span-1">
            <p className="text-xs uppercase text-slate-500">Total</p>
            <p className="mt-1 text-xl font-black text-primary">₹{Number(totals.all || 0).toFixed(2)}</p>
          </div>
        </div>
      )}

      <div className="flux-card p-5 shadow-panel-lg">
        <h2 className="text-base font-bold text-dark">Add entry</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div className="form-field">
            <label className="form-label-muted">Amount (INR)</label>
            <input className="form-input" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((o) => ({ ...o, amount: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label htmlFor="expense-category" className="form-label-muted">
              Category
            </label>
            <UiSelect
              id="expense-category"
              value={form.category}
              onChange={(next) => setForm((o) => ({ ...o, category: next }))}
              options={EXPENSE_CATEGORIES}
            />
          </div>
          <div className="form-field">
            <label htmlFor="expense-payment" className="form-label-muted">
              Payment
            </label>
            <UiSelect
              id="expense-payment"
              value={form.paymentMethod}
              onChange={(next) => setForm((o) => ({ ...o, paymentMethod: next }))}
              options={PAYMENT_METHODS}
            />
          </div>
          <div className="form-field sm:col-span-2">
            <label className="form-label-muted">Notes</label>
            <input className="form-input" value={form.notes} onChange={(e) => setForm((o) => ({ ...o, notes: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary sm:col-span-2">
            Save
          </button>
        </form>
      </div>

      <div className="flux-card overflow-auto p-4 shadow-panel-lg">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">When</th>
              <th>Category</th>
              <th>Method</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r._id} className="border-t border-neutral-100">
                <td className="py-2">{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.category}</td>
                <td>{r.paymentMethod}</td>
                <td className="text-right font-semibold">₹{Number(r.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ExpensesPage;
