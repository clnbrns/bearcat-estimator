import React, { useState } from 'react';
import { fmt, saveEstimate, generateQuickbooksDescription, appendToVoiceCorpus } from '../lib/api.js';
import ProjectPlan from './ProjectPlan.jsx';
import MaterialCrossSection from './MaterialCrossSection.jsx';
import ClientPresentationMode from './ClientPresentationMode.jsx';

export default function EstimateOutput({ estimate, intake, company, onBack }) {
  const [showDetail, setShowDetail] = useState(true);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState('estimate'); // 'estimate' | 'plan' | 'present'
  const [qbDesc, setQbDesc] = useState('');
  const [qbBusy, setQbBusy] = useState(false);
  const [qbError, setQbError] = useState(null);
  const [qbCopied, setQbCopied] = useState(false);
  const [corpusStatus, setCorpusStatus] = useState(null);
  const today = new Date().toLocaleDateString();

  const generateQbDescription = async () => {
    setQbBusy(true);
    setQbError(null);
    try {
      const r = await generateQuickbooksDescription(estimate, intake);
      setQbDesc(r.description);
    } catch (e) {
      setQbError(e.message);
    } finally {
      setQbBusy(false);
    }
  };

  const copyQbDescription = async () => {
    try {
      await navigator.clipboard.writeText(qbDesc);
      setQbCopied(true);
      setTimeout(() => setQbCopied(false), 2000);
    } catch {
      setQbError('Could not copy — select the text and copy manually.');
    }
  };

  const teachThis = async () => {
    setCorpusStatus({ busy: true });
    try {
      const r = await appendToVoiceCorpus(qbDesc);
      setCorpusStatus(r.added
        ? { ok: true, msg: `✓ Added. Voice corpus now has ${r.total} examples — future drafts will get smarter.` }
        : { warn: true, msg: r.reason || 'Already in corpus.' });
    } catch (e) {
      setCorpusStatus({ err: true, msg: e.message });
    }
  };

  if (view === 'plan') {
    return <ProjectPlan estimate={estimate} intake={intake} onBack={() => setView('estimate')} />;
  }
  if (view === 'present') {
    return <ClientPresentationMode estimate={estimate} intake={intake} company={company} onBack={() => setView('estimate')} />;
  }

  const save = async () => {
    await saveEstimate({ intake, estimate });
    setSaved(true);
  };

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2 items-center justify-between">
        <button onClick={onBack} className="text-hunter underline">← Back to Estimate</button>
        <div className="flex gap-2 items-center">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={showDetail} onChange={e => setShowDetail(e.target.checked)} className="accent-burnt" />
            Show line-item detail
          </label>
          <button onClick={save} className="bg-brand-action text-white px-4 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button onClick={() => setView('plan')} className="bg-brand-green text-white px-4 py-2 rounded-md font-semibold shadow-sm transition hover:brightness-110">
            Project Plan
          </button>
          <button onClick={() => setView('present')} className="bg-brand-orange text-white px-4 py-2 rounded-md font-semibold shadow-sm transition hover:brightness-110"
            title="Hand the screen to the customer — big numbers, no internal cost detail">
            🎯 Present to Client
          </button>
          <button onClick={() => window.print()} className="bg-brand-action text-white px-4 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">
            Print / Save PDF
          </button>
        </div>
      </div>

      <article className="bg-white border border-sageMuted rounded-lg p-10 shadow-sm max-w-3xl mx-auto">
        <header className="flex justify-between items-start border-b-2 border-hunter pb-4 mb-6">
          <div>
            <div className="text-3xl font-bold text-hunter">{company.name}</div>
            <div className="text-sm text-hunter/70">Artificial Turf Installation · DFW</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-hunter">ESTIMATE</div>
            <div>{today}</div>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm print:grid-cols-2">
          <div>
            <div className="text-hunter/60 uppercase text-xs">Customer</div>
            <div className="font-semibold">{intake.customer_name}</div>
            {intake.project_address && <div>{intake.project_address}</div>}
          </div>
          <div>
            <div className="text-hunter/60 uppercase text-xs">Project</div>
            <div className="font-semibold">{intake.project_type}</div>
            <div>{intake.total_sf.toLocaleString()} SF · {estimate.input.product_name}</div>
          </div>
        </section>

        {intake.notes && (
          <section className="mb-6 text-sm">
            <div className="text-hunter/60 uppercase text-xs mb-1">Scope notes</div>
            <div className="whitespace-pre-wrap">{intake.notes}</div>
          </section>
        )}

        {showDetail ? (
          <table className="w-full text-sm mb-6">
            <thead className="border-b border-hunter/30">
              <tr className="text-left text-hunter/60 uppercase text-xs">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map(l => (
                <tr key={l.key} className="border-b border-hunter/10">
                  <td className="py-2">{l.label}</td>
                  <td className="py-2 text-right">{l.qty.toLocaleString()} {l.unit}</td>
                  <td className="py-2 text-right">{l.included ? '—' : fmt(l.unit_cost)}</td>
                  <td className="py-2 text-right">{l.included ? 'Included' : fmt(l.cost * (1 / (1 - estimate.totals.margin_pct/100)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mb-6 text-sm">
            <div className="text-hunter/60 uppercase text-xs">Package includes</div>
            <ul className="list-disc list-inside">
              {estimate.lines.filter(l => !l.included || l.key === 'cleanup').map(l => (
                <li key={l.key}>{l.label}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Total SF:</span><span>{intake.total_sf.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Price / SF:</span><span>{fmt(estimate.totals.price_per_sf)}</span>
            </div>
            {estimate.totals.card_fee > 0 && (
              <div className="flex justify-between">
                <span>Card fee:</span><span>{fmt(estimate.totals.card_fee)}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl font-bold text-hunter border-t-2 border-hunter mt-2 pt-2">
              <span>Total:</span><span>{fmt(estimate.totals.final_price)}</span>
            </div>
            <div className="flex justify-between text-sm text-hunter/70 mt-2 pt-1 border-t border-hunter/10">
              <span>Cost:</span><span>{fmt(estimate.totals.cost)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-hunter">
              <span>Profit ({estimate.totals.margin_pct}%):</span><span>{fmt(estimate.totals.profit)}</span>
            </div>
          </div>
        </div>

        <section className="text-xs text-hunter/70 border-t border-hunter/20 pt-4">
          <div className="italic mb-2">{company.warranty}</div>
          <div className="text-center mt-6 pt-4 border-t border-hunter/10">
            {company.name} · Internal estimate
          </div>
        </section>
      </article>

      <div className="max-w-3xl mx-auto">
        <MaterialCrossSection estimate={estimate} intake={intake} />
      </div>

      <section className="no-print mt-6 max-w-3xl mx-auto bg-white border border-sageMuted rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-hunter">📋 QuickBooks Description</h3>
            <p className="text-xs text-hunter/60">Auto-drafted in Bearcat's voice from 29 past estimates. Edit before pasting.</p>
          </div>
          {!qbDesc && (
            <button onClick={generateQbDescription} disabled={qbBusy}
              className="bg-brand-green text-white px-4 py-2 rounded-md font-semibold shadow-sm transition hover:brightness-110 disabled:opacity-40">
              {qbBusy ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>

        {qbError && <div className="text-sm text-burnt mb-2">⚠ {qbError}</div>}

        {qbDesc && (
          <>
            <textarea value={qbDesc} onChange={e => setQbDesc(e.target.value)}
              className="w-full min-h-[200px] border border-sageMuted rounded p-3 text-sm bg-offwhite font-sans focus:outline-none focus:ring-2 focus:ring-sage" />
            <div className="flex gap-2 mt-2 items-center">
              <button onClick={copyQbDescription}
                className="bg-brand-action text-white px-4 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">
                {qbCopied ? '✓ Copied' : '📋 Copy to clipboard'}
              </button>
              <button onClick={generateQbDescription} disabled={qbBusy}
                className="bg-sage/30 text-hunter px-3 py-2 rounded text-sm">
                {qbBusy ? 'Re-generating…' : '↻ Re-draft'}
              </button>
              <button onClick={teachThis} disabled={corpusStatus?.busy}
                title="Save this description to the voice corpus so future drafts learn from it"
                className="bg-hunter text-offwhite px-3 py-2 rounded text-sm">
                {corpusStatus?.busy ? 'Saving…' : '🧠 Teach This'}
              </button>
              <span className="text-xs text-hunter/50 ml-2">{qbDesc.length} characters</span>
            </div>
            {corpusStatus && !corpusStatus.busy && (
              <div className={`mt-2 text-xs ${corpusStatus.err ? 'text-burnt' : corpusStatus.warn ? 'text-hunter/60' : 'text-hunter'}`}>
                {corpusStatus.msg}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
