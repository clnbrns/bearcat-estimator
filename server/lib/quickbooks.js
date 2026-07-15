// QuickBooks Online integration: OAuth 2.0 + REST client + token persistence.
//
// Setup (one-time):
//   1. https://developer.intuit.com → Create App → choose "QuickBooks Online and Payments"
//   2. Add redirect URI:  https://estimate.bearcatturf.com/api/qb/callback
//      (and http://localhost:4000/api/qb/callback for local testing)
//   3. Copy Client ID + Client Secret into env vars QB_CLIENT_ID, QB_CLIENT_SECRET
//   4. Set QB_ENV=production (or "sandbox" while testing)
//   5. Visit /api/qb/connect → grant access → tokens persist to data/qb_tokens.json
//
// Token lifecycle:
//   - access_token   1 hour
//   - refresh_token  100 days, rotated on each refresh (we save the new one)
//
// Storage: tokens live in DATA_DIR/qb_tokens.json (gitignored). Single-tenant.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../data');
const TOKENS_PATH = path.join(DATA_DIR, 'qb_tokens.json');

const QB_ENV = (process.env.QB_ENV || 'production').toLowerCase();
const API_BASE = QB_ENV === 'sandbox'
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';

const OAUTH_AUTHORIZE = 'https://appcenter.intuit.com/connect/oauth2';
const OAUTH_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const OAUTH_REVOKE = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';

function clientCreds() {
  const id = process.env.QB_CLIENT_ID;
  const secret = process.env.QB_CLIENT_SECRET;
  if (!id || !secret) throw new Error('QB_CLIENT_ID and QB_CLIENT_SECRET must be set in env');
  return { id, secret };
}

function basicAuthHeader() {
  const { id, secret } = clientCreds();
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

// ── Token persistence ────────────────────────────────────
export async function loadTokens() {
  if (!existsSync(TOKENS_PATH)) return null;
  try { return JSON.parse(await readFile(TOKENS_PATH, 'utf8')); }
  catch { return null; }
}

async function saveTokens(t) {
  await writeFile(TOKENS_PATH, JSON.stringify(t, null, 2));
}

export async function clearTokens() {
  if (existsSync(TOKENS_PATH)) await writeFile(TOKENS_PATH, JSON.stringify({}));
}

export async function isConnected() {
  const t = await loadTokens();
  return !!(t && t.refresh_token && t.realm_id);
}

export async function connectionStatus() {
  const t = await loadTokens();
  if (!t || !t.refresh_token || !t.realm_id) return { connected: false };
  return {
    connected: true,
    env: QB_ENV,
    realm_id: t.realm_id,
    expires_at: t.expires_at,
    refresh_expires_at: t.refresh_expires_at,
    company_name: t.company_name || null,
  };
}

// ── OAuth flow ──────────────────────────────────────────
export function buildAuthorizeUrl(redirectUri, state) {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code, redirectUri, realmId }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader(),
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const tok = await res.json();
  const now = Date.now();
  const tokens = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    realm_id: realmId,
    expires_at: now + (tok.expires_in - 60) * 1000,        // 60s safety buffer
    refresh_expires_at: now + (tok.x_refresh_token_expires_in - 60) * 1000,
    obtained_at: new Date(now).toISOString(),
  };
  // Try to fetch company name for display; non-fatal if it fails
  try {
    const info = await rawApi(tokens, `/v3/company/${realmId}/companyinfo/${realmId}`);
    tokens.company_name = info?.CompanyInfo?.CompanyName || null;
  } catch { /* ignore */ }
  await saveTokens(tokens);
  return tokens;
}

// Intuit ROTATES the refresh token on every refresh. If two concurrent API
// calls both hit an expired access token and refresh independently, the loser
// persists a refresh token Intuit just invalidated and the integration dies
// until manual reconnect. Single-flight: concurrent callers share one refresh.
let inflightRefresh = null;
function refreshAccessToken(tokens) {
  if (!inflightRefresh) {
    inflightRefresh = doRefreshAccessToken(tokens)
      .finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

async function doRefreshAccessToken(tokens) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader(),
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  const tok = await res.json();
  const now = Date.now();
  const updated = {
    ...tokens,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || tokens.refresh_token, // refresh tokens rotate
    expires_at: now + (tok.expires_in - 60) * 1000,
    refresh_expires_at: now + (tok.x_refresh_token_expires_in - 60) * 1000,
  };
  await saveTokens(updated);
  return updated;
}

async function getValidTokens() {
  let tokens = await loadTokens();
  if (!tokens || !tokens.refresh_token) throw new Error('QuickBooks not connected. Visit /api/qb/connect first.');
  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshAccessToken(tokens);
  }
  return tokens;
}

// ── Low-level API call ──────────────────────────────────
async function rawApi(tokens, pathStr, { method = 'GET', body, query } = {}) {
  const url = new URL(API_BASE + pathStr);
  url.searchParams.set('minorversion', '70');
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Accept': 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`QB API ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

async function api(pathStr, opts = {}) {
  let tokens = await getValidTokens();
  try {
    return await rawApi(tokens, pathStr, opts);
  } catch (e) {
    if (e.status === 401) {
      tokens = await refreshAccessToken(tokens);
      return await rawApi(tokens, pathStr, opts);
    }
    throw e;
  }
}

// ── Public API helpers ──────────────────────────────────
export async function listCustomers({ limit = 1000 } = {}) {
  const tokens = await getValidTokens();
  const q = `select Id, DisplayName, PrimaryEmailAddr, PrimaryPhone, BillAddr from Customer where Active = true MAXRESULTS ${limit}`;
  const data = await api(`/v3/company/${tokens.realm_id}/query`, { query: { query: q } });
  return (data?.QueryResponse?.Customer || []).map(c => ({
    id: c.Id,
    display_name: c.DisplayName,
    email: c.PrimaryEmailAddr?.Address || '',
    phone: c.PrimaryPhone?.FreeFormNumber || '',
    address: c.BillAddr ? [c.BillAddr.Line1, c.BillAddr.City, c.BillAddr.CountrySubDivisionCode, c.BillAddr.PostalCode].filter(Boolean).join(', ') : '',
  }));
}

export async function findCustomerByName(displayName) {
  const tokens = await getValidTokens();
  const safe = displayName.replace(/'/g, "\\'");
  const q = `select Id, DisplayName from Customer where DisplayName = '${safe}'`;
  const data = await api(`/v3/company/${tokens.realm_id}/query`, { query: { query: q } });
  return data?.QueryResponse?.Customer?.[0] || null;
}

export async function createCustomer({ display_name, email, phone, address }) {
  const tokens = await getValidTokens();
  const body = { DisplayName: display_name };
  if (email) body.PrimaryEmailAddr = { Address: email };
  if (phone) body.PrimaryPhone = { FreeFormNumber: phone };
  if (address) body.BillAddr = { Line1: address };
  const data = await api(`/v3/company/${tokens.realm_id}/customer`, { method: 'POST', body });
  return data?.Customer;
}

export async function findOrCreateCustomer({ display_name, email, phone, address }) {
  if (!display_name) throw new Error('Customer name required');
  const existing = await findCustomerByName(display_name);
  if (existing) return existing;
  return createCustomer({ display_name, email, phone, address });
}

export async function listItems({ limit = 1000 } = {}) {
  const tokens = await getValidTokens();
  const q = `select Id, Name, Description, UnitPrice, Type, IncomeAccountRef from Item where Active = true MAXRESULTS ${limit}`;
  const data = await api(`/v3/company/${tokens.realm_id}/query`, { query: { query: q } });
  return (data?.QueryResponse?.Item || []).map(i => ({
    id: i.Id,
    name: i.Name,
    description: i.Description || '',
    unit_price: i.UnitPrice || 0,
    type: i.Type,
    income_account_ref: i.IncomeAccountRef?.value || null,
    income_account_name: i.IncomeAccountRef?.name || null,
  }));
}

// Get the first available income account for fallback item creation
async function defaultIncomeAccountRef() {
  const tokens = await getValidTokens();
  const q = `select Id, Name from Account where AccountType = 'Income' MAXRESULTS 1`;
  const data = await api(`/v3/company/${tokens.realm_id}/query`, { query: { query: q } });
  const acct = data?.QueryResponse?.Account?.[0];
  if (!acct) throw new Error('No income account found in QuickBooks. Create one before pushing estimates.');
  return { value: acct.Id, name: acct.Name };
}

let cachedFallbackItemId = null;
async function getOrCreateFallbackItem() {
  if (cachedFallbackItemId) return cachedFallbackItemId;
  const tokens = await getValidTokens();
  const q = `select Id from Item where Name = 'Bearcat Estimator Line'`;
  const data = await api(`/v3/company/${tokens.realm_id}/query`, { query: { query: q } });
  const existing = data?.QueryResponse?.Item?.[0];
  if (existing) { cachedFallbackItemId = existing.Id; return existing.Id; }
  const income = await defaultIncomeAccountRef();
  const created = await api(`/v3/company/${tokens.realm_id}/item`, {
    method: 'POST',
    body: {
      Name: 'Bearcat Estimator Line',
      Type: 'Service',
      IncomeAccountRef: income,
      Description: 'Generic line item for estimates pushed from Bearcat Estimator',
    },
  });
  cachedFallbackItemId = created?.Item?.Id;
  return cachedFallbackItemId;
}

/**
 * Push a saved estimate into QuickBooks as a QB Estimate object.
 *
 * @param {Object} record  Saved estimate record from data/estimates/<id>.json
 * @param {Object} [opts]
 * @param {string} [opts.qb_customer_id]  If known, skip lookup
 * @param {Object<string,string>} [opts.item_map]  Map of internal line.key → QB Item.Id
 * @param {string} [opts.summary_description]  AI-generated description; if provided, sent as a single line item
 * @param {boolean} [opts.summary_only=true]  If true, push as ONE summary line; else push every line
 */
export async function pushEstimate(record, opts = {}) {
  const tokens = await getValidTokens();
  const intake = record.intake || {};
  const estimate = record.estimate || record;
  const totals = estimate.totals || {};

  // 1. Find or create customer
  let customerId = opts.qb_customer_id;
  let customerRefName = intake.customer_name;
  if (!customerId) {
    if (!intake.customer_name) throw new Error('Estimate has no customer name to push.');
    const cust = await findOrCreateCustomer({
      display_name: intake.customer_name,
      address: intake.project_address,
    });
    customerId = cust.Id;
    customerRefName = cust.DisplayName;
  }

  // 2. Build line items
  const lines = [];
  const summaryOnly = opts.summary_only !== false;
  const fallbackItemId = await getOrCreateFallbackItem();

  if (summaryOnly) {
    // Single summary line — total of the whole estimate, with description
    const desc = opts.summary_description
      || `Bearcat Turf installation${intake.project_address ? ` at ${intake.project_address}` : ''}${intake.project_type ? ` (${intake.project_type})` : ''}`;
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: totals.final_price || totals.sell_price || 0,
      Description: desc.slice(0, 4000),  // QB caps at 4000
      SalesItemLineDetail: {
        ItemRef: { value: fallbackItemId },
        Qty: 1,
        UnitPrice: totals.final_price || totals.sell_price || 0,
      },
    });
  } else {
    // Per-line itemization (advanced — uses item_map if provided)
    const itemMap = opts.item_map || {};
    const margin = (totals.margin_pct || 30) / 100;
    for (const l of (estimate.lines || [])) {
      if (l.included || (l.cost || 0) <= 0) continue;
      const sellAmount = l.cost / (1 - margin);
      const itemId = itemMap[l.key] || fallbackItemId;
      lines.push({
        DetailType: 'SalesItemLineDetail',
        Amount: round2(sellAmount),
        Description: l.label.slice(0, 4000),
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: l.qty || 1,
          UnitPrice: round2(sellAmount / (l.qty || 1)),
        },
      });
    }
  }

  // 3. Build estimate body
  const body = {
    CustomerRef: { value: customerId, name: customerRefName },
    Line: lines,
    TxnDate: new Date().toISOString().slice(0, 10),
    PrivateNote: `Pushed from Bearcat Estimator${record.id ? ` · ${record.id}` : ''}`,
  };
  if (intake.project_address) {
    body.BillAddr = { Line1: intake.project_address };
    body.ShipAddr = { Line1: intake.project_address };
  }

  // 4. Push it
  const res = await api(`/v3/company/${tokens.realm_id}/estimate`, { method: 'POST', body });
  const created = res?.Estimate;
  return {
    qb_estimate_id: created?.Id,
    qb_doc_number: created?.DocNumber,
    qb_total: created?.TotalAmt,
    qb_customer_id: customerId,
    qb_customer_name: customerRefName,
    qb_link: `https://${QB_ENV === 'sandbox' ? 'sandbox.' : ''}qbo.intuit.com/app/estimate?txnId=${created?.Id}`,
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

export async function disconnect() {
  const t = await loadTokens();
  if (!t?.refresh_token) { await clearTokens(); return; }
  try {
    await fetch(OAUTH_REVOKE, {
      method: 'POST',
      headers: {
        'Authorization': basicAuthHeader(),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: t.refresh_token }),
    });
  } catch { /* ignore */ }
  await clearTokens();
}
