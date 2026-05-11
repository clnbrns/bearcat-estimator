import { geminiGenerate } from './gemini.js';

const SYSTEM_PROMPT = `You write bilingual (English + Spanish) project plans for the install crew at Bearcat Turf, an artificial turf installer in DFW, Texas.

You will receive structured estimate data (customer info, dimensions, materials, line items). Produce a project plan the crew leader can read on his phone before arriving on site.

CRITICAL RULES:
- DO NOT include any pricing, costs, margin, profit, or sell prices. Crew should never see money.
- DO include all material quantities, dimensions, and scope details.
- Write a clear sequential walkthrough: arrival → site prep → base → install → finish.
- Use measurement units the crew uses: feet, inches, yards (CY), linear feet (LF), bags, boxes, sticks.
- Spanish translation must be Mexican/Latin American Spanish (the working dialect of US construction crews), not Castilian.
- Keep tone direct and operational. No marketing language.

Output JSON ONLY in this shape (no markdown wrapping):
{
  "title": "string (e.g. 'Smith Residence — 1,400 SF Backyard')",
  "english": {
    "summary": "1-2 sentence overview",
    "site_address": "string",
    "materials": ["string", ...],
    "tools_needed": ["string", ...],
    "steps": [
      { "phase": "Arrival & Setup", "tasks": ["string", ...] },
      { "phase": "Site Prep", "tasks": ["string", ...] },
      { "phase": "Base Installation", "tasks": ["string", ...] },
      { "phase": "Turf Installation", "tasks": ["string", ...] },
      { "phase": "Finish & Cleanup", "tasks": ["string", ...] }
    ],
    "scope_notes": "string",
    "warnings": ["string", ...]
  },
  "spanish": { "summary": "...", "site_address": "...", "materials": [...], "tools_needed": [...], "steps": [...], "scope_notes": "...", "warnings": [...] }
}`;

export async function generateProjectPlan(estimate, intake) {
  // Strip pricing from line items before sending to model
  const safeLines = (estimate.lines || []).map((l) => ({
    item: l.label,
    quantity: l.qty,
    unit: l.unit,
  }));

  const payload = {
    customer: intake.customer_name,
    address: intake.project_address || '(not provided)',
    project_type: intake.project_type,
    yard_shape: intake.yard_shape,
    total_sf: intake.total_sf,
    narrow_dim_ft: intake.narrow_dim_ft,
    long_dim_ft: intake.long_dim_ft,
    zones: intake.zones,
    product: estimate.input?.product_name,
    notes: intake.notes,
    putting_green_sf: estimate.input?.putting_green_sf || 0,
    perimeter_lf: estimate.perimeter_lf,
    flex_base_yards: estimate.flex_base_yards,
    line_items_no_pricing: safeLines,
  };

  const { text } = await geminiGenerate({
    system: SYSTEM_PROMPT,
    parts: [{ text: `Generate a bilingual project plan for the crew leader from this estimate data:\n\n${JSON.stringify(payload, null, 2)}` }],
    maxOutputTokens: 4000,
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in plan response: ' + text.slice(0, 200));
  return JSON.parse(jsonMatch[0]);
}
