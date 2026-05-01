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

  return (
    <div className="min-h-screen">
      <header className="no-print bg-hunter text-offwhite px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">Bearcat Turf Estimator</div>
          <div className="text-sageMuted text-sm">Internal estimating tool</div>
        </div>
        <nav className="flex gap-2 items-center">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => { setShowHistory(false); setStep(i); }}
              disabled={i > 0 && !intake}
              className={`px-3 py-1 rounded text-sm ${
                !showHistory && i === step ? 'bg-burnt text-white' : 'bg-sage/30 text-offwhite hover:bg-sage/50'
              } disabled:opacity-40`}
            >
              {i + 1}. {s}
            </button>
          ))}
          <span className="text-sageMuted/50">·</span>
          <button
            onClick={() => setShowHistory(true)}
            className={`px-3 py-1 rounded text-sm ${showHistory ? 'bg-burnt text-white' : 'bg-sage/30 text-offwhite hover:bg-sage/50'}`}
          >
            📋 History
          </button>
          <button
            onClick={newEstimate}
            className="px-3 py-1 rounded text-sm bg-sage/30 text-offwhite hover:bg-sage/50"
          >
            + New
          </button>
          <button
            onClick={newCageQuote}
            title="Skip the full intake — go straight to a cage-only quote"
            className="px-3 py-1 rounded text-sm bg-burnt/80 text-white hover:bg-burnt"
          >
            ⚾ Quick Cage
          </button>
          <Link to="/admin/partners" className="px-3 py-1 rounded text-sm bg-sage/30 text-offwhite hover:bg-sage/50">
            🤝 Partners
          </Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto p-6">
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
