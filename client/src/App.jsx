import React, { useEffect, useState } from 'react';
import IntakeForm from './components/IntakeForm.jsx';
import EstimateBuilder from './components/EstimateBuilder.jsx';
import EstimateOutput from './components/EstimateOutput.jsx';
import EstimateHistory from './components/EstimateHistory.jsx';
import { Link } from 'react-router-dom';
import { getProducts, getComponents } from './lib/api.js';

const STEPS = ['Intake', 'Estimate', 'Output'];

export default function App() {
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState([]);
  const [components, setComponents] = useState(null);
  const [intake, setIntake] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    Promise.all([getProducts(), getComponents()])
      .then(([p, c]) => { setProducts(p); setComponents(c); })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-red-700">API error: {error}. Make sure the server is running on :4000.</div>;
  if (!components) return <div className="p-8">Loading…</div>;

  const openSavedEstimate = (record) => {
    setIntake(record.intake);
    setEstimate(record.estimate);
    setShowHistory(false);
    setStep(2);
  };

  const newEstimate = () => {
    setIntake(null);
    setEstimate(null);
    setShowHistory(false);
    setStep(0);
  };

  // Bypass: jump straight into cage-only intake with project type pre-set
  const newCageQuote = () => {
    setIntake({
      _quick_cage: true,
      project_type: 'Cage Install (no turf)',
      no_turf: true,
      customer_name: '',
      project_address: '',
      product_name: '',
      total_sf: 0,
      narrow_dim_ft: '',
      long_dim_ft: '',
      yard_shape: 'squares',
      zones: [{ label: '', sf: '' }],
      attachments: [],
      notes: '',
      cage_config: null,
      supply_only: false,
      equipment_install_fee: '',
    });
    setEstimate(null);
    setShowHistory(false);
    setStep(0);
  };

  const navBtn = (active) =>
    `px-3 py-1.5 rounded-md text-sm font-semibold transition ${
      active
        ? 'bg-brand-action text-white shadow-sm ring-1 ring-brand-action/30'
        : 'text-brand-green hover:bg-brand-green/5'
    } disabled:opacity-40 disabled:cursor-not-allowed`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-brand-green/10 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <div className="text-xl font-bold text-brand-green tracking-tight">
              Bearcat Turf <span className="text-brand-action">·</span> Estimator
            </div>
            <div className="hidden md:block text-xs uppercase tracking-[0.14em] text-brand-green/50">
              Internal tool
            </div>
          </div>
          <nav className="flex gap-1.5 items-center flex-wrap">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => { setShowHistory(false); setStep(i); }}
                disabled={i > 0 && !intake}
                className={navBtn(!showHistory && i === step)}
              >
                {i + 1}. {s}
              </button>
            ))}
            <span className="text-brand-green/20 mx-1">·</span>
            <button onClick={() => setShowHistory(true)} className={navBtn(showHistory)}>
              📋 History
            </button>
            <button onClick={newEstimate} className={navBtn(false)}>
              + New
            </button>
            <button onClick={newCageQuote} title="Skip the full intake — cage-only quote"
              className="px-3 py-1.5 rounded-md text-sm font-semibold bg-brand-orange text-white shadow-sm transition hover:brightness-110">
              ⚾ Quick Cage
            </button>
            <Link to="/admin/partners" className={navBtn(false)}>
              🤝 Partners
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6">
        {showHistory ? (
          <EstimateHistory onOpen={openSavedEstimate} onClose={() => setShowHistory(false)} />
        ) : (
          <>
            {step === 0 && (
              <IntakeForm
                products={products}
                initial={intake}
                onSubmit={(data) => { setIntake(data); setStep(1); }}
              />
            )}
            {step === 1 && intake && (
              <EstimateBuilder
                intake={intake}
                products={products}
                components={components}
                onBack={() => setStep(0)}
                onComplete={(e) => { setEstimate(e); setStep(2); }}
              />
            )}
            {step === 2 && estimate && (
              <EstimateOutput
                estimate={estimate}
                intake={intake}
                company={components.company}
                onBack={() => setStep(1)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
