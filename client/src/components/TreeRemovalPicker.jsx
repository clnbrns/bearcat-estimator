import React, { useId, useState } from 'react';
import { fmt } from '../lib/api.js';

// Tree & stump removal line items — fully manual (subcontracted service,
// no catalog). Each row: description, qty, sub_cost (what the sub charges).
// calculate.js bills sub_cost as the cost basis; project margin applies on
// top. At 30% margin a $1,000 sub bill sells for ~$1,430 to the customer.
export default function TreeRemovalPicker({ items, onChange }) {
  const [open, setOpen] = useState(items.length > 0);
  const uid = useId();

  const addRow = () => onChange([...items, { _id: `tr_${Date.now()}`, description: '', qty: 1, sub_cost: 0 }]);
  const remove = (id) => onChange(items.filter(i => i._id !== id));
  const update = (id, field, value) =>
    onChange(items.map(i => i._id === id ? { ...i, [field]: value } : i));

  const total = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.sub_cost) || 0), 0);

  return (
    <div className="border border-brand-green/15 rounded-lg p-4 bg-brand-green/5">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-brand-green">
          🌳 Tree &amp; stump removal{items.length > 0 && (
            <span className="text-xs text-brand-green/60 ml-1">({items.length} item{items.length !== 1 ? 's' : ''}, {fmt(total)} sub cost)</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setOpen(!open); if (!open && items.length === 0) addRow(); }}
          className="text-sm text-brand-action hover:underline min-h-[44px] px-2"
        >
          {open ? 'Hide' : 'Add tree removal'}
        </button>
      </div>

      {open && (
        <div className="space-y-2">
          <p className="text-xs text-brand-green/60">
            Enter what the tree sub charges you. Project margin marks it up for the customer.
          </p>

          {items.map((item, i) => (
            <div key={item._id} className="flex items-center gap-2 bg-white rounded px-2 py-1.5 border border-brand-green/15 text-sm">
              <input
                type="number" min="1" step="1" value={item.qty}
                onChange={e => update(item._id, 'qty', Number(e.target.value) || 1)}
                aria-label="Quantity"
                title="Quantity"
                className="w-12 border border-brand-green/20 rounded px-1 py-0.5 text-center min-h-[32px]"
              />
              <input
                type="text"
                value={item.description}
                onChange={e => update(item._id, 'description', e.target.value)}
                placeholder="e.g. Large Crape Myrtle"
                aria-label={`Tree description for row ${i + 1}`}
                className="flex-1 border border-brand-green/20 rounded px-2 py-0.5 min-h-[32px] text-brand-green placeholder:text-brand-green/30"
              />
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-brand-green/50 text-xs">$</span>
                <input
                  type="number" min="0" step="50" value={item.sub_cost || ''}
                  onChange={e => update(item._id, 'sub_cost', Number(e.target.value) || 0)}
                  placeholder="Sub cost"
                  aria-label={`Sub cost for ${item.description || 'tree removal'}`}
                  className="w-28 border border-brand-green/20 rounded pl-5 pr-1 py-0.5 min-h-[32px] tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(item._id)}
                aria-label={`Remove ${item.description || 'tree removal row'}`}
                className="text-brand-action min-w-[44px] min-h-[44px] flex items-center justify-center text-lg"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="text-sm text-brand-action hover:underline min-h-[36px] px-1"
          >
            + Add another tree
          </button>

          {items.length > 0 && (
            <p className="text-xs text-brand-green/50">
              Tip: Large crape myrtle + stump grind typically runs $750–1,400 from a sub.
              At 30% project margin that sells for ~$1,070–$2,000.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
