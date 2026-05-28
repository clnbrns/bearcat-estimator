import React, { useEffect } from 'react';
import { fmt } from '../lib/api.js';

// Hand-the-tablet-to-the-customer presentation mode.
// Big numbers. No cost breakdown. No margin. No profit.
// Designed for in-yard close — owner shows iPad, customer signs.
export default function ClientPresentationMode({ estimate, intake, company, onBack }) {
  // Force a clean fullscreen-ish view by hiding scrollbars + give the owner
  // an Escape-key out (matches every other fullscreen UI on the planet).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onBack?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onBack]);

  const total = estimate.totals.final_price;
  const sf = intake.total_sf;
  const product = estimate.input?.product_name || '';
  const today = new Date().toLocaleDateString();

  // What's included — derive from line items, hide all dollars
  const includedBullets = (estimate.lines || [])
    .filter(l => !l.included && l.cost > 0)
    .filter(l => !l.key.includes('cleanup') && !l.key.includes('other_costs') && !l.key.includes('labor_min_day_adjustment'))
    .map(l => l.label.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);

  return (
    <div role="region" aria-label="Customer presentation view" className="fixed inset-0 bg-offwhite z-50 overflow-y-auto">
      {/* Tiny exit button — owner only, top right. Tap target raised to 44×44
          per WCAG 2.5.5; contrast bumped so it's not invisible to skim-readers. */}
      <button
        onClick={onBack}
        aria-label="Exit presentation mode and return to the estimate"
        className="no-print fixed top-4 right-4 text-hunter/70 hover:text-hunter text-sm px-3 min-h-[44px] rounded border border-hunter/30 bg-white/90 hover:bg-white shadow-sm"
      >
        ← Exit Presentation <span className="text-xs text-hunter/40 ml-1">(Esc)</span>
      </button>

      <div className="max-w-4xl mx-auto px-8 py-12 min-h-screen flex flex-col">
        {/* Brand header */}
        <header className="border-b-4 border-hunter pb-4 mb-8">
          <div className="text-3xl font-bold text-hunter">{company?.name || 'Bearcat Turf'}</div>
          <div className="text-sm text-hunter/60">Artificial Turf Installation · DFW</div>
        </header>

        {/* Customer + project header */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-8 sm:mb-12">
          <div>
            <div className="text-xs uppercase text-hunter/50 tracking-wider mb-1">Prepared for</div>
            <div className="text-2xl font-semibold text-hunter">{intake.customer_name}</div>
            {intake.project_address && <div className="text-hunter/70 mt-1">{intake.project_address}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-hunter/50 tracking-wider mb-1">Estimate · {today}</div>
            <div className="text-lg font-semibold text-hunter">{intake.project_type}</div>
            {sf > 0 && <div className="text-hunter/70 mt-1">{sf.toLocaleString()} square feet{product ? ` · ${product}` : ''}</div>}
          </div>
        </div>

        {/* THE BIG NUMBER */}
        <div className="text-center my-auto">
          <div className="text-xs uppercase text-hunter/50 tracking-widest mb-3">Your investment</div>
          <div className="text-5xl sm:text-7xl md:text-8xl font-bold text-hunter mb-2">
            {fmt(total)}
          </div>
          {sf > 0 && (
            <div className="text-lg text-hunter/60">
              {fmt(estimate.totals.price_per_sf)} per square foot · all-in
            </div>
          )}
        </div>

        {/* What's included */}
        <section className="mt-12 bg-white border border-hunter/20 rounded-lg p-6">
          <div className="text-xs uppercase text-hunter/50 tracking-wider mb-3">What's included</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-hunter">
            {includedBullets.slice(0, 10).map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-burnt mt-0.5">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Warranties */}
        <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-center">
          <div className="bg-hunter text-offwhite rounded-lg p-6">
            <div className="text-3xl font-bold">15</div>
            <div className="text-xs uppercase tracking-wider text-sageMuted mt-1">Year manufacturer warranty on turf</div>
          </div>
          <div className="bg-burnt text-white rounded-lg p-6">
            <div className="text-3xl font-bold">1</div>
            <div className="text-xs uppercase tracking-wider opacity-80 mt-1">Year Bearcat installation warranty</div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-hunter/20 text-center text-xs text-hunter/50 italic">
          Final pricing confirmed at install. {company?.name || 'Bearcat Turf'} appreciates your business.
        </footer>

        {/* Print button (visible only to owner) */}
        <div className="no-print mt-6 flex justify-center gap-3">
          <button onClick={() => window.print()}
            className="bg-brand-action text-white px-6 py-2 rounded-md font-semibold shadow-sm ring-1 ring-brand-action/30 transition hover:brightness-110">
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
