import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two data roots:
//
// - STATIC_DATA_DIR: read-only catalog + ruleset data that ships with the
//   code (products, components, cimarron, plants, rocks, partners-seed).
//   Always resolves to the repo's data/ dir so a deploy is the only way
//   to change pricing, components, or catalog SKUs. This file used to be
//   under DATA_DIR, which on Render meant new catalog files committed to
//   the repo never reached production because /var/data is persistent
//   and doesn't sync with git.
//
// - DATA_DIR: read/write store for user-generated data (estimates,
//   partner-jobs, qb_tokens). On Render this is the persistent disk at
//   /var/data so jobs and tokens survive deploys. Locally it falls back
//   to the repo's data/ dir for convenience.
const STATIC_DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : STATIC_DATA_DIR;
const ESTIMATES_DIR = path.join(DATA_DIR, 'estimates');

export async function loadProducts() {
  const raw = await readFile(path.join(STATIC_DATA_DIR, 'products.json'), 'utf8');
  return JSON.parse(raw).products;
}

export async function loadComponents() {
  const raw = await readFile(path.join(STATIC_DATA_DIR, 'components.json'), 'utf8');
  return JSON.parse(raw);
}

export async function loadCimarron() {
  const raw = await readFile(path.join(STATIC_DATA_DIR, 'cimarron.json'), 'utf8');
  return JSON.parse(raw).products;
}

// Plants — supplier catalogs stored as dated snapshots under
// data/plants/. Loads the most recent file by default; pass a
// filename to pin to a specific catalog (e.g. when re-pricing an
// old estimate against the catalog it was originally quoted on).
export async function loadPlants(catalogFile) {
  const dir = path.join(STATIC_DATA_DIR, 'plants');
  if (!existsSync(dir)) return { items: [], _source: null };
  let file = catalogFile;
  if (!file) {
    const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort().reverse();
    if (!files.length) return { items: [], _source: null };
    file = files[0];
  }
  const raw = await readFile(path.join(dir, file), 'utf8');
  const data = JSON.parse(raw);
  return { ...data, _catalog_file: file };
}

// Rocks — supplier catalogs stored as dated snapshots under data/rocks/.
// Same convention as plants: monthly refresh, never overwrite old files.
export async function loadRocks(catalogFile) {
  const dir = path.join(STATIC_DATA_DIR, 'rocks');
  if (!existsSync(dir)) return { items: [], _source: null };
  let file = catalogFile;
  if (!file) {
    const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort().reverse();
    if (!files.length) return { items: [], _source: null };
    file = files[0];
  }
  const raw = await readFile(path.join(dir, file), 'utf8');
  const data = JSON.parse(raw);
  return { ...data, _catalog_file: file };
}

export async function loadPartners() {
  const raw = await readFile(path.join(DATA_DIR, 'partners.json'), 'utf8');
  return JSON.parse(raw).partners;
}

export async function getPartner(slug) {
  const partners = await loadPartners();
  return partners.find(p => p.slug === slug && p.active);
}

export async function savePartners(partners) {
  await writeFile(path.join(DATA_DIR, 'partners.json'), JSON.stringify({
    _note: 'Partner accounts for the partner portal.',
    partners,
  }, null, 2));
}

const PARTNER_JOBS_DIR = path.join(DATA_DIR, 'partner-jobs');

export async function savePartnerJob(job) {
  if (!existsSync(PARTNER_JOBS_DIR)) await mkdir(PARTNER_JOBS_DIR, { recursive: true });
  const id = job.id || `pj_${Date.now()}`;
  const record = { ...job, id, submitted_at: new Date().toISOString(), status: job.status || 'pending' };
  await writeFile(path.join(PARTNER_JOBS_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

export async function listPartnerJobs() {
  if (!existsSync(PARTNER_JOBS_DIR)) return [];
  const files = await readdir(PARTNER_JOBS_DIR);
  const out = [];
  for (const f of files.filter(f => f.endsWith('.json'))) {
    const raw = await readFile(path.join(PARTNER_JOBS_DIR, f), 'utf8');
    out.push(JSON.parse(raw));
  }
  return out.sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''));
}

export async function saveEstimate(estimate) {
  if (!existsSync(ESTIMATES_DIR)) await mkdir(ESTIMATES_DIR, { recursive: true });
  const id = estimate.id || `est_${Date.now()}`;
  const record = { ...estimate, id, saved_at: new Date().toISOString() };
  await writeFile(path.join(ESTIMATES_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

export async function listEstimates() {
  if (!existsSync(ESTIMATES_DIR)) return [];
  const files = await readdir(ESTIMATES_DIR);
  const out = [];
  for (const f of files.filter(f => f.endsWith('.json'))) {
    const raw = await readFile(path.join(ESTIMATES_DIR, f), 'utf8');
    out.push(JSON.parse(raw));
  }
  return out.sort((a, b) => (b.saved_at || '').localeCompare(a.saved_at || ''));
}
