import React, { useEffect, useMemo, useState } from 'react';
import { listEstimates, fmt } from '../lib/api.js';

export default function EstimateHistory({ onOpen, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listEstimates()
      .then(setItems)
      .catch(e => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(it => {
      const intake = it.intake || {};
      return [
        intake.customer_name,
        intake.project_address,
        intake.project_type,
        it.id,
      ].some(v => (v || '').toLowerCase().includes(s));
    });
  }, [items, search]);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2 items-center justify-between">
        <button onClick={onClose} className="text-hunter underline">← Back</button>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer, address, type, or ID"
          className="border border-sageMuted rounded px-3 py-2 w-72 bg-offwhite focus:outline-none focus:ring-2 focus:ring-sage"
        />
      </div>

      <section className="bg-white border border-sageMuted rounded-lg overflow-hidden">
        <header className="bg-hunter text-offwhite px-6 py-3 flex justify-between items-baseline">
          <h2 className="text-lg font-semibold">Estimate History</h2>
          {items && <span className="text-sm text-sageMuted">{filtered?.length ?? items.length} of {items.length}</span>}
        </header>

        {error && <div className="p-6 text-burnt">⚠ {error}</div>}
        {!items && !error && <div className="p-6 text-hunter/60">Loading…</div>}
        {items && items.length === 0 && (
          <div className="p-8 text-center text-hunter/60">No saved estimates yet. Save one from the Output page to see it here.</div>
        )}

        {filtered && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-sageMuted/30 text-hunter/70 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-2">Saved</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">SF</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-right px-4 py-2">Profit</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => {
                const i = it.intake || {};
                const t = it.estimate?.totals || {};
                const date = it.saved_at ? new Date(it.saved_at).toLocaleDateString() : '—';
                return (
                  <tr key={it.id} className="border-t border-sageMuted/50 hover:bg-sageMuted/10">
                    <td className="px-4 py-2 text-hunter/70">{date}</td>
                    <td className="px-4 py-2 font-medium text-hunter">
                      {i.customer_name || '—'}
                      {i.project_address && <div className="text-xs text-hunter/60">{i.project_address}</div>}
                    </td>
                    <td className="px-4 py-2">{i.project_type || '—'}</td>
                    <td className="px-4 py-2 text-right">{i.total_sf?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{t.final_price ? fmt(t.final_price) : '—'}</td>
                    <td className="px-4 py-2 text-right text-hunter/70">{t.profit ? fmt(t.profit) : '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => onOpen(it)} className="bg-burnt text-white px-3 py-1 rounded text-xs font-semibold hover:bg-burnt/90">
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
