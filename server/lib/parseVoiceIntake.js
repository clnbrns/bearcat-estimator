import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT = `You convert a crew leader's spoken description of a turf job into a structured intake JSON. The user is at Bearcat Turf in DFW, Texas — they walk a yard, talk into their phone, and you extract everything they said.

Listen for:
- Customer name ("Smith family", "the Joneses", "Mrs. Garcia", etc.)
- Address or location ("over on Aledo Road", "523 Maple", "the one near the school")
- Project type (residential, pet, putting green, batting cage, playground, commercial, cage install)
- Square footage ("about 1,500 square feet", "fifteen hundred", "around 2k", "1500 SF")
- Dimensions ("30 by 50", "twenty wide and forty long")
- Yard shape (squares/rectangles vs curves/irregular — listen for words like "kidney shaped", "curves around the pool", "rectangle", "L-shape")
- Turf preference ("Bermuda Pro", "TH Play", "putting green turf", "the cheap one", "premium")
- Scope notes (slope, drainage, obstructions, access issues, special asks)

Return ONLY valid JSON in this exact shape — no markdown wrapping, no commentary:

{
  "customer_name": "string",
  "project_address": "string",
  "project_type": "Residential | Pet Turf | Putting Green | Batting Cage - Turf Only | Batting Cage - Full Cage | Cage Install (no turf) | Sports Field | Playground | Commercial | Other",
  "total_sf": number,
  "narrow_dim_ft": number,
  "long_dim_ft": number,
  "yard_shape": "squares | curves",
  "product_name": "string (one of the Bearcat product names if mentioned, else empty string)",
  "notes": "string (everything else worth capturing)",
  "confidence": "high | medium | low",
  "_raw_understanding": "1-2 sentence summary of what you heard, in your own words"
}

Rules:
- If a field isn't mentioned, use 0 for numbers, empty string for strings.
- Convert spoken numbers ("fifteen hundred") to digits (1500).
- Round square footage UP to the nearest 10.
- "Squares" yards include rectangles, L-shapes, anything mostly straight-edged.
- "Curves" includes kidney shapes, irregular polygons, curves around pools or planter beds.
- Default project_type to "Residential" if unclear.
- "high" confidence = explicit, clear values. "medium" = inferred. "low" = guessed.`;

export async function parseVoiceIntake(transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set.');
  if (!transcript || transcript.trim().length < 5) throw new Error('Transcript too short to parse.');

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Spoken description from the field:\n\n"${transcript}"\n\nExtract the structured intake JSON.` }],
  });

  const text = resp.content.find(c => c.type === 'text')?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in model response: ' + text.slice(0, 200));

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (e) { throw new Error('Model returned invalid JSON: ' + e.message); }

  // Round SF up to nearest 10 (matches PDF parser behavior)
  if (typeof parsed.total_sf === 'number' && parsed.total_sf > 0) {
    parsed.total_sf = Math.ceil(parsed.total_sf / 10) * 10;
  }
  return { ...parsed, _model: MODEL, _transcript: transcript };
}
