import React, { useEffect, useMemo, useState } from 'react';
import { fmt, getPlants } from '../lib/api.js';

// Plant picker. Loads the most recent Wolfe Nursery catalog (or whichever
// supplier file is newest in data/plants/), lets the user search by name +
// filter by category + size, and adds line items with qty. The estimator's
// calculate.js handles wholesale-material + per-pot-size install labor for
// each selection.
export default function PlantPicker({ items, onChange }) {
  const [catalog, setCatalog] = useState(null);
  const [source, setSource] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(items.length > 0);

  useEffect(() => {
    getPlants()
      .then(d => { setCatalog(d.items || []); setSource(d._source || null); })
      .catch(() => setCatalog([]));
  }, []);

  const categories = useMemo(
    () => catalog ? ['all', ...new Set(catalog.map(p => p.category).filter(Boolean))].sort() : ['all'],
    [catalog]
  );

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const s = search.trim().toLowerCase();
    return catalog
      .filter(p => category === 'all' || p.category === category)
      .filter(p => !s || p.description.toLowerCase().includes(s))
      .slice(0, 40);
  }, [catalog, search, category]);

  const addItem = (id) => {
    if (items.find(i => i.id === id)) return;
    onChange([...items, { id, qty: 1 }]);
  };
  const removeItem = (id) => onChange(items.filter(i => i.id !== id));
  const setQty = (id, qty) => onChange(items.map(i => i.id === id ? { ...i, qty: Number(qty) || 0 } : i));
  const lookup = (id) => catalog?.find(p => p.id === id);

  return (
    <div className="border border-brand-green/15 rounded-lg p-4 bg-brand-green/5">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-brand-green">
          🌳 Plants {items.length > 0 && <span className="text-xs text-brand-green/60">({items.length} added)</span>}
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="text-sm text-brand-action hover:underline">
          {open ? 'Hide catalog' : 'Add plants'}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-1 mb-3 text-sm">
          {items.map(it => {
            const p = lookup(it.id);
            if (!p) return null;
            const total = it.qty * p.price;
            return (
              <div key={it.id} className="flex items-center gap-2 bg-white border border-brand-green/15 rounded px-2 py-1">
                <input
                  type="number" min="1" value={it.qty}
                  onChange={e => setQty(it.id, e.target.value)}
                  className="w-14 border border-brand-green/20 rounded px-1 py-0.5 text-center"
                />
                <div className="flex-1 truncate">
                  <div className="text-brand-green truncate">{p.description}</div>
                  <div className="text-xs text-brand-green/60">
                    {p.category} · {p.size || '—'} · wholesale {fmt(p.price)}/ea
                  </div>
                </div>
                <div className="text-brand-green font-semibold">{fmt(total)}</div>
                <button type="button" onClick={() => removeItem(it.id)} className="text-brand-action px-1">×</button>
              </div>
            );
          })}
        </div>
      )}

      {open && catalog && (
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search (e.g. Live Oak, Bermuda, Salvia)"
              className="flex-1 min-w-[180px] border border-brand-green/20 rounded px-2 py-1 text-sm"
            />
            <select
              value={category} onChange={e => setCategory(e.target.value)}
              className="border border-brand-green/20 rounded px-2 py-1 text-sm"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="text-xs text-brand-green/50 mb-1">
            {source ? `Source: ${source}` : ''} · showing {filtered.length} of {catalog.length}
          </div>
          <div className="max-h-72 overflow-auto border border-brand-green/15 rounded bg-white">
            {filtered.map(p => {
              const already = items.find(i => i.id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p.id)}
                  disabled={!!already}
                  className={`w-full text-left px-2 py-1.5 border-b border-brand-green/10 text-sm flex items-center justify-between gap-2 ${
                    already ? 'bg-brand-green/5 text-brand-green/40' : 'hover:bg-brand-action/5 text-brand-green'
                  }`}
                >
                  <span className="flex-1 truncate">
                    {p.description}
                    <span className="text-xs text-brand-green/50 ml-2">{p.category} · {p.size || '—'}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{fmt(p.price)}</span>
                  {already && <span className="text-xs">✓</span>}
                </button>
              );
            })}
            {!filtered.length && (
              <div className="p-3 text-sm text-brand-green/50 text-center">No matches.</div>
            )}
          </div>
        </div>
      )}
      {open && !catalog && <div className="text-sm text-brand-green/60">Loading catalog…</div>}
    </div>
  );
}
