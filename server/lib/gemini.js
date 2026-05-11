// Thin Gemini REST client. Uses Node's built-in fetch (Node 18+).
// One job: send {system, user-parts} → get text back. Mirrors the shape
// of the old Anthropic helper so the call sites stay tiny.
//
// Env:
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, defaults to gemini-2.5-flash

const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * @param {Object} opts
 * @param {string} opts.system            System instruction text.
 * @param {Array}  opts.parts             Array of Gemini parts: {text} | {inline_data:{mime_type,data}}.
 * @param {number} [opts.maxOutputTokens] Optional output cap.
 * @param {string} [opts.model]           Override model.
 * @param {boolean} [opts.json]           If true, force structured JSON output.
 * @returns {Promise<{text:string, usage:any, model:string}>}
 */
export async function geminiGenerate({ system, parts, maxOutputTokens, model, json }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set. Add it to server/.env or your environment.');
  const useModel = model || process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const generationConfig = {};
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;
  if (json) generationConfig.responseMimeType = 'application/json';

  const body = {
    contents: [{ role: 'user', parts }],
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };

  const res = await fetch(ENDPOINT(useModel) + `?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned no text. Raw: ' + JSON.stringify(data).slice(0, 400));
  return { text, usage: data?.usageMetadata, model: useModel };
}

/** Convenience: build an inline_data part from a multer file. */
export function fileToPart(file) {
  return {
    inline_data: {
      mime_type: file.mimetype,
      data: file.buffer.toString('base64'),
    },
  };
}
