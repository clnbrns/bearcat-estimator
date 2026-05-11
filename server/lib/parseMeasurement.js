import { geminiGenerate, fileToPart } from './gemini.js';

const SYSTEM_PROMPT = `You are an estimating assistant for Bearcat Turf, an artificial turf installer in DFW, Texas. The user uploads PDF floor plans (often from CamToPlan iPhone app) or photos of yards. Extract everything useful for an installation estimate.

CamToPlan PDFs typically contain:
- A top-down 2D plan with walls drawn as line segments
- Dimensions labeled in feet/inches (e.g., 20'-3", 30'6")
- A total area in square feet (sq ft, sf, ft²)
- Sometimes multiple rooms/zones with labels
- Wall lengths around the perimeter

For PHOTOS of yards, identify: approximate area, existing surface (grass/dirt/patio/concrete), obstructions (trees, AC units, decks), slope cues, drainage features, edges/borders.

Return ONLY valid JSON in this exact shape — no markdown, no commentary:

{
  "zones": [
    { "label": "string", "narrow_ft": number, "long_ft": number, "sf": number }
  ],
  "total_sf": number,
  "perimeter_lf": number,
  "narrow_dim_ft": number,
  "long_dim_ft": number,
  "existing_surface": "grass|dirt|patio|concrete|mixed|unknown",
  "slope_noted": boolean,
  "drainage_notes": "string",
  "obstructions": "string",
  "scope_notes": "string",
  "confidence": {
    "total_sf": "high|medium|low",
    "dimensions": "high|medium|low",
    "overall": "high|medium|low"
  },
  "source_type": "measurement_pdf|photo|drawing"
}

Rules:
- If only ONE zone, set narrow_dim_ft and long_dim_ft to that zone's dimensions.
- If multiple zones, narrow_dim_ft/long_dim_ft = the LARGEST zone's dimensions; total_sf = sum of all zones.
- For dimensions like 20'-3", convert to decimal feet (20.25).
- If a value is not present in the document, use 0 (numbers) or "" (strings) — do not invent.
- "high" confidence = directly stated; "medium" = inferred from drawing scale; "low" = guess.
- Photos always = "low" confidence on dimensions unless a measurement reference is visible.`;

export async function parseMeasurement(files) {
  // Gemini accepts both PDFs and images as inline_data parts.
  const parts = files
    .filter((f) => f.mimetype === 'application/pdf' || f.mimetype.startsWith('image/'))
    .map(fileToPart);
  parts.push({ text: 'Extract estimate data from these documents and return the JSON described in your instructions.' });

  const { text, usage, model } = await geminiGenerate({
    system: SYSTEM_PROMPT,
    parts,
    maxOutputTokens: 8000,
    json: true,
  });

  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    // Fallback: pull first {...} block in case the model wrapped it
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); }
      catch (e2) { throw new Error('Model returned invalid JSON: ' + e2.message + ' — raw: ' + text.slice(0, 400)); }
    } else {
      throw new Error('Model returned invalid JSON: ' + e.message + ' — raw: ' + text.slice(0, 400));
    }
  }

  // Round all square-foot values UP to the nearest 10 to match crew ordering practice
  const roundUp10 = (n) => (typeof n === 'number' && n > 0) ? Math.ceil(n / 10) * 10 : n;
  if (parsed.total_sf) parsed.total_sf = roundUp10(parsed.total_sf);
  if (Array.isArray(parsed.zones)) {
    parsed.zones = parsed.zones.map((z) => ({ ...z, sf: roundUp10(z.sf) }));
  }

  return {
    ...parsed,
    _model: model,
    _file_count: files.length,
    _usage: usage,
  };
}
