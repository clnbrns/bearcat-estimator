import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPartner, getProducts, getComponents, calcEstimate, submitPartnerJob, fmt } from '../lib/api.js';

const PROJECT_TYPES = ['Residential', 'Pet Turf', 'Putting Green', 'Commercial', 'Other'];

export default function PartnerPortal() {
  const { slug } = useParams();
  const [partner, setPartner] = useState(null);
  const [products, setProducts] = useState([]);
  const [components, setComponents] = useState(null);
  const [error, setError] = useState(null);

  // Single-page form state
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    project_address: '',
    project_type: 'Residential',
    total_sf: '',
    narrow_dim_ft: '',
    long_dim_ft: '',
    yard_shape: 'squares',
    product_name: '',
    notes: '',
  });
  const [estimate, setEstimate] = useState(null);
  const [calcing, setCalcing] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([getPartner(slug), getProducts(), getComponents()])
      .then(([p, pr, c]) => {
        setPartner(p);
        setProducts(pr);
        setComponents(c);
        setForm(f => ({ ...f, product_name: pr[0]?.name || '' }));
      })
      .catch(e => setError(e.message));
  }, [slug]);

  const update = (k, v) => setForm({ ...form, [k]: v });

  const computeEstimate = async () => {
    setCalcing(true);
    setEstimate(null);
    try {
      const total_sf = Number(form.total_sf) || (Number(form.narrow_dim_ft) * Number(form.long_dim_ft)) || 0;
      const result = await calcEstimate({
        total_sf,
        product_name: form.product_name,
        project_type: form.project_type,
        narrow_dim_ft: Number(form.narrow_dim_ft) || 0,
        long_dim_ft: Number(form.long_dim_ft) || 0,
        turf_overage_pct: form.yard_shape === 'curves' ? 20 : 10,
        margin_pct: partner.margin_pct,  // ← partner-specific margin
        include_weed_barrier: true,
        include_seam_tape: true,
        include_bender_board: true,
        include_silica_infill: true,
        include_antimicrobial_infill: form.project_type === 'Pet Turf',
      });
      setEstimate(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setCalcing(false);
    }
  };

  const submitToBearcat = async () => {
    setSubmitting(true);
    try {
      const total_sf = Number(form.total_sf) || (Number(form.narrow_dim_ft) * Number(form.long_dim_ft)) || 0;
      const job = await submitPartnerJob({
        partner_slug: partner.slug,
        partner_name: partner.name,
        intake: { ...form, total_sf },
        estimate,
        partner_price: estimate.totals.final_price,
        // Auto-approve threshold per partner
        status: total_sf <= (partner.auto_approve_under_sf || 0)
          ? 'auto_approved' : 'pending',
      });
      setSubmitted(job);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !partner) return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="bg-white border-2 border-burnt rounded-lg p-6 text-burnt">
        ⚠ {error}. Confirm your partner link with Bearcat Turf.
      </div>
    </div>
  );
  if (!partner || !components) return <div className="p-8">Loading…</div>;

  if (submitted) return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="bg-white border border-sage rounded-lg p-8 text-center">
        <div className="text-5xl mb-3">✓</div>
        <h1 className="text-2xl font-bold text-hunter mb-2">Submitted to Bearcat Turf</h1>
        <p className="text-hunter/70 mb-4">
          {submitted.status === 'auto_approved'
            ? 'Your job was auto-approved. Bearcat will reach out within 1 business day to schedule.'
            : 'Bearcat will review and confirm within 1 business day.'}
        </p>
        <div className="bg-sageMuted/30 rounded p-3 text-sm text-left inline-block">
          <div><strong>Job ID:</strong> {submitted.id}</div>
          <div><strong>Customer:</strong> {form.customer_name}</div>
          <div><strong>Total to customer:</strong> {fmt(submitted.partner_price)}</div>
          <div><strong>Status:</strong> {submitted.status}</div>
        </div>
        <div className="mt-6">
          <button onClick={() => { setSubmitted(null); setEstimate(null); setForm({ ...form, customer_name: '', customer_email: '', customer_phone: '', project_address: '', total_sf: '', narrow_dim_ft: '', long_dim_ft: '', notes: '' }); }}
            className="bg-burnt text-white px-6 py-2 rounded font-semibold">
            Submit Another
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Co-branded header */}
      <header className="bg-hunter text-offwhite px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {partner.logo_url ? (
            <img src={partner.logo_url} alt={partner.name} className="h-12 bg-white rounded p-1" />
          ) : (
            <div className="bg-offwhite text-hunter px-3 py-2 rounded font-bold tracking-wider">
              {partner.logo_text || partner.name.toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-xl font-bold">{partner.name} · Turf Estimator</div>
            <div className="text-sageMuted text-xs">Powered by Bearcat Turf · Authorized Installer</div>
          </div>
        </div>
        <div className="text-xs text-sageMuted">Partner margin: {partner.margin_pct}%</div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <section className="bg-white border border-sageMuted rounded-lg p-6">
          <h2 className="text-xl font-semibold text-hunter mb-4">New Customer Quote</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Customer name *">
              <input className="input" value={form.customer_name} onChange={e => update('customer_name', e.target.value)} />
            </Field>
            <Field label="Customer email">
              <input className="input" type="email" value={form.customer_email} onChange={e => update('customer_email', e.target.value)} />
            </Field>
            <Field label="Customer phone">
              <input className="input" value={form.customer_phone} onChange={e => update('customer_phone', e.target.value)} />
            </Field>
            <Field label="Project address">
              <input className="input" value={form.project_address} onChange={e => update('project_address', e.target.value)} />
            </Field>
            <Field label="Project type">
              <select className="input" value={form.project_type} onChange={e => update('project_type', e.target.value)}>
                {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Turf product">
              <select className="input" value={form.product_name} onChange={e => update('product_name', e.target.value)}>
                {products.map(p => <option key={p.name} value={p.name}>{p.name} · {p.use}</option>)}
              </select>
            </Field>
            <Field label="Narrow dim (ft)">
              <input className="input" type="number" value={form.narrow_dim_ft} onChange={e => update('narrow_dim_ft', e.target.value)} placeholder="e.g. 30" />
            </Field>
            <Field label="Long dim (ft)">
              <input className="input" type="number" value={form.long_dim_ft} onChange={e => update('long_dim_ft', e.target.value)} placeholder="e.g. 50" />
            </Field>
            <Field label="Total SF (or auto from dims)">
              <input className="input" type="number" value={form.total_sf} onChange={e => update('total_sf', e.target.value)}
                placeholder={form.narrow_dim_ft && form.long_dim_ft ? String(Number(form.narrow_dim_ft) * Number(form.long_dim_ft)) : '0'} />
            </Field>
            <Field label="Yard shape (turf waste)">
              <select className="input" value={form.yard_shape} onChange={e => update('yard_shape', e.target.value)}>
                <option value="squares">Squares / rectangles (+10% turf)</option>
                <option value="curves">Curves / irregular (+20% turf)</option>
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Scope notes (optional)">
              <textarea className="input min-h-[60px]" value={form.notes} onChange={e => update('notes', e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={computeEstimate}
              disabled={!form.customer_name || calcing || (!form.total_sf && (!form.narrow_dim_ft || !form.long_dim_ft))}
              className="bg-burnt text-white px-6 py-2 rounded font-semibold disabled:opacity-40">
              {calcing ? 'Calculating…' : 'Calculate Quote'}
            </button>
          </div>
        </section>

        {estimate && (
          <section className="bg-hunter text-offwhite rounded-lg p-6">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-xl font-semibold">Quote for {form.customer_name}</h2>
              <span className="text-xs text-sageMuted">{partner.name} pricing</span>
            </div>
            <div className="text-3xl font-bold">{fmt(estimate.totals.final_price)}</div>
            <div className="text-sm text-sageMuted">
              {estimate.input.total_sf?.toLocaleString()} SF · {fmt(estimate.totals.price_per_sf)}/SF · {form.product_name}
            </div>

            <div className="mt-4 bg-hunter/50 rounded p-3 text-sm">
              <div className="font-semibold mb-1">What's included</div>
              <ul className="list-disc list-inside text-sageMuted text-xs space-y-0.5">
                <li>Premium turf material with proper waste allowance</li>
                <li>Crushed recycled concrete sub-base, compacted</li>
                <li>15-year weed barrier, seam tape & glue, infill</li>
                <li>Bender board edging with stakes, all fasteners</li>
                <li>Professional installation by Bearcat Turf crew</li>
                <li>15-year manufacturer warranty + 1-year install warranty</li>
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={submitToBearcat} disabled={submitting}
                className="bg-burnt text-white px-6 py-2 rounded font-semibold disabled:opacity-40">
                {submitting ? 'Submitting…' : 'Submit to Bearcat for booking →'}
              </button>
              <button onClick={() => window.print()}
                className="bg-sage/30 text-offwhite px-4 py-2 rounded">
                Print / Save PDF
              </button>
              <button onClick={() => setEstimate(null)}
                className="text-sageMuted underline px-3">
                Adjust scope
              </button>
            </div>
          </section>
        )}

        {error && <div className="text-burnt">{error}</div>}
      </main>

      <footer className="text-center text-xs text-hunter/50 py-6">
        Powered by Bearcat Turf · Authorized installer · DFW
      </footer>
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
