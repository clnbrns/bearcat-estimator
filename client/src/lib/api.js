const base = '';

export async function getProducts() {
  const r = await fetch(`${base}/api/products`);
  return r.json();
}

export async function getComponents() {
  const r = await fetch(`${base}/api/components`);
  return r.json();
}

export async function calcEstimate(input) {
  const r = await fetch(`${base}/api/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Calc failed');
  return r.json();
}

export async function saveEstimate(estimate) {
  const r = await fetch(`${base}/api/estimates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(estimate),
  });
  return r.json();
}

export async function listEstimates() {
  const r = await fetch(`${base}/api/estimates`);
  return r.json();
}

export async function getPartner(slug) {
  const r = await fetch(`${base}/api/partners/${slug}`);
  if (!r.ok) throw new Error((await r.json()).error || 'Partner not found');
  return r.json();
}

export async function listPartners() {
  const r = await fetch(`${base}/api/partners`);
  return r.json();
}

export async function savePartners(partners) {
  const r = await fetch(`${base}/api/partners`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partners }),
  });
  return r.json();
}

export async function submitPartnerJob(job) {
  const r = await fetch(`${base}/api/partner-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Submit failed');
  return r.json();
}

export async function listPartnerJobs() {
  const r = await fetch(`${base}/api/partner-jobs`);
  return r.json();
}

export async function appendToVoiceCorpus(description, estimate_id) {
  const r = await fetch(`${base}/api/voice-corpus/append`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, estimate_id }),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Append failed');
  return r.json();
}

export async function generateQuickbooksDescription(estimate, intake) {
  const r = await fetch(`${base}/api/quickbooks-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estimate, intake }),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Description generation failed');
  return r.json();
}

export async function generateProjectPlan(estimate, intake) {
  const r = await fetch(`${base}/api/project-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estimate, intake }),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Plan generation failed');
  return r.json();
}

export async function parseVoiceIntake(transcript) {
  const r = await fetch(`${base}/api/parse-voice-intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Voice parse failed');
  return r.json();
}

export async function parseMeasurement(files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const r = await fetch(`${base}/api/parse-measurement`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error((await r.json()).error || 'Parse failed');
  return r.json();
}

export const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
