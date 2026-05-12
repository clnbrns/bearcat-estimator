import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPartners, savePartners, listPartnerJobs, fmt } from '../lib/api.js';

export default function PartnerAdmin() {
  const [partners, setPartners] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const refresh = () => Promise.all([listPartners(), listPartnerJobs()]).then(([p, j]) => {
    setPartners(p); setJobs(j);
  }).catch(e => setError(e.message));

  useEffect(() => { refresh(); }, []);

  const newPartner = () => setEditing({
    slug: '', name: '', contact_name: '', contact_email: '', contact_phone: '',
    logo_text: '', logo_url: null, margin_pct: 20, auto_approve_under_sf: 1500, active: true,
    created_at: new Date().toISOString().slice(0, 10),
  });

  const savePartner = async (p) => {
    if (!p.slug || !p.name) { setError('Slug and name required'); return; }
    const idx = partners.findIndex(x => x.slug === p.slug);
    const next = [...partners];
    if (idx >= 0) next[idx] = p; else next.push(p);
    await savePartners(next);
    setEditing(null);
    refresh();
  };

  const togglePartner = async (slug) => {
    const next = partners.map(p => p.slug === slug ? { ...p, active: !p.active } : p);
    await savePartners(next);
    refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="bg-hunter text-offwhite px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-bold">Partner Admin</div>
          <div className="text-sageMuted text-sm">Manage pool builder + contractor partners</div>
        </div>
        <Link to="/" className="text-sageMuted hover:text-offwhite text-sm underline">← Back to Estimator</Link>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {error && <div className="bg-burnt/10 text-burnt p-3 rounded">{error}</div>}

        {/* Pending jobs */}
        <section className="bg-white border border-sageMuted rounded-lg overflow-hidden">
          <header className="bg-hunter text-offwhite px-4 py-2 flex justify-between items-center">
            <div className="font-semibold">📥 Submitted Partner Jobs</div>
            <span className="text-xs text-sageMuted">{jobs.length} total</span>
          </header>
          {jobs.length === 0 ? (
            <div className="p-6 text-hunter/60 text-sm">No partner jobs submitted yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-sageMuted/30 text-xs uppercase text-hunter/70">
                <tr>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Partner</th>
                  <th className="text-left px-3 py-2">Customer</th>
                  <th className="text-right px-3 py-2">SF</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-t border-sageMuted/40">
                    <td className="px-3 py-2 text-hunter/70">{new Date(j.submitted_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2">{j.partner_name}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-hunter">{j.intake?.customer_name}</div>
                      <div className="text-xs text-hunter/60">{j.intake?.customer_phone || j.intake?.customer_email}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{j.intake?.total_sf}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(j.partner_price)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${j.status === 'auto_approved' ? 'bg-sage/30 text-hunter' : 'bg-burnt/20 text-burnt'}`}>
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Partner accounts */}
        <section className="bg-white border border-sageMuted rounded-lg overflow-hidden">
          <header className="bg-hunter text-offwhite px-4 py-2 flex justify-between items-center">
            <div className="font-semibold">🤝 Partner Accounts</div>
            <button onClick={newPartner} className="bg-brand-action text-white px-3 py-1 rounded-md text-sm font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">+ New partner</button>
          </header>
          <table className="w-full text-sm">
            <thead className="bg-sageMuted/30 text-xs uppercase text-hunter/70">
              <tr>
                <th className="text-left px-3 py-2">Partner</th>
                <th className="text-left px-3 py-2">Slug / Link</th>
                <th className="text-left px-3 py-2">Contact</th>
                <th className="text-right px-3 py-2">Margin</th>
                <th className="text-center px-3 py-2">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {partners.map(p => (
                <tr key={p.slug} className="border-t border-sageMuted/40">
                  <td className="px-3 py-2 font-medium text-hunter">{p.name}</td>
                  <td className="px-3 py-2">
                    <code className="text-xs bg-sageMuted/30 px-1 rounded">{p.slug}</code>
                    <div className="text-xs text-hunter/60">/partners/{p.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.contact_name}<br/>
                    <span className="text-hunter/60">{p.contact_email}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{p.margin_pct}%</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => togglePartner(p.slug)}
                      className={`text-xs px-2 py-0.5 rounded ${p.active ? 'bg-sage/30 text-hunter' : 'bg-sageMuted text-hunter/60'}`}>
                      {p.active ? '✓ Active' : '✗ Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(p)} className="text-burnt text-xs hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {editing && (
          <PartnerEditor partner={editing} onSave={savePartner} onCancel={() => setEditing(null)} />
        )}
      </main>
    </div>
  );
}

function PartnerEditor({ partner, onSave, onCancel }) {
  const [p, setP] = useState(partner);
  const update = (k, v) => setP({ ...p, [k]: v });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-hunter mb-4">{partner.created_at === new Date().toISOString().slice(0, 10) ? 'New Partner' : 'Edit Partner'}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Slug (URL part — no spaces)">
            <input className="input" value={p.slug} onChange={e => update('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
          </Field>
          <Field label="Display name">
            <input className="input" value={p.name} onChange={e => update('name', e.target.value)} />
          </Field>
          <Field label="Contact name">
            <input className="input" value={p.contact_name} onChange={e => update('contact_name', e.target.value)} />
          </Field>
          <Field label="Contact email">
            <input className="input" type="email" value={p.contact_email} onChange={e => update('contact_email', e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <input className="input" value={p.contact_phone} onChange={e => update('contact_phone', e.target.value)} />
          </Field>
          <Field label="Logo text (used if no logo image)">
            <input className="input" value={p.logo_text} onChange={e => update('logo_text', e.target.value)} placeholder="e.g. DFW POOLS" />
          </Field>
          <Field label="Logo URL (optional)">
            <input className="input" value={p.logo_url || ''} onChange={e => update('logo_url', e.target.value)} placeholder="/partner-logos/..." />
          </Field>
          <Field label="Bearcat margin %">
            <input className="input" type="number" value={p.margin_pct} onChange={e => update('margin_pct', Number(e.target.value))} />
          </Field>
          <Field label="Auto-approve under SF">
            <input className="input" type="number" value={p.auto_approve_under_sf} onChange={e => update('auto_approve_under_sf', Number(e.target.value))} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-hunter underline">Cancel</button>
          <button onClick={() => onSave(p)} className="bg-brand-action text-white px-6 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">Save</button>
        </div>

        {p.slug && (
          <div className="mt-4 bg-sageMuted/30 rounded p-3 text-sm">
            <div className="font-semibold text-hunter mb-1">Partner link:</div>
            <code className="text-xs">{window.location.origin}/partners/{p.slug}</code>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><div className="text-sm font-medium text-hunter mb-1">{label}</div>{children}</label>;
}
