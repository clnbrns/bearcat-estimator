import React, { useEffect, useState } from 'react';
import { generateProjectPlan } from '../lib/api.js';

export default function ProjectPlan({ estimate, intake, onBack }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    generateProjectPlan(estimate, intake)
      .then(p => !cancel && setPlan(p))
      .catch(e => !cancel && setError(e.message))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [estimate, intake]);

  const pdfAttachments = (intake.attachments || []).filter(a => a.type === 'application/pdf');

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2 items-center justify-between">
        <button onClick={onBack} className="text-hunter underline">← Back to Estimate</button>
        <button onClick={() => window.print()} className="bg-brand-action text-white px-4 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">
          Print / Save PDF
        </button>
      </div>

      {loading && <div className="bg-white border border-sageMuted rounded-lg p-8 text-center text-hunter/70">Generating bilingual project plan…</div>}
      {error && <div className="bg-white border-2 border-burnt rounded-lg p-6 text-burnt">⚠ {error}</div>}

      {plan && (
        <article className="space-y-6">
          <header className="bg-hunter text-offwhite rounded-lg p-6">
            <div className="text-xs uppercase tracking-wider text-sageMuted">Crew Project Plan · Plan de proyecto para la cuadrilla</div>
            <h1 className="text-2xl font-bold mt-1">{plan.title}</h1>
            <div className="text-sm text-sageMuted mt-2">No pricing included · Sin precios incluidos</div>
          </header>

          {pdfAttachments.length > 0 && (
            <section className="bg-white border border-sageMuted rounded-lg p-4">
              <h2 className="text-lg font-semibold text-hunter mb-3">Measurement PDF · PDF de medidas</h2>
              {pdfAttachments.map((pdf, i) => (
                <div key={i} className="mb-4">
                  <div className="text-sm text-hunter/70 mb-2">{pdf.name}</div>
                  <iframe
                    title={pdf.name}
                    src={`data:application/pdf;base64,${pdf.base64}`}
                    className="w-full border border-sageMuted rounded"
                    style={{ height: '600px' }}
                  />
                </div>
              ))}
            </section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Lang title="English" data={plan.english} />
            <Lang title="Español" data={plan.spanish} />
          </div>
        </article>
      )}
    </div>
  );
}

function Lang({ title, data }) {
  if (!data) return null;
  return (
    <section className="bg-white border border-sageMuted rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-bold text-hunter border-b-2 border-hunter pb-1">{title}</h2>

      {data.summary && (
        <div>
          <div className="text-xs uppercase text-hunter/60 mb-1">Summary</div>
          <p className="text-sm">{data.summary}</p>
        </div>
      )}

      {data.site_address && (
        <div>
          <div className="text-xs uppercase text-hunter/60 mb-1">Site address</div>
          <p className="text-sm">{data.site_address}</p>
        </div>
      )}

      {Array.isArray(data.materials) && data.materials.length > 0 && (
        <div>
          <div className="text-xs uppercase text-hunter/60 mb-1">Materials</div>
          <ul className="text-sm list-disc list-inside space-y-0.5">
            {data.materials.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {Array.isArray(data.tools_needed) && data.tools_needed.length > 0 && (
        <div>
          <div className="text-xs uppercase text-hunter/60 mb-1">Tools needed</div>
          <ul className="text-sm list-disc list-inside space-y-0.5">
            {data.tools_needed.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {Array.isArray(data.steps) && data.steps.length > 0 && (
        <div>
          <div className="text-xs uppercase text-hunter/60 mb-2">Walkthrough</div>
          <ol className="space-y-3">
            {data.steps.map((s, i) => (
              <li key={i} className="border-l-4 border-burnt pl-3">
                <div className="font-semibold text-hunter text-sm">{i + 1}. {s.phase}</div>
                <ul className="text-sm list-disc list-inside mt-1 space-y-0.5">
                  {s.tasks?.map((t, j) => <li key={j}>{t}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.scope_notes && (
        <div>
          <div className="text-xs uppercase text-hunter/60 mb-1">Scope notes</div>
          <p className="text-sm whitespace-pre-wrap">{data.scope_notes}</p>
        </div>
      )}

      {Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <div>
          <div className="text-xs uppercase text-burnt mb-1">⚠ Warnings</div>
          <ul className="text-sm list-disc list-inside text-burnt space-y-0.5">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
