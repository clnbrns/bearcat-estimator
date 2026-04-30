import React, { useEffect, useMemo, useState } from 'react';
import { fmt } from '../lib/api.js';

// Quick cage configurator. Pick a cage size + frame type → auto-builds the
// equipment list (cage combo + cable kit + hangers/carabiners) and computes
// install labor based on day-rate tiers (small=2 days, mid=3, large=4).
// Concrete-set HD frames add 1 day. Margin defaults to 20% on cage projects.
export default function CageQuickSetup({ value, onChange }) {
  const [catalog, setCatalog] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetch('/api/cimarron').then(r => r.json()).then(setCatalog).catch(() => setCatalog([]));
    fetch('/api/components').then(r => r.json()).then(c => setSettings(c.cage_install)).catch(() => {});
  }, []);

  const combos = useMemo(() => {
    if (!catalog) return [];
    return catalog
      .filter(p => p.category === 'Batting Cage Net + Frame Combos' && p.length && p.width && p.height)
      .sort((a, b) => (a.length * a.width * a.height) - (b.length * b.width * b.height));
  }, [catalog]);

  const cableKits = useMemo(() => {
    if (!catalog) return [];
    return catalog.filter(p => p.sku.endsWith('CABKIT') || p.sku.includes('CBKP'));
  }, [catalog]);

  const config = value || { combo_sku: '', include_cable_kit: true, include_accessories: true, concrete_set: false };

  const update = (k, v) => onChange({ ...config, [k]: v });
  const clear = () => onChange(null);

  // Auto-detect concrete-set when user picks an HD frame combo (CF1.5 SKUs without 'SP')
  const isHdFrame = (sku) => !!sku && sku.includes('CF1.5') && !sku.endsWith('SP');

  // Build hardware list + compute day-based labor
  const built = useMemo(() => {
    if (!catalog || !settings || !config.combo_sku) return null;
    const items = [];
    const combo = catalog.find(p => p.sku === config.combo_sku);
    if (!combo) return null;
    items.push({ sku: combo.sku, qty: 1 });

    if (config.include_cable_kit) {
      const wantPrefix = combo.length <= 55 ? '55' : '70';
      const cable = cableKits.find(p => p.sku.startsWith(wantPrefix) && p.sku.endsWith('CABKIT'));
      if (cable) items.push({ sku: cable.sku, qty: 1 });
    }
    if (config.include_accessories) {
      const hangers = catalog.find(p => p.sku === 'HANGERS25');
      const clips = catalog.find(p => p.sku === '234CLIPS50');
      if (hangers) items.push({ sku: hangers.sku, qty: 1 });
      if (clips) items.push({ sku: clips.sku, qty: 1 });
    }

    const detailed = items.map(it => ({ ...it, product: catalog.find(p => p.sku === it.sku) })).filter(it => it.product);
    const hardwareCost = detailed.reduce((s, it) => s + it.qty * it.product.wholesale2024, 0);

    // Day-based labor calculation
    const tier = settings.tiers.find(t => combo.length <= t.max_length_ft) || settings.tiers[settings.tiers.length - 1];
    const concreteAdd = config.concrete_set ? settings.concrete_upcharge : 0;
    const baseDays = tier.days;
    const baseLabor = baseDays * settings.day_rate;
    const totalLabor = baseLabor + concreteAdd;

    return { items, detailed, hardwareCost, tier, baseDays, baseLabor, concreteAdd, totalLabor };
  }, [catalog, settings, config, cableKits]);

  // Push computed values up
  useEffect(() => {
    if (!built) return;
    onChange({
      ...config,
      _items: built.items,
      _hardware_cost: built.hardwareCost,
      _suggested_labor: built.totalLabor,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.combo_sku, config.include_cable_kit, config.include_accessories, config.concrete_set, catalog, settings]);

  return (
    <div className="border-2 border-burnt/40 rounded-lg p-4 bg-burnt/5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-hunter">⚾ Cage Quick Setup</div>
        {config.combo_sku && (
          <button type="button" onClick={clear} className="text-xs text-burnt hover:underline">Clear</button>
        )}
      </div>
      <div className="text-xs text-hunter/70 mb-3">
        Pick a cage. We'll add the combo, matching cable kit, hangers + clips. Labor auto-calculates from cage size (2/3/4 days × $1,800/day, market-benchmarked). Margin auto-sets to 23% (20% target + 3.5% card-fee buffer).
      </div>

      <div className="space-y-2">
        <Field label="Cage size + frame type">
          <select className="input w-full" value={config.combo_sku || ''}
            onChange={e => {
              const sku = e.target.value;
              // Auto-toggle concrete_set when HD frame is picked
              onChange({ ...config, combo_sku: sku, concrete_set: isHdFrame(sku) });
            }}>
            <option value="">— Pick a cage —</option>
            {combos.map(p => (
              <option key={p.sku} value={p.sku}>
                {p.length}'×{p.width}'×{p.height}' #{p.gauge}
                {' '}{p.sku.includes('CFSP') ? '· Snap-Pin' : p.sku.includes('CF1.5') && !p.sku.endsWith('SP') ? '· HD Frame' : '· Frame Corners'}
                {' '}— {fmt(p.wholesale2024)} cost
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap gap-4 text-sm pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.include_cable_kit !== false}
              onChange={e => update('include_cable_kit', e.target.checked)} className="accent-burnt" />
            Include matching cable kit
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.include_accessories !== false}
              onChange={e => update('include_accessories', e.target.checked)} className="accent-burnt" />
            Include hangers + clips
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!config.concrete_set}
              onChange={e => update('concrete_set', e.target.checked)} className="accent-burnt" />
            Concrete-set HD frame (+$1,800)
          </label>
        </div>
      </div>

      {built && config.combo_sku && (
        <div className="mt-3 bg-white border border-sageMuted rounded p-3 text-sm space-y-3">
          <div>
            <div className="text-xs uppercase text-hunter/60 mb-1">Hardware</div>
            {built.detailed.map(it => (
              <div key={it.sku} className="flex justify-between">
                <span className="truncate text-hunter">{it.qty}× {it.product.name}</span>
                <span className="text-hunter/70 ml-2">{fmt(it.qty * it.product.wholesale2024)}</span>
              </div>
            ))}
            <div className="border-t border-sageMuted mt-1 pt-1 flex justify-between font-semibold text-hunter">
              <span>Hardware cost</span><span>{fmt(built.hardwareCost)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-hunter/60 mb-1">Install labor — {built.tier.label}</div>
            <div className="flex justify-between text-hunter">
              <span>{built.baseDays} days × ${built.tier.label && '1,800'}/day</span>
              <span>{fmt(built.baseLabor)}</span>
            </div>
            {built.concreteAdd > 0 && (
              <div className="flex justify-between text-burnt">
                <span>+ Concrete-set HD frame (1 extra day)</span>
                <span>{fmt(built.concreteAdd)}</span>
              </div>
            )}
            <div className="border-t border-sageMuted mt-1 pt-1 flex justify-between font-semibold text-hunter">
              <span>Labor cost (auto-fill)</span><span>{fmt(built.totalLabor)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-hunter mb-1">{label}</div>
      {children}
    </label>
  );
}
