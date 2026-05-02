import React, { useState } from 'react';
import CageQuickSetup from './CageQuickSetup.jsx';
import VoiceIntake from './VoiceIntake.jsx';
import { parseMeasurement } from '../lib/api.js';

const PROJECT_TYPES = [
  'Residential', 'Pet Turf', 'Putting Green', 'Batting Cage - Turf Only',
  'Batting Cage - Full Cage', 'Cage Install (no turf)', 'Sports Field', 'Playground', 'Commercial', 'Other',
];

// Project types that imply equipment-only install (no turf)
const NO_TURF_TYPES = new Set(['Cage Install (no turf)']);

// Project types that should show the Cage Quick-Setup picker
const CAGE_TYPES = new Set(['Batting Cage - Turf Only', 'Batting Cage - Full Cage', 'Cage Install (no turf)']);

const empty = {
  customer_name: '',
  project_address: '',
  project_type: 'Residential',
  yard_shape: 'squares',
  supply_only: false,
  no_turf: false,
  equipment_install_fee: '',
  cage_config: null,
  attachments: [],
  narrow_dim_ft: '',
  long_dim_ft: '',
  total_sf: '',
  zones: [{ label: '', sf: '' }],
  product_name: '',
  notes: '',
};

const SHAPE_OVERAGE = { squares: 0.10, curves: 0.20 };

export default function IntakeForm({ products, initial, onSubmit }) {
  const [form, setForm] = useState(initial || { ...empty, product_name: products[0]?.name || '' });
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setParsing(true); setParseError(null); setParseResult(null);

    // Capture file content as base64 so we can persist + later render the PDF in the project plan
    const attachments = await Promise.all(files.map(f => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: f.name,
        type: f.type,
        size: f.size,
        // strip the data URL prefix to keep just base64
        base64: String(reader.result).split(',')[1],
      });
      reader.readAsDataURL(f);
    })));

    try {
      const r = await parseMeasurement(files);
      setParseResult(r);
      setForm(prev => ({
        ...prev,
        narrow_dim_ft: r.narrow_dim_ft || prev.narrow_dim_ft,
        long_dim_ft: r.long_dim_ft || prev.long_dim_ft,
        total_sf: r.total_sf || prev.total_sf,
        zones: r.zones?.length ? r.zones.map(z => ({ label: z.label || '', sf: z.sf || 0 })) : prev.zones,
        notes: [prev.notes, r.scope_notes, r.drainage_notes, r.obstructions].filter(Boolean).join('\n').trim(),
        attachments,
      }));
    } catch (err) {
      setParseError(err.message);
      setForm(prev => ({ ...prev, attachments }));
    } finally { setParsing(false); }
  };

  const update = (k, v) => {
    const next = { ...form, [k]: v };
    // Project type drives no_turf automatically. User can still override via supply_only.
    if (k === 'project_type') {
      next.no_turf = NO_TURF_TYPES.has(v);
      if (next.no_turf) next.supply_only = false;
    }
    setForm(next);
  };
  const updateZone = (i, k, v) => {
    const zones = [...form.zones];
    zones[i] = { ...zones[i], [k]: v };
    setForm({ ...form, zones });
  };
  const addZone = () => setForm({ ...form, zones: [...form.zones, { label: '', sf: '' }] });
  const removeZone = (i) => setForm({ ...form, zones: form.zones.filter((_, j) => j !== i) });

  const zoneSum = form.zones.reduce((s, z) => s + (Number(z.sf) || 0), 0);
  const dimsSf = (Number(form.narrow_dim_ft) || 0) * (Number(form.long_dim_ft) || 0);
  const computedSf = Number(form.total_sf) || zoneSum || dimsSf;

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      total_sf: computedSf,
      narrow_dim_ft: Number(form.narrow_dim_ft) || 0,
      long_dim_ft: Number(form.long_dim_ft) || 0,
      zones: form.zones.filter(z => z.label || z.sf).map(z => ({ label: z.label, sf: Number(z.sf) || 0 })),
    });
  };

  // Cage-only mode: cage project type + no turf → hide all turf-specific fields
  const isCageOnly = form.no_turf && CAGE_TYPES.has(form.project_type);

  return (
    <form onSubmit={submit} className="space-y-6 bg-white border border-sageMuted rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-hunter">{isCageOnly ? '⚾ Quick Cage Quote' : 'Project Intake'}</h2>
        {isCageOnly && (
          <span className="text-xs text-hunter/60">Cage-only mode · turf fields hidden</span>
        )}
      </div>

      {!isCageOnly && (
      <Section number="1" title="Quick capture (optional)" subtitle="Skip the form — speak it, upload a PDF, or snap a photo. AI fills in the rest.">
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs uppercase tracking-wider text-hunter/60">
          <div>Speak it</div>
          <div>Upload measurement PDF</div>
          <div>Snap a yard photo</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VoiceIntake onParsed={(v) => {
            // Merge parsed voice fields into form, preserving anything already set
            setForm(prev => ({
              ...prev,
              customer_name: v.customer_name || prev.customer_name,
              project_address: v.project_address || prev.project_address,
              project_type: v.project_type || prev.project_type,
              total_sf: v.total_sf || prev.total_sf,
              narrow_dim_ft: v.narrow_dim_ft || prev.narrow_dim_ft,
              long_dim_ft: v.long_dim_ft || prev.long_dim_ft,
              yard_shape: v.yard_shape || prev.yard_shape,
              product_name: v.product_name || prev.product_name,
              notes: v.notes ? (prev.notes ? prev.notes + '\n' + v.notes : v.notes) : prev.notes,
            }));
          }} />

          <div className="border-2 border-dashed border-sage rounded p-4 bg-sageMuted/10">
            <div className="font-medium text-hunter mb-1">📐 Upload PDF or 📸 Photo</div>
            <div className="text-xs text-hunter/60 mb-2">CamToPlan PDFs auto-extract dims. Yard photos identify area, surface, slope, obstructions.</div>
            <input type="file" accept=".pdf,image/*" multiple onChange={handleUpload}
              className="block text-sm text-hunter file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-brand-action file:text-white file:cursor-pointer file:hover:brightness-110 file:font-semibold file:rounded-md file:shadow-sm mb-2" />
            <input type="file" accept="image/*" capture="environment" onChange={handleUpload}
              className="block text-sm text-hunter file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-sage file:text-hunter file:cursor-pointer file:hover:bg-sage/80" />
            <div className="text-xs text-hunter/50 italic mt-1">Second button opens camera on mobile.</div>
            {parsing && <div className="mt-2 text-sm text-hunter/70">⏳ Analyzing…</div>}
            {parseError && <div className="mt-2 text-sm text-burnt">⚠ {parseError}</div>}
            {parseResult && (
              <div className="mt-2 text-sm bg-white rounded p-2 border border-sageMuted">
                <div className="font-medium text-hunter">✓ Extracted (confidence: {parseResult.confidence?.overall || 'medium'})</div>
                <div className="text-xs text-hunter/70">
                  {parseResult.total_sf ? `${parseResult.total_sf} SF · ` : ''}
                  {parseResult.zones?.length ? `${parseResult.zones.length} zone${parseResult.zones.length > 1 ? 's' : ''} · ` : ''}
                  {parseResult.existing_surface && parseResult.existing_surface !== 'unknown' ? `Existing: ${parseResult.existing_surface}` : ''}
                  {parseResult.source_type && ` · source: ${parseResult.source_type}`}
                </div>
                {parseResult.obstructions && parseResult.obstructions !== '' && (
                  <div className="text-xs text-hunter/60 mt-1">Obstructions: {parseResult.obstructions}</div>
                )}
                <div className="text-xs text-hunter/50 mt-1 italic">Review &amp; override below as needed.</div>
              </div>
            )}
          </div>
        </div>
      </div>
      </Section>
      )}

      <Section number={isCageOnly ? "1" : "2"} title="Customer & project">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer name">
          <input className="input" value={form.customer_name} onChange={e => update('customer_name', e.target.value)} required />
        </Field>
        <Field label="Project address">
          <input className="input" value={form.project_address} onChange={e => update('project_address', e.target.value)} />
        </Field>
        <Field label="Project type">
          <select className="input" value={form.project_type} onChange={e => update('project_type', e.target.value)}>
            {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        {form.no_turf ? (
          <NumFieldRanged label="Equipment installation labor (flat $)"
            value={form.equipment_install_fee}
            onChange={v => update('equipment_install_fee', v)}
            placeholder="e.g. 850"
            warnAbove={50000} warnAboveMsg="Unusually high — verify it's not a typo (>$50K labor)" />
        ) : (
          <Field label="Turf product">
            <select className="input" value={form.product_name} onChange={e => update('product_name', e.target.value)}>
              {products.map(p => (
                <option key={p.name} value={p.name}>{p.name} — ${p.cost_per_sf.toFixed(2)}/SF · {p.use}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      </Section>

      {!isCageOnly && (
      <Section number="3" title="Measure" subtitle="Dimensions drive accurate turf waste + seam tape math.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <NumFieldRanged label="Narrow dimension (ft)" value={form.narrow_dim_ft}
          onChange={v => update('narrow_dim_ft', v)} placeholder="e.g. 30"
          warnAbove={200} warnAboveMsg="Unusually wide — most yards <100 ft narrow. Confirm." />
        <NumFieldRanged label="Long dimension (ft)" value={form.long_dim_ft}
          onChange={v => update('long_dim_ft', v)} placeholder="e.g. 50"
          warnAbove={500} warnAboveMsg="Unusually long — confirm not a typo." />
        <NumFieldRanged
          label={`Total SF ${dimsSf > 0 && !form.total_sf ? `(from dims: ${dimsSf})` : zoneSum > 0 && !form.total_sf ? `(from zones: ${zoneSum})` : ''}`}
          value={form.total_sf}
          onChange={v => update('total_sf', v)}
          placeholder={dimsSf > 0 ? String(dimsSf) : zoneSum > 0 ? String(zoneSum) : '0'}
          warnAbove={20000} warnAboveMsg="Large project (>20K SF) — confirm SF, not yards."
          warnBelow={50} warnBelowMsg="Tiny project (<50 SF) — confirm SF, not yards." />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="font-medium text-hunter">Zones (optional)</label>
          <button type="button" onClick={addZone} className="text-sm text-burnt hover:underline">+ Add zone</button>
        </div>
        <div className="space-y-2">
          {form.zones.map((z, i) => (
            <div key={i} className="flex gap-2">
              <input className="input flex-1" placeholder="Zone label (e.g. Backyard Main)"
                value={z.label} onChange={e => updateZone(i, 'label', e.target.value)} />
              <input className="input w-32" type="number" min="0" placeholder="SF"
                value={z.sf} onChange={e => updateZone(i, 'sf', e.target.value)} />
              {form.zones.length > 1 && (
                <button type="button" onClick={() => removeZone(i)} className="px-2 text-burnt">×</button>
              )}
            </div>
          ))}
        </div>
      </div>
      </Section>
      )}

      {CAGE_TYPES.has(form.project_type) && (
        <Section number={isCageOnly ? "2" : "4"} title="Equipment & cage spec">
          <CageQuickSetup value={form.cage_config} onChange={v => setForm({ ...form, cage_config: v })} />
        </Section>
      )}

      {!form.no_turf && !isCageOnly && (
      <Section number="4" title="Site conditions" subtitle="What we're working with on the ground.">
        <label className={`flex items-start gap-3 p-3 border-2 rounded cursor-pointer hover:bg-sageMuted/20 mb-3 ${form.supply_only ? 'border-burnt bg-burnt/10' : 'border-sageMuted'}`}>
          <input type="checkbox" checked={form.supply_only}
            onChange={e => update('supply_only', e.target.checked)}
            className="accent-burnt mt-1" />
          <div>
            <div className="font-medium text-hunter">Supply only / no install</div>
            <div className="text-xs text-hunter/60">Customer or contractor installs. Bills turf + accessories only — skips labor, sub-base, demo, grading.</div>
          </div>
        </label>

        <div className="text-sm font-medium text-hunter mb-2">Yard shape (drives turf waste allowance)</div>
        <div className="flex gap-4">
          {[
            { v: 'squares', label: 'Squares / rectangles', pct: 10 },
            { v: 'curves', label: 'Curves / irregular', pct: 20 },
          ].map(o => (
            <label key={o.v} className={`flex-1 border rounded p-3 cursor-pointer ${form.yard_shape === o.v ? 'border-burnt bg-burnt/10' : 'border-sageMuted'}`}>
              <input type="radio" name="yard_shape" value={o.v} checked={form.yard_shape === o.v}
                onChange={() => update('yard_shape', o.v)} className="accent-burnt mr-2" />
              <span className="font-medium">{o.label}</span>
              <span className="text-hunter/60 text-sm"> · +{o.pct}% turf</span>
            </label>
          ))}
        </div>
      </Section>
      )}

      <Section number={isCageOnly ? "3" : (CAGE_TYPES.has(form.project_type) ? "5" : "5")} title="Notes & scope">
        <textarea className="input min-h-[80px]" value={form.notes} onChange={e => update('notes', e.target.value)}
          placeholder="Slope, access constraints, drainage notes, special requests, anything the crew needs to know…" />
      </Section>

      <div className="flex justify-end">
        <button type="submit" disabled={isCageOnly ? !form.customer_name : (form.no_turf ? !form.customer_name : (!computedSf || !form.product_name))}
          className="bg-brand-action text-white px-6 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110 disabled:opacity-40">
          Continue to Estimate →
        </button>
      </div>

    </form>
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

function Section({ number, title, subtitle, children }) {
  return (
    <section className="border-l-2 border-burnt/40 pl-4 -ml-4">
      <div className="flex items-baseline gap-3 mb-1">
        <div className="text-xs font-bold text-burnt tracking-wider">STEP {number}</div>
        <h3 className="text-base font-semibold text-hunter">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-hunter/60 mb-3">{subtitle}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function NumFieldRanged({ label, value, onChange, placeholder, warnAbove, warnAboveMsg, warnBelow, warnBelowMsg }) {
  const num = Number(value);
  const aboveWarn = warnAbove && num > 0 && num > warnAbove;
  const belowWarn = warnBelow && num > 0 && num < warnBelow;
  const warning = aboveWarn ? warnAboveMsg : belowWarn ? warnBelowMsg : null;
  return (
    <Field label={label}>
      <input type="number" min="0" step="any"
        className={`input ${warning ? 'border-burnt ring-1 ring-burnt/40' : ''}`}
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {warning && (
        <div className="text-xs text-burnt mt-1">⚠ {warning}</div>
      )}
    </Field>
  );
}
