# Bearcat Turf Estimator

Full-stack estimating app for Bearcat Turf (DFW). Customer intake → cost calc → printable estimate.

## Phase 1 status (this build)

- ✅ Intake form (customer, project type, SF, zones, product, notes)
- ✅ Editable cost database (`data/products.json`, `data/components.json`)
- ✅ Live estimate builder (margin slider, includes toggles, French drain, card fee)
- ✅ Tier preview (Good / Better / Best)
- ✅ Printable customer-facing estimate (browser "Save as PDF")
- ✅ Save estimate to `data/estimates/`

## Not yet built (later phases)

- Phase 2: AI photo/PDF parsing (Claude API) to pre-fill intake
- Phase 3: Estimate history list + duplicate/edit + CSV export
- Phase 4: Settings/Admin panel for editing cost defaults in-app
- Phase 5: QuickBooks integration (see notes below)

## Setup

```bash
cd bearcat-estimator
npm install --prefix server
npm install --prefix client
```

## Run

In two terminals:

```bash
npm run dev:server   # API on :4000
npm run dev:client   # UI on :5173
```

Or with one command (requires root deps installed):

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Editing prices

All pricing lives in JSON files. **No code changes needed.**

- `data/products.json` — turf products and per-SF cost. Add/remove freely.
- `data/components.json` — install components, default margin, card fee, company info.

After editing, restart the server (or it'll re-read on next request — files are read on every API call).

## Project layout

```
client/        # React + Vite + Tailwind frontend
server/        # Express API
data/
  products.json     # editable turf cost database
  components.json   # editable install component costs + settings
  estimates/        # saved estimates (one JSON per estimate)
output/        # reserved for generated PDFs (Phase 5)
```

## API endpoints

- `GET  /api/products` — list turf products
- `GET  /api/components` — install components + settings + company info
- `POST /api/estimate` — calculate estimate from input (no save)
- `POST /api/estimates` — save an estimate
- `GET  /api/estimates` — list saved estimates

## Brand colors

| Name           | Hex       |
|----------------|-----------|
| Hunter green   | `#1b3d24` |
| Burnt orange   | `#c85c18` |
| Off-white      | `#f5f0e8` |
| Sage           | `#8ab898` |
| Muted sage     | `#c2d4c8` |
