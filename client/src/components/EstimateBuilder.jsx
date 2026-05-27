import React, { useEffect, useMemo, useState } from 'react';
import { calcEstimate, fmt } from '../lib/api.js';
import CimarronPicker from './CimarronPicker.jsx';
import PlantPicker from './PlantPicker.jsx';

export default function EstimateBuilder({ intake, products, components, onBack, onComplete }) {
  const defaults = {
    total_sf: intake.total_sf,
    product_name: intake.product_name,
    project_type: intake.project_type,
    supply_only: !!intake.supply_only,
    narrow_dim_ft: intake.narrow_dim_ft || '',
    long_dim_ft: intake.long_dim_ft || '',
    seam_lf: '',
    turf_overage_pct: intake.yard_shape === 'curves' ? 20 : 10,
    perimeter_lf: '',
    bender_board_lf: '',
    lumber_2x4_lf: '',
    putting_green_sf: intake.project_type === 'Putting Green' ? intake.total_sf : 0,
    pg_cup_count: intake.project_type === 'Putting Green' ? 1 : 0,
    pg_cup_size: '6in',
    pg_flag_count: intake.project_type === 'Putting Green' ? 1 : 0,
    hitting_mat_count: 0,
    include_shock_pad: intake.project_type === 'Playground',
    // If a cage config came from intake, prefill cimarron_items, labor, margin
    cimarron_items: intake.cage_config?._items || [],
    plant_items: [],
    no_turf: !!intake.no_turf,
    equipment_install_fee: intake.cage_config?._suggested_labor
      ?? (Number(intake.equipment_install_fee) || 0),
    flex_base_depth_in: components.flex_base.default_depth_inches,
    include_demo: false,
    include_laser_grading: false,
    include_weed_barrier: true,
    include_seam_tape: true,
    include_bender_board: true,
    include_silica_infill: true,
    include_antimicrobial_infill: intake.project_type === 'Pet Turf',
    french_drain_lf: 0,
    custom_line_items: [],
    margin_pct: intake.cage_config?._items?.length
      ? (components.cage_install?.default_margin_pct ?? 23)  // Cage default = 23% (20% target + 3.5% card fee buffer)
      : components.settings.default_margin_pct,
    apply_card_fee: components.settings.card_fee_enabled,
    card_fee_pct: components.settings.card_fee_pct,
    other_costs_pct: components.settings.other_costs_pct,
  };

  const [opts, setOpts] = useState(defaults);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const payload = useMemo(() => ({
    ...opts,
    perimeter_lf: opts.perimeter_lf ? Number(opts.perimeter_lf) : undefined,
    project_type: opts.project_type,
    supply_only: !!opts.supply_only,
    narrow_dim_ft: Number(opts.narrow_dim_ft) || 0,
    long_dim_ft: Number(opts.long_dim_ft) || 0,
    seam_lf: opts.seam_lf !== '' ? Number(opts.seam_lf) : undefined,
    bender_board_lf: opts.bender_board_lf ? Number(opts.bender_board_lf) : undefined,
    lumber_2x4_lf: Number(opts.lumber_2x4_lf) || 0,
    putting_green_sf: Number(opts.putting_green_sf) || 0,
    pg_cup_count: Number(opts.pg_cup_count) || 0,
    pg_cup_size: opts.pg_cup_size,
    pg_flag_count: Number(opts.pg_flag_count) || 0,
    hitting_mat_count: Number(opts.hitting_mat_count) || 0,
    include_shock_pad: !!opts.include_shock_pad,
    cimarron_items: opts.cimarron_items || [],
    plant_items: opts.plant_items || [],
    no_turf: !!opts.no_turf,
    equipment_install_fee: Number(opts.equipment_install_fee) || 0,
    turf_overage_pct: Number(opts.turf_overage_pct) || 0,
    french_drain_lf: Number(opts.french_drain_lf) || 0,
    margin_pct: Number(opts.margin_pct),
    flex_base_depth_in: Number(opts.flex_base_depth_in),
  }), [opts]);

  useEffect(() => {
    let cancelled = false;
    calcEstimate(payload)
      .then(r => { if (!cancelled) { setResult(r); setErr(null); } })
      .catch(e => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [payload]);

  const set = (k, v) => setOpts({ ...opts, [k]: v });
  const toggle = (k) => set(k, !opts[k]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
      <section className="bg-white border border-sageMuted rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold text-hunter">Configure Estimate</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumField label="Total SF" value={opts.total_sf} onChange={v => set('total_sf', Number(v))} />
          <NumField label="Perimeter LF (blank = auto)" value={opts.perimeter_lf}
            onChange={v => set('perimeter_lf', v)} placeholder={result ? String(result.perimeter_lf) : ''} />
          <NumField label="Flex base depth (in)" value={opts.flex_base_depth_in}
            onChange={v => set('flex_base_depth_in', Number(v))} />
          <NumField label="French drain LF" value={opts.french_drain_lf}
            onChange={v => set('french_drain_lf', Number(v))} />
          <NumField label="Bender board LF (blank = perimeter, billed in 20' sticks)"
            value={opts.bender_board_lf} onChange={v => set('bender_board_lf', v)}
            placeholder={result ? String(result.perimeter_lf) : ''} />
          <NumField label="2x4 lumber LF" value={opts.lumber_2x4_lf}
            onChange={v => set('lumber_2x4_lf', v)} />
          <NumField label="Putting green SF (subset of total)" value={opts.putting_green_sf}
            onChange={v => set('putting_green_sf', v)} />
          <NumField label="Narrow dim (ft) — for turf cut & seams"
            value={opts.narrow_dim_ft} onChange={v => set('narrow_dim_ft', v)} />
          <NumField label="Long dim (ft) — for turf cut & seams"
            value={opts.long_dim_ft} onChange={v => set('long_dim_ft', v)} />
          <NumField label="Seam LF override (blank = auto from dims)"
            value={opts.seam_lf} onChange={v => set('seam_lf', v)} />
          <NumField label="PG cups (count)" value={opts.pg_cup_count}
            onChange={v => set('pg_cup_count', v)} />
          <Field label="PG cup size">
            <select value={opts.pg_cup_size} onChange={e => set('pg_cup_size', e.target.value)}
              className="border border-sageMuted rounded px-3 py-2 w-full bg-offwhite focus:outline-none focus:ring-2 focus:ring-sage">
              <option value="6in">6" ($19.50)</option>
              <option value="4in">4" ($17.50)</option>
            </select>
          </Field>
          <NumField label="PG flag sets (pole + flag)" value={opts.pg_flag_count}
            onChange={v => set('pg_flag_count', v)} />
          <NumField label="Hitting mats (batting cage)" value={opts.hitting_mat_count}
            onChange={v => set('hitting_mat_count', v)} />
        </div>

        <Check checked={opts.include_shock_pad} onChange={() => toggle('include_shock_pad')}
          label={`Shock pad 8mm — fall-rated ($0.69/SF)${intake.project_type === 'Playground' ? ' · auto-on for Playground' : ''}`} />

        <CimarronPicker items={opts.cimarron_items} onChange={v => set('cimarron_items', v)} />

        <PlantPicker items={opts.plant_items} onChange={v => set('plant_items', v)} />

        <Check checked={opts.supply_only} onChange={() => toggle('supply_only')}
          label="Supply only / no install (skips labor, sub-base, demo, grading)" />

        <fieldset>
          <legend className="font-medium text-hunter mb-2">Include</legend>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Check checked={opts.include_weed_barrier} onChange={() => toggle('include_weed_barrier')} label="Weed barrier" />
            <Check checked={opts.include_seam_tape} onChange={() => toggle('include_seam_tape')} label="Seam tape & glue" />
            <Check checked={opts.include_bender_board} onChange={() => toggle('include_bender_board')} label="Bender board" />
            <Check checked={opts.include_silica_infill} onChange={() => toggle('include_silica_infill')} label="Silica sand infill" />
            <Check checked={opts.include_antimicrobial_infill} onChange={() => toggle('include_antimicrobial_infill')} label="Antimicrobial infill upcharge" />
            <Check checked={opts.include_demo} onChange={() => toggle('include_demo')} label="Sod removal / demo" />
            <Check checked={opts.include_laser_grading} onChange={() => toggle('include_laser_grading')} label="Laser grading" />
          </div>
        </fieldset>

        <div>
          <label className="font-medium text-hunter">Margin: {opts.margin_pct}%</label>
          <input type="range" min="0" max="60" value={opts.margin_pct}
            onChange={e => set('margin_pct', Number(e.target.value))} className="w-full accent-burnt" />
          <div className="flex gap-2 mt-1">
            {[22, 25, 30, 35].map(p => (
              <button key={p} type="button" onClick={() => set('margin_pct', p)}
                className={`text-xs px-2 py-0.5 rounded border ${opts.margin_pct === p ? 'bg-burnt text-white border-burnt' : 'border-sageMuted text-hunter hover:bg-sageMuted/30'}`}>
                {p}% {p === 22 ? '(commercial)' : p === 25 ? '(good)' : p === 30 ? '(better)' : '(best)'}
              </button>
            ))}
          </div>
        </div>

        <NumField label="Other costs % (equipment, dump fees, fuel, contingency)"
          value={opts.other_costs_pct}
          onChange={v => set('other_costs_pct', Number(v))} />

        <Check checked={opts.apply_card_fee} onChange={() => toggle('apply_card_fee')}
          label={`Apply ${opts.card_fee_pct}% card processing fee`} />

        <div className="flex justify-between pt-4">
          <button onClick={onBack} className="text-hunter underline">← Back</button>
          <button onClick={() => onComplete(result)} disabled={!result}
            className="bg-brand-action text-white px-6 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110 disabled:opacity-40">
            Generate Output →
          </button>
        </div>
      </section>

      <aside className="bg-hunter text-offwhite rounded-lg p-6 h-fit sticky top-4">
        <h3 className="text-lg font-semibold mb-4">Live Pricing</h3>
        {err && <div className="text-burnt mb-2">{err}</div>}
        {result && (
          <>
            <div className="space-y-1 text-sm border-b border-sage/30 pb-3 mb-3">
              {result.lines.map(l => (
                <div key={l.key} className="flex justify-between gap-4">
                  <span className="text-sageMuted truncate">{l.label}</span>
                  <span>{l.included ? 'Included' : fmt(l.cost)}</span>
                </div>
              ))}
            </div>
            <Row label="Total cost" value={fmt(result.totals.cost)} />
            <Row label={`Margin (${result.totals.margin_pct}%)`} value={fmt(result.totals.profit)} />
            {result.totals.card_fee > 0 && <Row label="Card fee" value={fmt(result.totals.card_fee)} />}
            <div className="border-t border-sage/30 mt-3 pt-3">
              <Row label="Sell price" value={fmt(result.totals.final_price)} big />
              <Row label="$ / SF" value={fmt(result.totals.price_per_sf)} />
              {result.benchmark && (
                <div className="mt-2 text-xs text-sageMuted">
                  Typical for {result.benchmark.label}:&nbsp;
                  <span className="text-offwhite font-semibold">${result.benchmark.median_psf.toFixed(2)}/SF</span>
                  {' '}(floor ${result.benchmark.floor?.toFixed(2)})
                  {result.benchmark.type_floor && (
                    <div className="mt-0.5">
                      {result.benchmark.project_type} minimum:&nbsp;
                      <span className="text-offwhite font-semibold">${result.benchmark.type_floor.toFixed(2)}/SF</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 text-xs text-sageMuted">
              <div className="font-semibold text-offwhite mb-1">Tier preview</div>
              <Row label="Good" value={fmt(result.tiers.good)} />
              <Row label="Better" value={fmt(result.tiers.better)} />
              <Row label="Best" value={fmt(result.tiers.best)} />
            </div>
            {result.warnings.length > 0 && (
              <ul className="mt-3 text-burnt text-xs space-y-1 list-disc list-inside">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><div className="text-sm font-medium text-hunter mb-1">{label}</div>{children}</label>;
}
function NumField({ label, value, onChange, placeholder }) {
  return (
    <Field label={label}>
      <input type="number" min="0" step="any" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="border border-sageMuted rounded px-3 py-2 w-full bg-offwhite focus:outline-none focus:ring-2 focus:ring-sage" />
    </Field>
  );
}
function Check({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-burnt" />
      <span>{label}</span>
    </label>
  );
}
function Row({ label, value, big }) {
  return (
    <div className={`flex justify-between ${big ? 'text-xl font-bold' : 'text-sm'}`}>
      <span className={big ? 'text-offwhite' : 'text-sageMuted'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
