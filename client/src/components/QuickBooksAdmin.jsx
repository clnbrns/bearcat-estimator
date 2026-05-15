import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { qbStatus, qbDisconnect, qbCustomers, qbItems } from '../lib/api.js';

export default function QuickBooksAdmin() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try { setStatus(await qbStatus()); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const loadCustomers = async () => {
    setError(null);
    try { setCustomers(await qbCustomers()); } catch (e) { setError(e.message); }
  };
  const loadItems = async () => {
    setError(null);
    try { setItems(await qbItems()); } catch (e) { setError(e.message); }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? You\'ll need to re-authorize to push estimates.')) return;
    await qbDisconnect();
    setCustomers(null); setItems(null);
    await refresh();
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-hunter">QuickBooks Integration</h1>
        <Link to="/" className="text-sm text-burnt hover:underline">← Back to estimator</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">⚠ {error}</div>}

      {!status?.connected ? (
        <div className="card p-6 space-y-3">
          <div className="text-lg font-semibold text-hunter">Not connected</div>
          <p className="text-sm text-hunter/70">
            Connect your QuickBooks account to push estimates directly from the app and auto-populate
            the customer dropdown from your QB customer list.
          </p>
          <a href="/api/qb/connect" className="btn-action inline-block">Connect QuickBooks</a>
          <details className="text-xs text-hunter/60 mt-4">
            <summary className="cursor-pointer hover:text-hunter">First-time setup checklist</summary>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>Register a free app at <a href="https://developer.intuit.com" target="_blank" rel="noreferrer" className="text-burnt underline">developer.intuit.com</a></li>
              <li>Add redirect URI: <code className="bg-sageMuted/30 px-1 rounded">{window.location.origin}/api/qb/callback</code></li>
              <li>Copy Client ID + Secret into <code className="bg-sageMuted/30 px-1 rounded">QB_CLIENT_ID</code> + <code className="bg-sageMuted/30 px-1 rounded">QB_CLIENT_SECRET</code> env vars (Render dashboard → Environment)</li>
              <li>Set <code className="bg-sageMuted/30 px-1 rounded">QB_ENV=production</code> (or sandbox while testing)</li>
              <li>Click "Connect QuickBooks" above</li>
            </ol>
          </details>
        </div>
      ) : (
        <div className="card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-hunter">✓ Connected</div>
              <div className="text-sm text-hunter/70">
                {status.company_name && <span><strong>{status.company_name}</strong> · </span>}
                Realm <code className="text-xs">{status.realm_id}</code> · {status.env}
              </div>
            </div>
            <button onClick={disconnect} className="btn-ghost">Disconnect</button>
          </div>
          <div className="text-xs text-hunter/60">
            Access token expires {new Date(status.expires_at).toLocaleString()} (auto-refreshed).
            Refresh token good through {new Date(status.refresh_expires_at).toLocaleDateString()}.
          </div>
        </div>
      )}

      {status?.connected && (
        <>
          <div className="card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-hunter">Customers</div>
                <div className="text-xs text-hunter/60">Pulled from QB · used to populate the customer dropdown on intake.</div>
              </div>
              <button onClick={loadCustomers} className="btn-ghost">{customers ? 'Refresh' : 'Load'}</button>
            </div>
            {customers && (
              <div className="text-sm">
                <div className="mb-2 text-hunter/70">{customers.length} customer{customers.length === 1 ? '' : 's'}</div>
                <div className="max-h-64 overflow-y-auto border border-sageMuted rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-sageMuted/20 sticky top-0">
                      <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Email</th><th className="text-left p-2">Phone</th></tr>
                    </thead>
                    <tbody>
                      {customers.slice(0, 100).map(c => (
                        <tr key={c.id} className="border-t border-sageMuted/30">
                          <td className="p-2">{c.display_name}</td>
                          <td className="p-2 text-hunter/60">{c.email}</td>
                          <td className="p-2 text-hunter/60">{c.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {customers.length > 100 && <div className="p-2 text-xs text-hunter/50 italic">…and {customers.length - 100} more</div>}
                </div>
              </div>
            )}
          </div>

          <div className="card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-hunter">Items / Products</div>
                <div className="text-xs text-hunter/60">QB Product/Service items. Pushed estimates currently use a single "Bearcat Estimator Line" item — per-line mapping is a future upgrade.</div>
              </div>
              <button onClick={loadItems} className="btn-ghost">{items ? 'Refresh' : 'Load'}</button>
            </div>
            {items && (
              <div className="text-sm">
                <div className="mb-2 text-hunter/70">{items.length} item{items.length === 1 ? '' : 's'}</div>
                <div className="max-h-64 overflow-y-auto border border-sageMuted rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-sageMuted/20 sticky top-0">
                      <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Type</th><th className="text-right p-2">Unit Price</th><th className="text-left p-2">Income Account</th></tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 100).map(i => (
                        <tr key={i.id} className="border-t border-sageMuted/30">
                          <td className="p-2">{i.name}</td>
                          <td className="p-2 text-hunter/60">{i.type}</td>
                          <td className="p-2 text-right">{i.unit_price ? `$${i.unit_price.toFixed(2)}` : '—'}</td>
                          <td className="p-2 text-hunter/60">{i.income_account_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
