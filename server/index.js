import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// .env self-loader — runs BEFORE any module reads process.env. Always wins
// against inherited shell vars (Node's --env-file does not). This fixes the
// "parent shell exports empty GEMINI_API_KEY" footgun once and for all.
(function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(here, '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, key, val] = m;
    // Strip surrounding quotes if present
    val = val.replace(/^["']|["']$/g, '');
    if (val) process.env[key] = val; // override
  }
})();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { loadProducts, loadComponents, loadCimarron, saveEstimate, listEstimates, loadPartners, getPartner, savePartners, savePartnerJob, listPartnerJobs } from './lib/data.js';
import { calculateEstimate } from './lib/calculate.js';
import { parseMeasurement } from './lib/parseMeasurement.js';
import { parseVoiceIntake } from './lib/parseVoiceIntake.js';
import { generateProjectPlan } from './lib/projectPlan.js';
import { generateQuickbooksDescription, appendToCorpus } from './lib/quickbooksDescription.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── HTTP Basic Auth ─────────────────────────────────────
// Set APP_USER and APP_PASS in env to enable. /api/health is registered
// above so Render's health check doesn't need credentials.
const APP_USER = process.env.APP_USER;
const APP_PASS = process.env.APP_PASS;
if (APP_USER && APP_PASS) {
  app.use((req, res, next) => {
    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Basic ')) {
      const [u, p] = Buffer.from(hdr.slice(6), 'base64').toString().split(':');
      if (u === APP_USER && p === APP_PASS) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Bearcat Estimator"');
    res.status(401).send('Authentication required');
  });
  console.log('Basic auth enabled');
} else {
  console.log('⚠️  APP_USER/APP_PASS not set — running with NO auth (dev only)');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 5 }, // 20 MB per file, up to 5 files
});

app.get('/api/products', async (_req, res, next) => {
  try { res.json(await loadProducts()); } catch (e) { next(e); }
});

app.get('/api/components', async (_req, res, next) => {
  try { res.json(await loadComponents()); } catch (e) { next(e); }
});

app.get('/api/cimarron', async (_req, res, next) => {
  try { res.json(await loadCimarron()); } catch (e) { next(e); }
});

// ── Partner portal endpoints ─────────────────────────────
app.get('/api/partners', async (_req, res, next) => {
  try { res.json(await loadPartners()); } catch (e) { next(e); }
});

app.get('/api/partners/:slug', async (req, res, next) => {
  try {
    const p = await getPartner(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Partner not found or inactive' });
    res.json(p);
  } catch (e) { next(e); }
});

app.put('/api/partners', async (req, res, next) => {
  try {
    await savePartners(req.body.partners || []);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/partner-jobs', async (req, res, next) => {
  try {
    const partner = await getPartner(req.body.partner_slug);
    if (!partner) return res.status(400).json({ error: 'Invalid partner' });
    const job = await savePartnerJob(req.body);
    res.json(job);
  } catch (e) { next(e); }
});

app.get('/api/partner-jobs', async (_req, res, next) => {
  try { res.json(await listPartnerJobs()); } catch (e) { next(e); }
});

app.post('/api/estimate', async (req, res, next) => {
  try {
    const [products, components, cimarron] = await Promise.all([loadProducts(), loadComponents(), loadCimarron()]);
    res.json(calculateEstimate(req.body, products, components, cimarron));
  } catch (e) { next(e); }
});

app.post('/api/estimates', async (req, res, next) => {
  try { res.json(await saveEstimate(req.body)); } catch (e) { next(e); }
});

app.get('/api/estimates', async (_req, res, next) => {
  try { res.json(await listEstimates()); } catch (e) { next(e); }
});

app.post('/api/parse-voice-intake', async (req, res, next) => {
  try {
    const { transcript } = req.body || {};
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    const result = await parseVoiceIntake(transcript);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/parse-measurement', upload.array('files', 5), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const result = await parseMeasurement(req.files);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/quickbooks-description', async (req, res, next) => {
  try {
    const { estimate, intake } = req.body || {};
    if (!estimate || !intake) return res.status(400).json({ error: 'estimate and intake required' });
    const result = await generateQuickbooksDescription(estimate, intake);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/voice-corpus/append', async (req, res, next) => {
  try {
    const { description, estimate_id } = req.body || {};
    if (!description) return res.status(400).json({ error: 'description required' });
    const result = await appendToCorpus(description, { estimate_id });
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/project-plan', async (req, res, next) => {
  try {
    const { estimate, intake } = req.body || {};
    if (!estimate || !intake) return res.status(400).json({ error: 'estimate and intake required' });
    const plan = await generateProjectPlan(estimate, intake);
    res.json(plan);
  } catch (e) { next(e); }
});

// ── Serve built React app (single-service deploy) ───────
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback for non-API routes
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Bearcat Estimator API on :${PORT}`));
