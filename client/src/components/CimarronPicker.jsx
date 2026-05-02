import React, { useEffect, useMemo, useState } from 'react';
import { fmt } from '../lib/api.js';

export default function CimarronPicker({ items, onChange }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(items.length > 0);

  useEffect(() => {
    fetch('/api/cimarron').then(r => r.json()).then(setCatalog).catch(() => setCatalog([]));
  }, []);

  const categories = useMemo(() => catalog ? ['all', ...new Set(catalog.map(p => p.category))] : ['all'], [catalog]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const s = search.trim().toLowerCase();
    return catalog
      .filter(p => category === 'all' || p.category === category)
      .filter(p => !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))
      .slice(0, 30);
  }, [catalog, search, category]);

  const addItem = (sku) => {
    if (items.find(i => i.sku === sku)) return;
    onChange([...items, { sku, qty: 1 }]);
  };
  const removeItem = (sku) => onChange(items.filter(i => i.sku !== sku));
  const setQty = (sku, qty) => onChange(items.map(i => i.sku === sku ? { ...i, qty: Number(qty) || 0 } : i));

  const lookup = (sku) => catalog?.find(p => p.sku === sku);

  return (
    <div className="border border-sageMuted rounded-lg p-4 bg-sageMuted/10">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-hunter">⚾ Cimarron Equipment {items.length > 0 && <span className="text-xs text-hunter/60">({items.length} added)</span>}</div>
        <button type="button" onClick={() => setOpen(!open)} className="text-sm text-burnt hover:underline">
          {open ? 'Hide catalog' : 'Add equipment'}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-1 mb-3 text-sm">
          {items.map(it => {
            const p = lookup(it.sku);
            if (!p) return null;
            const total = it.qty * p.wholesale2024;
            return (
              <div key={it.sku} className="flex items-center gap-2 bg-white border border-sageMuted rounded px-2 py-1">
                <input type="number" min="1" value={it.qty} onChange={e => setQty(it.sku, e.target.value)}
                  className="w-14 border border-sageMuted rounded px-1 py-0.5 text-center" />
                <div className="flex-1 truncate">
                  <div className="text-hunter truncate">{p.name}</div>
                  <div className="text-xs text-hunter/60">{p.sku} · cost {fmt(p.wholesale2024)} · MAP {fmt(p.map2024)}</div>
                </div>
                <div className="text-hunter font-semibold">{fmt(total)}</div>
                <button type="button" onClick={() => removeItem(it.sku)} className="text-burnt px-1">×</button>
              </div>
            );
          })}
        </div>
      )}

      {open && catalog && (
        <div>
          <div className="flex gap-2 mb-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or SKU…"
              className="flex-1 border border-sageMuted rounded px-2 py-1 text-sm bg-white" />
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="border border-sageMuted rounded px-2 py-1 text-sm bg-white">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="max-h-72 overflow-y-auto bg-white border border-sageMuted rounded">
            {filtered.length === 0 && <div className="p-3 text-sm text-hunter/60">No matches.</div>}
            {filtered.map(p => {
              const added = items.find(i => i.sku === p.sku);
              return (
                <div key={p.sku} className={`flex items-center gap-2 px-2 py-1 border-b border-sageMuted/40 text-sm ${added ? 'bg-sage/20' : 'hover:bg-sageMuted/20'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-hunter truncate">{p.name}</div>
                    <div className="text-xs text-hunter/60">{p.sku} · cost {fmt(p.wholesale2024)} · MAP {fmt(p.map2024)}</div>
                  </div>
                  <button type="button" onClick={() => addItem(p.sku)} disabled={!!added}
                    className="bg-brand-action text-white px-2 py-0.5 rounded-md text-xs font-semibold shadow-sm transition hover:brightness-110 disabled:opacity-40">
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
