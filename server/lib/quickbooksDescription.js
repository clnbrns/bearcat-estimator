import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geminiGenerate } from './gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.resolve(__dirname, '../../data/voice_corpus.json');

let cachedCorpus = null;
async function loadCorpus() {
  if (cachedCorpus) return cachedCorpus;
  const raw = await readFile(CORPUS_PATH, 'utf8');
  cachedCorpus = JSON.parse(raw);
  return cachedCorpus;
}

// Append a description to the voice corpus so future generations get smarter
// over time. Dedupes against existing examples (case-insensitive prefix match).
export async function appendToCorpus(description, meta = {}) {
  if (!description || description.trim().length < 50) {
    throw new Error('Description too short to add to corpus (minimum 50 chars).');
  }
  const corpus = await loadCorpus();
  const trimmed = description.trim();
  // Dedupe: skip if first 80 chars (case-insensitive) already exist
  const head = trimmed.slice(0, 80).toLowerCase();
  const exists = (corpus.examples || []).some((e) => e.toLowerCase().includes(head));
  if (exists) {
    return { added: false, reason: 'Already in corpus (duplicate detected).', total: corpus.examples.length };
  }
  // Newest first so few-shot picks the most recent (likely most representative)
  corpus.examples = [trimmed, ...(corpus.examples || [])];
  corpus._count = corpus.examples.length;
  corpus._last_appended_at = new Date().toISOString();
  if (meta.estimate_id) corpus._last_appended_from = meta.estimate_id;
  await writeFile(CORPUS_PATH, JSON.stringify(corpus, null, 2));
  cachedCorpus = corpus;
  return { added: true, total: corpus.examples.length };
}

const SYSTEM_PROMPT = `You write QuickBooks line-item descriptions for Bearcat Turf, a DFW artificial turf installer. The user pastes your output directly into QuickBooks.

VOICE & STYLE:
- Match the writing style of the example descriptions provided.
- Use Bearcat's actual terminology: "Provide and install", "compacted, crushed recycled concrete base", "15-year weed barrier", "silica sand infill", "secure seams", "cut-in edges", "laser grading", etc.
- Be specific about dimensions, materials, and quantities — that's what crews + customers expect.
- Note customer-supplied items explicitly ("customer-supplied", "existing", etc.).
- Mention warranties when applicable.
- Close with "All labor, materials, and cleanup included." or similar wrap-up if appropriate.
- If the project has multiple options or significant edge cases, note them inline.

LENGTH:
- 4–8 sentences typical.
- Single-paragraph prose. No bullet lists, no headings, no markdown.

OUTPUT:
- Plain text only. No quotation marks around the description, no preamble, no commentary, no JSON.
- Just the description, ready to paste into QuickBooks.`;

export async function generateQuickbooksDescription(estimate, intake) {
  const corpus = await loadCorpus();
  // Use top 8 examples (most varied) as few-shot
  const examples = (corpus.examples || []).slice(0, 8).map((e, i) => `EXAMPLE ${i + 1}:\n${e}`).join('\n\n');

  // Strip pricing from line items — descriptions describe SCOPE, not money
  const safeLines = (estimate.lines || [])
    .filter((l) => !l.cimarron) // leave Cimarron items aside; mention manually
    .map((l) => `${l.label} — ${l.qty} ${l.unit}`)
    .join('\n');
  const cimarronLines = (estimate.lines || [])
    .filter((l) => l.cimarron)
    .map((l) => `${l.label} (qty ${l.qty})`)
    .join('\n');

  const project = {
    customer: intake.customer_name,
    address: intake.project_address || '(not provided)',
    project_type: intake.project_type,
    yard_shape: intake.yard_shape,
    total_sf: intake.total_sf,
    narrow_dim_ft: intake.narrow_dim_ft,
    long_dim_ft: intake.long_dim_ft,
    zones: intake.zones,
    product: estimate.input?.product_name || '(no turf — equipment install)',
    notes: intake.notes,
    putting_green_sf: estimate.input?.putting_green_sf || 0,
    perimeter_lf: estimate.perimeter_lf,
    flex_base_yards: estimate.flex_base_yards,
    supply_only: estimate.input?.supply_only || false,
    no_turf: estimate.input?.no_turf || false,
    line_items_no_pricing: safeLines,
    cimarron_equipment: cimarronLines,
  };

  const userMsg = `Here are real Bearcat description examples for voice/style:

${examples}

---

Now write a QuickBooks description for this NEW project. Match the voice + format of the examples above. Return ONLY the description text.

PROJECT DATA:
${JSON.stringify(project, null, 2)}`;

  const { text, model } = await geminiGenerate({
    system: SYSTEM_PROMPT,
    parts: [{ text: userMsg }],
    maxOutputTokens: 1000,
  });

  return { description: text.trim(), _model: model, _example_count: Math.min(8, corpus.examples.length) };
}
